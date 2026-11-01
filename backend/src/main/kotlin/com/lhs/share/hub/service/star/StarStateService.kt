package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarStateRestoreRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutCurrentResponse
import com.lhs.share.hub.controller.star.response.StarRecoveryPointResponse
import com.lhs.share.hub.controller.star.response.StarRecoverySummary
import com.lhs.share.hub.controller.star.response.StarStateCommandResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.repository.entity.snapshot
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@Service
class StarStateService(
    private val states: StarStateCurrentRepository,
    private val recoveryPoints: StarRecoveryPointRepository,
    private val loadouts: StarLoadoutCurrentRepository,
    private val operators: OperatorCurrentRepository,
    private val accounts: SubAccountService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun current(userId: String, accountId: String): StarStateCurrentResponse {
        accounts.requireAccount(userId, accountId)
        return states.findByUserIdAndAccountId(userId, accountId)
            ?.let(StarStateCurrentResponse::of) ?: StarStateCurrentResponse.empty(accountId)
    }

    fun patch(
        userId: String,
        accountId: String,
        request: StarStatePatchRequest,
        expectedLoadoutRevision: Long? = null,
        recoveryReason: String? = null,
    ): StarStateCommandResponse {
        accounts.requireAccount(userId, accountId)
        val expectedGeneration = nonNegative(request.expectedGeneration, "expected_generation")
        val expectedRevision = nonNegative(request.expectedRevision, "expected_revision")
        return starCasConflictBoundary({ throw currentConflict(userId, accountId, expectedGeneration) }) {
            requireNotNull(
                transactions.execute {
                    val current = states.findByUserIdAndAccountId(userId, accountId)
                    checkVersion(current, expectedGeneration, expectedRevision)
                    if (expectedLoadoutRevision != null &&
                        expectedLoadoutRevision != (loadouts.findByUserIdAndAccountId(userId, accountId)?.revision ?: 0L)
                    ) {
                        throw InventoryApiException(HttpStatus.CONFLICT, "star_loadout_conflict", "佩戴关系已变化，请重新核对")
                    }
                    val incomingIds = request.inventory?.map { it.instanceId }?.toSet().orEmpty()
                    val removedIds = current?.inventory.orEmpty().map { it.instanceId }.toSet() - incomingIds
                    val next =
                        normalize(
                            request.inventory,
                            request.planTargets?.filterKeys {
                                it !in removedIds
                            },
                            request.experience,
                            request.bag,
                            current?.inventory.orEmpty(),
                        )
                    val oldKinds = current?.inventory.orEmpty().associate { it.instanceId to it.kind }
                    if (next.inventory.any { oldKinds[it.instanceId]?.let { oldKind -> oldKind != it.kind } == true }) {
                        throw invalid("Changing a star's kind in place is not allowed; delete and create a new instance")
                    }
                    val now = Instant.now()
                    val point = if (recoveryReason != null && current != null && current.snapshot() != next) {
                        checkpoint(userId, accountId, current, recoveryReason, null, now)
                    } else {
                        null
                    }
                    val saved = if (current?.snapshot() == next || current == null && next == emptySnapshot()) {
                        current
                    } else {
                        save(userId, accountId, expectedGeneration, expectedRevision, expectedGeneration, next, now)
                    }
                    val pruned = reconcileLoadout(userId, accountId, next.inventory, now)
                    StarStateCommandResponse(
                        stateResponse(saved, accountId),
                        loadoutResponse(pruned, accountId),
                        point?.let(StarRecoveryPointResponse::of),
                    )
                },
            )
        }
    }

    fun rebuild(userId: String, accountId: String, request: StarStateRebuildRequest): StarStateCommandResponse {
        accounts.requireAccount(userId, accountId)
        val expectedGeneration = nonNegative(request.expectedGeneration, "expected_generation")
        val expectedRevision = nonNegative(request.expectedRevision, "expected_revision")
        val reason = request.reason ?: throw invalid("reason is required")
        if (reason !in setOf("pre_ocr_rebuild", "import_data_safety", "restore_local")) throw invalid("Unknown rebuild reason")
        val next = normalize(request.inventory, request.planTargets, request.experience, request.bag)
        if (reason == "pre_ocr_rebuild" && next.planTargets.isNotEmpty()) throw invalid("OCR rebuild must clear plan targets")
        return starCasConflictBoundary({ throw currentConflict(userId, accountId, expectedGeneration) }) {
            requireNotNull(
                transactions.execute {
                    val current = states.findByUserIdAndAccountId(userId, accountId)
                    checkVersion(current, expectedGeneration, expectedRevision)
                    val now = Instant.now()
                    val point = current?.let {
                        checkpoint(
                            userId,
                            accountId,
                            it,
                            if (reason ==
                                "restore_local"
                            ) {
                                "restore_safety"
                            } else {
                                reason
                            },
                            request.recoveryPointId,
                            now,
                        )
                    }
                    val saved = save(userId, accountId, expectedGeneration, expectedRevision, expectedGeneration + 1, next, now)
                    val existingLoadouts = loadouts.findByUserIdAndAccountId(userId, accountId)?.loadouts.orEmpty()
                    val kept = if (reason == "restore_local") {
                        filterLoadouts(
                            existingLoadouts,
                            next.inventory,
                            operatorIds(userId, accountId, accounts.requireAccount(userId, accountId).game),
                        )
                    } else {
                        null
                    }
                    val updatedLoadout = replaceLoadout(userId, accountId, expectedGeneration + 1, kept?.loadouts.orEmpty(), now)
                    val summary = kept?.let {
                        StarRecoverySummary(
                            restoredOperators = it.loadouts.count { loadout -> loadout.slots.values().any { slot -> slot.second != null } },
                            restoredSlots = it.loadouts.sumOf { loadout -> loadout.slots.values().count { slot -> slot.second != null } },
                            skippedOperators = it.missingOperators.size,
                            skippedSlots = it.skippedOperatorSlots,
                            skippedOperatorIds = it.missingOperators,
                            skippedInvalidSlots = it.skippedInvalidSlots,
                            historicalLoadoutAvailable = false,
                        )
                    }
                    StarStateCommandResponse(
                        StarStateCurrentResponse.of(saved),
                        StarLoadoutCurrentResponse.of(updatedLoadout),
                        point?.let(StarRecoveryPointResponse::of),
                        summary,
                    )
                },
            )
        }
    }

    fun recoveryPoints(userId: String, accountId: String): List<StarRecoveryPointResponse> {
        accounts.requireAccount(userId, accountId)
        return recoveryPoints.findTop3ByUserIdAndAccountIdOrderByCreatedAtDescIdDesc(userId, accountId).map(StarRecoveryPointResponse::of)
    }

    fun restore(userId: String, accountId: String, pointId: String, request: StarStateRestoreRequest): StarStateCommandResponse {
        val account = accounts.requireAccount(userId, accountId)
        val expectedGeneration = nonNegative(request.expectedGeneration, "expected_generation")
        val expectedRevision = nonNegative(request.expectedRevision, "expected_revision")
        return starCasConflictBoundary({ throw currentConflict(userId, accountId, expectedGeneration) }) {
            requireNotNull(
                transactions.execute {
                    val current = states.findByUserIdAndAccountId(userId, accountId)
                    checkVersion(current, expectedGeneration, expectedRevision)
                    val target = recoveryPoints.findByUserIdAndAccountIdAndRecoveryPointId(userId, accountId, pointId)
                        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "star_recovery_point_not_found", "Recovery point not found")
                    val now = Instant.now()
                    val safety = current?.let { checkpoint(userId, accountId, it, "restore_safety", null, now) }
                    val normalized = normalizeStored(target.state)
                    val saved = save(userId, accountId, expectedGeneration, expectedRevision, expectedGeneration + 1, normalized, now)
                    val currentLoadouts = loadouts.findByUserIdAndAccountId(userId, accountId)?.loadouts.orEmpty()
                    val source = target.loadouts ?: currentLoadouts
                    val restored = filterLoadouts(source, normalized.inventory, operatorIds(userId, accountId, account.game))
                    val newLoadout = replaceLoadout(userId, accountId, expectedGeneration + 1, restored.loadouts, now)
                    val summary = StarRecoverySummary(
                        restoredOperators = restored.loadouts.count { it.slots.values().any { slot -> slot.second != null } },
                        restoredSlots = restored.loadouts.sumOf { it.slots.values().count { slot -> slot.second != null } },
                        skippedOperators = restored.missingOperators.size,
                        skippedSlots = restored.skippedOperatorSlots,
                        skippedOperatorIds = restored.missingOperators,
                        skippedInvalidSlots = restored.skippedInvalidSlots,
                        historicalLoadoutAvailable = target.loadouts != null,
                    )
                    StarStateCommandResponse(
                        StarStateCurrentResponse.of(saved),
                        StarLoadoutCurrentResponse.of(newLoadout),
                        safety?.let(StarRecoveryPointResponse::of),
                        summary,
                    )
                },
            )
        }
    }

    internal fun operatorIds(userId: String, accountId: String, game: String): Set<String> {
        val records = operators.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId)
        val generic = records.filter { it.game in setOf("*", "universal") }.flatMap { it.entries.keys }
        val specific = records.filter { it.game == game }.flatMap { it.entries.keys }
        return (generic + specific).toSet()
    }

    internal fun reconcileLoadout(
        userId: String,
        accountId: String,
        inventory: List<StarStateEntry>,
        now: Instant,
    ): com.lhs.share.hub.repository.entity.StarLoadoutCurrent? {
        val current = loadouts.findByUserIdAndAccountId(userId, accountId) ?: return null
        val clean = filterLoadouts(
            current.loadouts,
            inventory,
            operatorIds(userId, accountId, accounts.requireAccount(userId, accountId).game),
        ).loadouts
        if (clean == current.loadouts) return current
        return loadouts.replaceForGeneration(
            userId,
            accountId,
            current.revision,
            states.findByUserIdAndAccountId(userId, accountId)?.generation ?: 0,
            clean,
            now,
        )
            ?: throw loadoutConflict()
    }

    /** Called inside the operator mutation transaction after its Current entries change. */
    fun pruneForOperatorCurrentChange(userId: String, accountId: String) {
        val state = states.findByUserIdAndAccountId(userId, accountId)
        if (state != null && !states.fenceLoadoutWrite(userId, accountId, state.generation, state.revision)) throw stateConflict()
        reconcileLoadout(userId, accountId, state?.inventory.orEmpty(), Instant.now())
    }

    private fun filterLoadouts(
        source: List<StarOperatorLoadout>,
        inventory: List<StarStateEntry>,
        presentOperators: Set<String>,
    ): FilteredLoadouts {
        val byId = inventory.associateBy { it.instanceId }
        val occupied = HashSet<String>()
        val missingOperators = mutableListOf<String>()
        var skippedOperatorSlots = 0
        var skippedInvalidSlots = 0
        val clean = source.mapNotNull { loadout ->
            if (loadout.operatorId !in presentOperators) {
                missingOperators += loadout.operatorId
                skippedOperatorSlots += loadout.slots.values().count { it.second != null }
                null
            } else {
                fun valid(slot: String, id: String?): String? {
                    if (id == null) return null
                    val entry = byId[id]
                    val kind = if (slot.startsWith("main")) "main" else "support"
                    if (entry?.kind == kind && occupied.add(id)) return id
                    skippedInvalidSlots++
                    return null
                }
                val slots = loadout.slots
                loadout.copy(
                    slots = StarLoadoutSlots(
                        valid("main1", slots.main1),
                        valid("main2", slots.main2),
                        valid("main3", slots.main3),
                        valid("support1", slots.support1),
                        valid("support2", slots.support2),
                        valid("support3", slots.support3),
                    ),
                )
            }
        }
        return FilteredLoadouts(clean, missingOperators, skippedOperatorSlots, skippedInvalidSlots)
    }

    private fun checkpoint(
        userId: String,
        accountId: String,
        state: StarStateCurrent,
        reason: String,
        requestedId: String?,
        now: Instant,
    ): StarRecoveryPoint {
        val pointId = requestedId ?: UUID.randomUUID().toString()
        if (!INSTANCE_ID.matches(pointId)) throw invalid("recovery_point_id is invalid")
        val accountGame = accounts.requireAccount(userId, accountId).game
        val previous = recoveryPoints.findTop3ByUserIdAndAccountIdOrderByCreatedAtDescIdDesc(userId, accountId)
        val createdAt = previous.firstOrNull()?.createdAt?.let { if (now.isAfter(it)) now else it.plusMillis(1) } ?: now
        val currentLoadouts = loadouts.findByUserIdAndAccountId(userId, accountId)?.loadouts.orEmpty()
        val safeLoadouts = filterLoadouts(currentLoadouts, state.inventory, operatorIds(userId, accountId, accountGame)).loadouts
        val point = recoveryPoints.insert(
            StarRecoveryPoint(
                id = "$userId:$accountId:$pointId", userId = userId, accountId = accountId,
                recoveryPointId = pointId, reason = reason, createdAt = createdAt,
                sourceGeneration = state.generation, state = state.snapshot(), loadouts = safeLoadouts,
            ),
        )
        recoveryPoints.findByUserIdAndAccountIdOrderByCreatedAtDescIdDesc(userId, accountId)
            .drop(3).forEach(recoveryPoints::delete)
        return point
    }

    private fun replaceLoadout(
        userId: String,
        accountId: String,
        generation: Long,
        values: List<StarOperatorLoadout>,
        now: Instant,
    ): com.lhs.share.hub.repository.entity.StarLoadoutCurrent {
        val revision = loadouts.findByUserIdAndAccountId(userId, accountId)?.revision ?: 0
        return loadouts.replaceForGeneration(userId, accountId, revision, generation, values, now) ?: throw loadoutConflict()
    }

    private fun save(
        userId: String,
        accountId: String,
        expectedGeneration: Long,
        expectedRevision: Long,
        newGeneration: Long,
        next: StarStateSnapshot,
        now: Instant,
    ): StarStateCurrent = starCasConflictBoundary({ throw stateConflict() }) {
        states.replace(userId, accountId, expectedGeneration, expectedRevision, newGeneration, next, now) ?: throw stateConflict()
    }

    private fun checkVersion(current: StarStateCurrent?, generation: Long, revision: Long) {
        if ((current?.generation ?: 0) != generation) throw generationChanged()
        if ((current?.revision ?: 0) != revision) throw stateConflict()
    }

    private fun normalizeStored(snapshot: StarStateSnapshot): StarStateSnapshot {
        val byId = snapshot.inventory.associateBy { it.instanceId }
        return snapshot.copy(
            planTargets = snapshot.planTargets.filter { target ->
                byId[target.instanceId]?.let { target.targetLevel in it.level..60 } == true
            },
        )
    }

    private fun normalize(
        inventory: List<StarInventoryEntryRequest>?,
        targets: Map<String, Int>?,
        experience: StarWorkspaceExperienceRequest?,
        bag: StarWorkspaceBagRequest?,
        previousInventory: List<StarStateEntry> = emptyList(),
    ): StarStateSnapshot {
        val entries = inventory ?: throw invalid("inventory is required")
        if (entries.size > 1000) throw invalid("inventory exceeds 1000 entries")
        val seen = HashSet<String>()
        val previousById = previousInventory.associateBy { it.instanceId }
        val normalizedEntries = entries.map { entry ->
            if (!INSTANCE_ID.matches(entry.instanceId) || !seen.add(entry.instanceId)) throw invalid("instance_id must be unique and valid")
            if (entry.kind !in setOf("main", "support")) throw invalid("star kind is invalid")
            val name = entry.name.trim()
            if (name.isEmpty() || name.length > 256) throw invalid("star name is invalid")
            if (entry.quality !in setOf("orange", "purple", "blue", "green", "white")) throw invalid("star quality is invalid")
            val level = entry.level ?: throw invalid("star level is required")
            if (level !in 1..60) throw invalid("star level is invalid")
            val previous = previousById[entry.instanceId]
            val unchanged = previous != null && previous.kind == entry.kind && previous.name == name &&
                previous.quality == entry.quality && previous.level == level
            val raw = entry.breakthroughStage
            // Keep historical facts during unrelated legacy PATCHes, including values needing review.
            if (raw == null && unchanged) {
                previous!!
            } else {
                val allowed = try {
                    StarBreakthroughRules.allowed(level, entry.quality)
                } catch (_: IllegalArgumentException) {
                    throw invalid("star level exceeds its quality limit")
                }
                val stage = when {
                    raw == null -> StarBreakthroughRules.inferred(level, entry.quality)
                    raw.isNull -> null
                    raw.isIntegralNumber && raw.canConvertToInt() && raw.intValue() in allowed -> raw.intValue()
                    else -> throw invalid("breakthrough_stage must match star level and quality")
                }
                StarStateEntry(entry.instanceId, entry.kind, name, entry.quality, level, stage)
            }
        }.sortedBy { it.instanceId }
        val plan = targets ?: throw invalid("plan_targets is required")
        if (plan.size > 1000) throw invalid("plan_targets exceeds 1000 entries")
        val byId = normalizedEntries.associateBy { it.instanceId }
        val normalizedPlan = plan.entries.sortedBy { it.key }.map { (id, target) ->
            if (byId[id] == null ||
                target !in (byId.getValue(id).level..60)
            ) {
                throw invalid("plan_targets must reference current inventory above its current level")
            }
            StarStatePlanTarget(id, target)
        }
        val exp = experience ?: throw invalid("experience is required")
        if (listOf(exp.orange, exp.purple, exp.white).any { it != null && it < 0 }) throw invalid("experience must be nonnegative")
        val requestedBag = bag ?: throw invalid("bag is required")
        if (requestedBag.currentCount != null && requestedBag.currentCount < 0 ||
            requestedBag.capacity != null && requestedBag.capacity < 1 ||
            requestedBag.currentCount != null && requestedBag.capacity != null && requestedBag.currentCount > requestedBag.capacity
        ) {
            throw invalid("bag counts are invalid")
        }
        return StarStateSnapshot(
            normalizedEntries,
            normalizedPlan,
            StarStateExperience(exp.orange, exp.purple, exp.white),
            StarStateBag(requestedBag.currentCount, requestedBag.capacity),
        )
    }

    private fun nonNegative(value: Long?, field: String): Long = value?.takeIf { it >= 0 } ?: throw invalid("$field must be nonnegative")
    private fun emptySnapshot() = StarStateSnapshot(emptyList(), emptyList(), StarStateExperience(), StarStateBag())
    private fun stateResponse(state: StarStateCurrent?, accountId: String) =
        state?.let(StarStateCurrentResponse::of) ?: StarStateCurrentResponse.empty(accountId)
    private fun loadoutResponse(state: com.lhs.share.hub.repository.entity.StarLoadoutCurrent?, accountId: String) =
        state?.let(StarLoadoutCurrentResponse::of) ?: StarLoadoutCurrentResponse.empty(accountId)
    private fun invalid(message: String) = InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_state_invalid_snapshot", message)
    private fun stateConflict() =
        InventoryApiException(HttpStatus.CONFLICT, "star_state_revision_conflict", "Star state changed; reload before saving")
    private fun currentConflict(userId: String, accountId: String, expectedGeneration: Long): InventoryApiException =
        if ((states.findByUserIdAndAccountId(userId, accountId)?.generation ?: 0) !=
            expectedGeneration
        ) {
            generationChanged()
        } else {
            stateConflict()
        }
    private fun generationChanged() =
        InventoryApiException(HttpStatus.CONFLICT, "star_generation_changed", "Star generation changed; reload before saving")
    private fun loadoutConflict() =
        InventoryApiException(HttpStatus.CONFLICT, "star_loadout_revision_conflict", "Star loadout changed during star state mutation")

    private data class FilteredLoadouts(
        val loadouts: List<StarOperatorLoadout>,
        val missingOperators: List<String>,
        val skippedOperatorSlots: Int,
        val skippedInvalidSlots: Int,
    )

    companion object {
        private val INSTANCE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    }
}
