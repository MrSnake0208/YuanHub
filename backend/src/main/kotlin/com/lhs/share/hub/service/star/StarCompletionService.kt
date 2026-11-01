package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.star.request.StarCompletionRequest
import com.lhs.share.hub.controller.star.request.StarCompletionSelection
import com.lhs.share.hub.controller.star.response.StarCompletionContextResponse
import com.lhs.share.hub.controller.star.response.StarCompletionResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.StarCompletionRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.StarCompletion
import com.lhs.share.hub.repository.entity.StarCompletionChange
import com.lhs.share.hub.repository.entity.StarCompletionState
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.snapshot
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class StarCompletionService(
    private val accounts: SubAccountRepository,
    private val states: StarStateCurrentRepository,
    private val inventories: InventoryCurrentRepository,
    private val revisions: InventoryRevisionRepository,
    private val records: InventoryRecordRepository,
    private val completions: StarCompletionRepository,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun context(userId: String, accountId: String): StarCompletionContextResponse = checkNotNull(
        transactions.execute {
            val account = requireAccount(userId, accountId)
            val state = states.findByUserIdAndAccountId(userId, accountId)
            val stock = inventories.findByUserIdAndAccountIdAndEntityType(userId, accountId, "item")
            StarCompletionContextResponse(
                accountId,
                account.game,
                state?.let(StarStateCurrentResponse::of) ?: StarStateCurrentResponse.empty(accountId),
                BOTTLES.associateWith { bottleBalance(stock, it) },
                revision(userId, accountId),
            )
        },
    )

    fun receipt(userId: String, accountId: String, operationId: String): StarCompletionResponse {
        requireAccount(userId, accountId)
        return completions.findByUserIdAndAccountIdAndOperationId(userId, accountId, operationId)?.let(StarCompletionResponse::of)
            ?: fail(HttpStatus.NOT_FOUND, "star_completion_not_found", "Completion receipt not found")
    }

    fun complete(userId: String, request: StarCompletionRequest): StarCompletionResponse {
        requireAccount(userId, request.accountId)
        if (!OPERATION_ID.matches(request.operationId)) invalid("operation_id must contain 1..128 safe ASCII characters")
        // Compare typed, canonical JSON, not ambiguous delimiter strings or raw field ordering.
        val identity = mapper.writeValueAsString(request.copy(stars = request.stars.sortedBy { it.instanceId }))
        existing(userId, request, identity)?.let { return StarCompletionResponse.of(it) }
        validate(request)
        try {
            val result = checkNotNull(
                transactions.execute {
                    existing(userId, request, identity)?.let { return@execute it }
                    val account = requireAccount(userId, request.accountId)
                    if (account.game != request.game) invalid("game must match the subaccount game version")
                    // Share the existing account lifecycle fence: account deletion/game edits cannot race this command.
                    if (!accounts.fenceRecruitmentWrite(userId, request.accountId, request.game)) {
                        conflict("account_state_stale", "Account changed during completion")
                    }
                    val current = checkState(userId, request)
                    if (revision(userId, request.accountId) != request.expectedInventoryRevision) staleInventory()
                    val byId = current.inventory.associateBy { it.instanceId }
                    val plans = current.planTargets.associate { it.instanceId to it.targetLevel }
                    request.stars.forEach { selected ->
                        val star = byId[selected.instanceId]
                            ?: fail(
                                HttpStatus.NOT_FOUND,
                                "star_instance_not_found",
                                "Selected instance does not exist in the current generation",
                            )
                        if (star.level != selected.currentLevel) {
                            conflict("star_level_changed", "Selected instance level changed")
                        }
                        val startingStage = try {
                            StarBreakthroughRules.completed(star.level, star.quality, selected.startAlreadyBroken == true)
                        } catch (_: IllegalArgumentException) {
                            invalid("Starting breakthrough does not match star level and quality")
                        }
                        if (star.breakthroughStage != null && star.breakthroughStage != startingStage) {
                            conflict("star_breakthrough_changed", "Starting breakthrough disagrees with the recorded state")
                        }
                        try {
                            StarBreakthroughRules.completed(selected.targetLevel!!, star.quality, selected.targetAlsoBroken == true)
                        } catch (_: IllegalArgumentException) {
                            invalid("Target breakthrough does not match star level and quality")
                        }
                        if (plans[selected.instanceId] !=
                            selected.targetLevel
                        ) {
                            conflict("star_plan_changed", "Selected plan target changed")
                        }
                    }
                    val required = calculateBottles(request.stars)
                    val confirmed = linkedMapOf(
                        "jiezhuping" to request.bottlesConsumed.jiezhuping!!,
                        "jiezheping" to request.bottlesConsumed.jiezheping!!,
                        "jieyangping" to request.bottlesConsumed.jieyangping!!,
                    )
                    if (confirmed !=
                        required
                    ) {
                        invalid("Confirmed bottles do not match the selected breakthrough nodes", "star_bottle_consumption_mismatch")
                    }
                    val stock = inventories.findByUserIdAndAccountIdAndEntityType(userId, request.accountId, "item")
                    val balances = BOTTLES.associateWith { id ->
                        val balance = bottleBalance(stock, id)
                        val count = required.getValue(id)
                        if (balance == null) {
                            if (count > 0) conflict("star_bottle_inventory_unknown", "Current $id inventory is unknown")
                            null
                        } else {
                            if (balance < count) conflict("insufficient_inventory", "Insufficient $id")
                            balance - count
                        }
                    }
                    val used = request.experienceConsumed
                    val experience = StarStateExperience(
                        consumeExperience(current.experience.orange, used.orange!!, "orange"),
                        consumeExperience(current.experience.purple, used.purple!!, "purple"),
                        consumeExperience(current.experience.white, used.white!!, "white"),
                    )
                    // BSON Date persists milliseconds; the first response and recovered receipt must be identical.
                    val now = Instant.now().truncatedTo(ChronoUnit.MILLIS)
                    // A genuine write to the same shared revision document conflicts with import and operator consumption,
                    // including commands consuming different items and completions that consume no bottles.
                    val nextRevision = revisions.compareAndIncrement(userId, request.accountId, request.expectedInventoryRevision!!, now)
                        ?: staleInventory()
                    val selected = request.stars.associateBy { it.instanceId }
                    val next = current.snapshot().copy(
                        inventory = current.inventory.map { star ->
                            selected[star.instanceId]?.let {
                                star.copy(
                                    level = it.targetLevel!!,
                                    breakthroughStage = StarBreakthroughRules.completed(
                                        it.targetLevel,
                                        star.quality,
                                        it.targetAlsoBroken == true,
                                    ),
                                )
                            }
                                ?: star
                        },
                        planTargets = current.planTargets.filter { it.instanceId !in selected },
                        experience = experience,
                    )
                    val saved =
                        states.replace(
                            userId,
                            request.accountId,
                            request.expectedGeneration!!,
                            request.expectedStarRevision!!,
                            current.generation,
                            next,
                            now,
                        )
                            ?: conflict("star_state_revision_conflict", "Star state changed")
                    val consumed = required.filterValues { it > 0 }
                    val transactionId = "star_completion_${UUID.randomUUID()}"
                    if (consumed.isNotEmpty()) {
                        // Consumption must follow every item source adopted by this transaction, including future-dated imports.
                        val effectiveAt = maxOf(
                            now,
                            records.findFirstByUserIdAndAccountIdAndEntityTypeOrderByEffectiveAtDesc(
                                userId,
                                request.accountId,
                                "item",
                            )?.effectiveAt
                                ?: now,
                        )
                        val entries = checkNotNull(stock).entries.toMutableMap()
                        consumed.forEach { (id, _) ->
                            entries[id] = checkNotNull(entries[id]).copy(count = checkNotNull(balances.getValue(id)))
                        }
                        inventories.save(stock.copy(entries = entries, updatedAt = now))
                        records.insert(
                            InventoryRecord(
                                recordId = "completion:$transactionId:item", userId = userId, accountId = request.accountId,
                                recordType = "consumption_delta", entityType = "item", acquisitionChannel = "星石养成",
                                effectiveAt = effectiveAt, receivedAt = now, producer = ProducerInfo("myshare", "star-completion-v1"),
                                entries = consumed.map { (id, count) -> RecordEntry(id, count = count) },
                                stockEffect = "applied", transactionId = transactionId,
                            ),
                        )
                    }
                    // Level-only changes preserve instance IDs/kinds; existing loadout references remain valid.
                    completions.insert(
                        StarCompletion(
                            id = transactionId, userId = userId, accountId = request.accountId, game = request.game,
                            operationId = request.operationId, requestIdentity = identity,
                            changes = request.stars.map { StarCompletionChange(it.instanceId, it.currentLevel!!, it.targetLevel!!) },
                            experienceConsumed = StarStateExperience(used.orange, used.purple, used.white),
                            bottlesConsumed = required, bottleBalances = balances, inventoryRevision = nextRevision.revision,
                            state = StarCompletionState(saved), createdAt = now,
                        ),
                    )
                },
            )
            return StarCompletionResponse.of(result)
        } catch (error: Exception) {
            val mongo = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<MongoException>().toList()
            // Commit acknowledgement may be lost. Do not label an uncertain result as a definite stale failure.
            if (mongo.any { it.hasErrorLabel("UnknownTransactionCommitResult") }) {
                existing(userId, request, identity)?.let { return StarCompletionResponse.of(it) }
                fail(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "star_completion_result_unknown",
                    "Retry the original operation ID or query its receipt",
                )
            }
            if (error is DuplicateKeyException || mongo.any { it.code == 112 || it.hasErrorLabel("TransientTransactionError") }) {
                existing(userId, request, identity)?.let { return StarCompletionResponse.of(it) }
                // Re-read after rollback to report the changed authority, never inside an aborted transaction.
                requireAccount(userId, request.accountId)
                checkState(userId, request)
                if (revision(userId, request.accountId) != request.expectedInventoryRevision) staleInventory()
                conflict(
                    "star_completion_concurrent_change",
                    "Concurrent account, loadout, or inventory mutation; reload and confirm again",
                )
            }
            throw error
        }
    }

    private fun existing(userId: String, request: StarCompletionRequest, identity: String): StarCompletion? =
        completions.findByUserIdAndAccountIdAndOperationId(userId, request.accountId, request.operationId)?.also {
            if (it.requestIdentity !=
                identity
            ) {
                conflict("star_completion_idempotency_conflict", "Operation ID was used for a different request")
            }
        }

    private fun checkState(userId: String, request: StarCompletionRequest): StarStateCurrent {
        val state = states.findByUserIdAndAccountId(userId, request.accountId)
        if ((state?.generation ?: 0L) != request.expectedGeneration) conflict("star_generation_changed", "Star generation changed")
        if ((state?.revision ?: 0L) != request.expectedStarRevision) conflict("star_state_revision_conflict", "Star revision changed")
        return state ?: fail(HttpStatus.NOT_FOUND, "star_instance_not_found", "No current star state")
    }

    private fun validate(request: StarCompletionRequest) {
        if (listOf(request.expectedGeneration, request.expectedStarRevision, request.expectedInventoryRevision).any {
                it == null || it < 0 ||
                    it == Long.MAX_VALUE
            }
        ) {
            invalid("Expected versions must be nonnegative and incrementable")
        }
        if (request.stars.isEmpty() || request.stars.size > 1000) invalid("Select 1..1000 instances")
        if (request.stars.map { it.instanceId }.distinct().size !=
            request.stars.size
        ) {
            invalid("Duplicate selected instance", "star_completion_duplicate_instance")
        }
        request.stars.forEach { star ->
            if (!INSTANCE_ID.matches(star.instanceId)) invalid("Invalid instance_id")
            val from = star.currentLevel ?: invalid("current_level is required")
            val to = star.targetLevel ?: invalid("target_level is required")
            if (from !in 1..60 || to !in 1..60 || to <= from) invalid("Target must be above the current level and at most 60")
            if (star.startAlreadyBroken != null && from !in NODES || star.targetAlsoBroken != null && to !in NODES) {
                invalid("Breakthrough correction is only valid at 10/20/30/40/50", "star_completion_invalid_breakthrough")
            }
        }
        if (listOf(request.experienceConsumed.orange, request.experienceConsumed.purple, request.experienceConsumed.white).any {
                it == null ||
                    it < 0
            }
        ) {
            invalid("All three actual experience quantities must be confirmed nonnegative integers")
        }
        if (listOf(request.bottlesConsumed.jiezhuping, request.bottlesConsumed.jiezheping, request.bottlesConsumed.jieyangping).any {
                it ==
                    null ||
                    it < 0
            }
        ) {
            invalid("All three bottle quantities must be confirmed nonnegative integers")
        }
    }

    /** Only a full snapshot proves zero for an entry that has never been recorded. */
    private fun bottleBalance(stock: InventoryCurrent?, id: String): Long? =
        stock?.entries?.get(id)?.count ?: if (stock?.fullBaselineAt != null) 0L else null

    private fun consumeExperience(balance: Int?, used: Int, color: String): Int? {
        if (balance == null) {
            if (used > 0) conflict("star_experience_unknown", "Current $color experience inventory is unknown")
            return null
        }
        if (balance < used) conflict("insufficient_star_experience", "Insufficient $color experience inventory")
        return balance - used
    }

    private fun requireAccount(userId: String, accountId: String) = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: fail(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
    private fun revision(userId: String, accountId: String) = revisions.findByUserIdAndAccountId(userId, accountId)?.revision ?: 0L
    private fun staleInventory(): Nothing = conflict("inventory_state_stale", "Inventory revision changed")
    private fun invalid(message: String, code: String = "star_completion_invalid_request"): Nothing =
        fail(HttpStatus.UNPROCESSABLE_ENTITY, code, message)
    private fun conflict(code: String, message: String): Nothing = fail(HttpStatus.CONFLICT, code, message)
    private fun fail(status: HttpStatus, code: String, message: String): Nothing = throw InventoryApiException(status, code, message)

    companion object {
        private val OPERATION_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        private val INSTANCE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        val BOTTLES = listOf("jiezhuping", "jiezheping", "jieyangping")
        private val NODES = mapOf(
            10 to listOf(5L, 0L, 0L),
            20 to listOf(10L, 0L, 0L),
            30 to listOf(30L, 30L, 0L),
            40 to listOf(0L, 50L, 20L),
            50 to listOf(0L, 60L, 60L),
        )

        internal fun calculateBottles(stars: List<StarCompletionSelection>): Map<String, Long> {
            val totals = linkedMapOf<String, Long>().also { result -> BOTTLES.forEach { result[it] = 0L } }
            stars.forEach { star ->
                val from = checkNotNull(star.currentLevel)
                val to = checkNotNull(star.targetLevel)
                NODES.forEach { (node, cost) ->
                    val included = from <= node && node < to && !(node == from && star.startAlreadyBroken == true) ||
                        node == to && star.targetAlsoBroken == true
                    if (included) BOTTLES.forEachIndexed { index, id -> totals[id] = totals.getValue(id) + cost[index] }
                }
            }
            return totals
        }
    }
}
