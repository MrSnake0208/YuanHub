package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.operator.request.OperatorDiscRequest
import com.lhs.share.hub.controller.operator.request.OperatorEntryRequest
import com.lhs.share.hub.controller.operator.request.OperatorImportRequest
import com.lhs.share.hub.controller.operator.request.OperatorRecordRequest
import com.lhs.share.hub.controller.operator.request.OperatorStarStoneRequest
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorExportAccountDto
import com.lhs.share.hub.controller.operator.response.OperatorExportRecordDto
import com.lhs.share.hub.controller.operator.response.OperatorExportResponse
import com.lhs.share.hub.controller.operator.response.OperatorImportResult
import com.lhs.share.hub.controller.operator.response.OperatorOddityRules
import com.lhs.share.hub.controller.operator.response.OperatorRecordListItemDto
import com.lhs.share.hub.controller.operator.response.OperatorRecordPageResponse
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatDisplayMode
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorObservedInputs
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.OperatorRecord
import com.lhs.share.hub.repository.entity.OperatorRecordEntry
import com.lhs.share.hub.repository.entity.OperatorStarStone
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.normalized
import com.lhs.share.hub.repository.entity.oddityNumberNode
import com.lhs.share.hub.service.star.StarStateService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

@Service
class OperatorService(
    private val accountRepository: SubAccountRepository,
    private val currentRepository: OperatorCurrentRepository,
    private val recordRepository: OperatorRecordRepository,
    @Suppress("unused") private val catalogRepository: OperatorCatalogRepository,
    private val catalogService: OperatorCatalogService,
    private val transactionTemplate: TransactionTemplate,
    private val correctionRepository: OperatorCorrectionRecordRepository,
    private val starStateService: StarStateService,
) {
    fun import(userId: String, request: OperatorImportRequest): OperatorImportResult = importInternal(userId, null, request)

    fun import(userId: String, accountId: String, request: OperatorImportRequest): OperatorImportResult =
        importInternal(userId, accountId, request)

    private fun importInternal(userId: String, restrictedAccountId: String?, request: OperatorImportRequest): OperatorImportResult {
        if (request.format != FORMAT) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "format must be $FORMAT")
        }
        if (request.version != VERSION) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "unsupported_version",
                "Unsupported operator exchange version: ${request.version}",
            )
        }
        parseTime(request.exportedAt, "exported_at")
        validateProducer(request.producer)
        val warnings = mutableListOf<String>()
        val ordered = validateAndSort(userId, restrictedAccountId, request, warnings)
        val seen = mutableMapOf<Pair<String, String>, OperatorRecordRequest>()
        val prepared = ordered.map { item ->
            val key = item.record.accountId to item.record.recordId
            val prior = seen.putIfAbsent(key, item.record)
            if (prior != null) {
                if (prior != item.record) throw conflict(item.record.recordId)
                return@map null
            }
            val existing = recordRepository.findByUserIdAndAccountIdAndRecordId(
                userId,
                item.record.accountId,
                item.record.recordId,
            )
            if (existing != null) {
                if (!sameBody(existing, item.record)) throw conflict(item.record.recordId)
                null
            } else {
                item
            }
        }.filterNotNull()
        val duplicates = ordered.size - prepared.size
        var accepted = 0
        var superseded = 0
        transactionTemplate.executeWithoutResult {
            prepared.forEach { item ->
                val effect = applyRecord(userId, item)
                recordRepository.save(item.toEntity(userId, request.producer, effect))
                accepted++
                if (effect == SUPERSEDED) superseded++
            }
            prepared.map { it.record.accountId }.distinct().forEach { accountId ->
                starStateService.pruneForOperatorCurrentChange(userId, accountId)
            }
        }
        return OperatorImportResult(accepted, duplicates, superseded, warnings)
    }

    private fun validateAndSort(
        userId: String,
        restricted: String?,
        request: OperatorImportRequest,
        warnings: MutableList<String>,
    ): List<Validated> {
        val ids = request.accounts.orEmpty().map { it.id }
        if (ids.any { !ACCOUNT_ID.matches(it) } || ids.toSet().size != ids.size) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "accounts are invalid")
        }
        val referenced = request.records.map { it.accountId }.toSet()
        if (referenced.any { !ACCOUNT_ID.matches(it) }) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "record account_id is invalid")
        }
        if (restricted != null && referenced != setOf(restricted)) {
            throw apiError(
                HttpStatus.FORBIDDEN,
                "account_scope_mismatch",
                "Document contains records outside the API token account",
            )
        }
        val owned = accountRepository.findAllByUserIdAndAccountIdIn(userId, referenced).associateBy { it.accountId }
        referenced.firstOrNull { it !in owned }?.let {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "unknown_account_id", "Unknown account_id: $it")
        }
        return request.records.map { record ->
            validateRecord(record, checkNotNull(owned[record.accountId]).game, warnings)
        }.sortedWith(compareBy<Validated> { it.record.accountId }.thenBy { it.effectiveAt })
    }

    private fun validateRecord(record: OperatorRecordRequest, accountGame: String, warnings: MutableList<String>): Validated {
        if (record.recordId.isBlank() || record.recordId.length > 128) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "record_id length must be 1..128",
                record.recordId,
            )
        }
        if (record.recordType != RECORD_TYPE || record.snapshotScope !in SCOPES) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "Invalid operator record enum",
                record.recordId,
            )
        }
        if (record.snapshotScope == LISTED && record.entries.isEmpty()) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "listed snapshots require at least one entry",
                record.recordId,
            )
        }
        if (record.game != null && record.game !in GAMES) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_game", "Unsupported game", record.recordId)
        }
        if (record.game != accountGame) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "account_game_mismatch",
                "Record game must match the account game",
                record.recordId,
            )
        }
        val effective = parseTime(record.effectiveAt, "effective_at")
        val entryIds = mutableSetOf<String>()
        record.entries.forEach { entry -> validateV2Entry(record, entry, entryIds, warnings) }
        record.entries.groupBy { OperatorSharedGrowth.baseId(it.id, catalogService) }.values.forEach { group ->
            if (group.map { it.level to it.elite }.distinct().size > 1) {
                throw apiError(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "shared_growth_conflict",
                    "Related forms must have identical level and elite",
                    record.recordId,
                )
            }
        }
        return Validated(record, effective)
    }

    private fun validateV2Entry(
        record: OperatorRecordRequest,
        entry: OperatorEntryRequest,
        entryIds: MutableSet<String>,
        warnings: MutableList<String>,
    ) {
        if (!entryIds.add(entry.id)) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "Duplicate entry id",
                record.recordId,
                entry.id,
            )
        }
        val catalog = catalogService.getOperator(entry.id)
            ?: throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "unknown_operator_id",
                "Unknown operator id: ${entry.id}",
                record.recordId,
                entry.id,
            )
        if (listOf(entry.elite, entry.starLevel, entry.level).any { it < 0 }) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "Operator levels must be non-negative",
                record.recordId,
                entry.id,
            )
        }
        validateStarLevel(entry.starLevel, catalog, record.recordId, entry.id)
        if (OperatorHuajiRules.anomalous(entry.starLevel, catalog)) {
            warnings += "${entry.id}: legacy_huaji_requires_review raw=${entry.starLevel}; original value retained"
        }
        if (record.game !in catalog.games) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_game",
                "Operator is not available in game",
                record.recordId,
                entry.id,
            )
        }
        if (entry.rarity != null && entry.rarity != catalog.rarity) warnings.add("${entry.id}: rarity conflicts with catalog")
        if (entry.prof != null && entry.prof != catalog.prof) warnings.add("${entry.id}: prof conflicts with catalog")
        if (entry.subProf != null && entry.subProf != catalog.subProf) warnings.add("${entry.id}: subProf conflicts with catalog")
        val discNames = entry.discs.map { it.otName }
        if (discNames.toSet().size != discNames.size || discNames.any { name -> catalog.discs.none { it.otName == name } }) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_disc", "Invalid disc", record.recordId, entry.id)
        }
        val stoneTypes = entry.starStones.map { normalizeStoneType(it.type) }
        if (
            entry.starStones.any { it.type !in STONE_TYPES } ||
            stoneTypes.toSet().size != stoneTypes.size ||
            entry.starStones.any { it.level < 0 }
        ) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_star_stone", "Invalid star stone", record.recordId, entry.id)
        }
    }

    private fun validateStarLevel(
        starLevel: Int,
        catalog: OperatorCatalogEntity,
        recordId: String? = null,
        operatorId: String = catalog.operatorId,
    ) {
        val max = if (catalog.spOf == null) MAX_STAR_LEVEL else MAX_SP_STAR_LEVEL
        if (starLevel !in 0..max) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_star_level",
                if (catalog.spOf == null) "star_level must be 0..31" else "SP star_level must be 0..5",
                recordId,
                operatorId,
                operatorId,
                "star_level",
            )
        }
    }

    private fun applyRecord(userId: String, item: Validated): String {
        val record = item.record
        val game = record.game ?: GENERIC_GAME
        val current = currentRepository.findByUserIdAndAccountIdAndGame(userId, record.accountId, game)
        if (record.snapshotScope == FULL && current?.fullBaselineAt?.isAfter(item.effectiveAt) == true) return SUPERSEDED
        if (
            record.snapshotScope == LISTED &&
            record.entries.all { entry -> current?.entries?.get(entry.id)?.listedBaselineAt?.isAfter(item.effectiveAt) == true }
        ) {
            return SUPERSEDED
        }
        val now = Instant.now()
        val next: MutableMap<String, OperatorEntry> = if (record.snapshotScope == FULL) {
            val mapped = record.entries.associate { request ->
                request.id to mergeV2Entry(current?.entries?.get(request.id), request, null, now)
            }.toMutableMap()
            current?.entries?.forEach { (id, value) ->
                if (value.listedBaselineAt?.isAfter(item.effectiveAt) == true) mapped[id] = value
            }
            mapped
        } else {
            val mapped = (current?.entries ?: emptyMap()).toMutableMap()
            record.entries.forEach { request ->
                mapped[request.id] = mergeV2Entry(mapped[request.id], request, item.effectiveAt, now)
            }
            mapped
        }
        normalizeSpRelations(next, record.entries.map { it.id }.toSet(), now)
        val fullBaselineAt = if (record.snapshotScope == FULL) item.effectiveAt else current?.fullBaselineAt
        currentRepository.save(
            OperatorCurrent(
                current?.id ?: key(userId, record.accountId, game),
                userId,
                record.accountId,
                game,
                fullBaselineAt,
                next,
                now,
            ),
        )
        return APPLIED
    }

    private fun mergeV2Entry(existingRaw: OperatorEntry?, request: OperatorEntryRequest, listedAt: Instant?, now: Instant): OperatorEntry {
        val catalog = catalogService.getOperator(request.id)
        val existing = existingRaw?.normalized()?.let { entry ->
            if (catalog == null) entry else entry.copy(huaji = OperatorHuajiRules.read(entry, catalog))
        }
        val huaji = catalog?.let { OperatorHuajiRules.legacy(request.starLevel, it, existing?.huaji) }
        val discs = request.discs.map { OperatorDisc(it.otName, it.abbreviation, it.color, it.desp) }
        val stones = request.starStones.map { OperatorStarStone(it.name, normalizeStoneType(it.type), it.level) }
        val loadouts = replaceFirstLoadout(existing?.discLoadouts.orEmpty(), discs)
        var next = OperatorEntry(
            elite = request.elite,
            starLevel = request.starLevel,
            level = request.level,
            levelBreakthroughStage = if (existing?.level == request.level) {
                OperatorLevelBreakthroughRules.read(request.level, existing.levelBreakthroughStage)
            } else {
                OperatorLevelBreakthroughRules.inferred(request.level)
            },
            discs = discs,
            starStones = stones,
            discLoadouts = loadouts,
            combatStats = existing?.combatStats,
            huaji = huaji,
            huajiLegacy =
            existing?.huajiLegacy
                ?: com.lhs.share.hub.repository.entity.OperatorHuajiLegacy(
                    existing?.starLevel ?: request.starLevel,
                    if (existing ==
                        null
                    ) {
                        "v2_import"
                    } else {
                        "legacy_current"
                    },
                ),
            revision = (existing?.revision ?: -1L) + 1L,
            listedBaselineAt = listedAt,
            updatedAt = now,
        )
        if (existing != null && !combatInputsChanged(existing, next) && existing.discLoadouts == next.discLoadouts &&
            existing.starStones == next.starStones
        ) {
            next = next.copy(starLevel = existing.starLevel, revision = existing.revision, updatedAt = existing.updatedAt)
        }
        if (existing != null && combatInputsChanged(existing, next)) next = next.markObservationStale()
        return next
    }

    private fun replaceFirstLoadout(existing: List<OperatorDiscLoadout>, discs: List<OperatorDisc>): List<OperatorDiscLoadout> {
        if (existing.isEmpty()) {
            return if (discs.isEmpty()) emptyList() else listOf(OperatorDiscLoadout("disc_1", "命盘一", discs))
        }
        return existing.toMutableList().also { it[0] = it[0].copy(discs = discs) }
    }

    private fun normalizeSpRelations(next: MutableMap<String, OperatorEntry>, writtenIds: Set<String>, now: Instant) {
        writtenIds.filter { it in next }.distinctBy { OperatorSharedGrowth.baseId(it, catalogService) }.forEach { id ->
            val source = next.getValue(id)
            if (source.levelBreakthroughStage == null) {
                val sharedStage = OperatorSharedGrowth.members(id, catalogService).asSequence().mapNotNull { next[it] }
                    .filter {
                        it.level == source.level
                    }.mapNotNull { OperatorLevelBreakthroughRules.read(it.level, it.levelBreakthroughStage) }.firstOrNull()
                if (sharedStage != null) {
                    next[id] = source.copy(
                        levelBreakthroughStage = sharedStage,
                        revision = source.revision + 1,
                        updatedAt = now,
                        combatStats = source.combatStats?.let { stats ->
                            if (stats.observedStatus != "unavailable" && (stats.observedAttack != null || stats.observedHp != null)) {
                                stats.copy(observedStatus = "stale")
                            } else {
                                stats
                            }
                        },
                    )
                }
            }
            OperatorSharedGrowth.synchronize(next, id, catalogService, now)
        }
    }

    private fun normalizedCurrent(current: OperatorCurrent): OperatorCurrentResponse = OperatorCurrentResponse.of(
        current.copy(
            entries = current.entries.mapValues { (id, entry) ->
                entry.copy(
                    huaji = OperatorHuajiRules.read(entry, catalogService.getOperator(id)),
                    huajiLegacy =
                    OperatorHuajiRules.trace(entry, catalogService.getOperator(id)),
                    combatStats = entry.combatStats?.let { stats ->
                        if (stats.observedStatus == "valid" &&
                            (
                                stats.observedInputs?.huaji == null ||
                                    OperatorLevelBreakthroughRules.read(
                                        stats.observedInputs?.level ?: 0,
                                        stats.observedInputs?.levelBreakthroughStage,
                                    ) == null
                                )
                        ) {
                            stats.copy(observedStatus = if (stats.observedInputs?.huaji == null) "stale" else "unverified")
                        } else {
                            stats
                        }
                    },
                )
            },
        ),
    )

    fun current(userId: String, accountId: String, game: String?): List<OperatorCurrentResponse> {
        val all = currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId)
        if (game == null) return all.map(::normalizedCurrent)
        val specific = all.firstOrNull { it.game == game }
        val genericSources = all.filter { it.game in GENERIC_GAME_KEYS }
        val legacyGeneric = genericSources.firstOrNull { it.game == GENERIC_GAME }
        val universalGeneric = genericSources.firstOrNull { it.game == UNIVERSAL_GAME }
        val genericEntries = (legacyGeneric?.entries.orEmpty() + universalGeneric?.entries.orEmpty())
        val generic = (universalGeneric ?: legacyGeneric)?.copy(entries = genericEntries)
        if (specific == null) return listOfNotNull(generic).map(::normalizedCurrent)
        if (genericEntries.isEmpty()) return listOf(normalizedCurrent(specific))
        return listOf(normalizedCurrent(specific.copy(entries = genericEntries + specific.entries)))
    }

    /** 清理公共图鉴已删除的密探，保留导入历史并记录清理事件供重放使用。 */
    fun removeOrphanCurrent(userId: String, accountId: String, operatorId: String) {
        accountRepository.findByUserIdAndAccountId(userId, accountId)
            ?: throw apiError(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        transactionTemplate.executeWithoutResult {
            if (catalogService.getOperator(operatorId) != null) {
                throw apiError(HttpStatus.CONFLICT, "operator_still_in_catalog", "Operator is still in the public catalog")
            }
            // 同时清理旧 universal / * 文档，避免当前版本删除后又从通用养成中继承。
            currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId).forEach { current ->
                val entry = current.entries[operatorId] ?: return@forEach
                val now = Instant.now()
                currentRepository.save(current.copy(entries = current.entries - operatorId, updatedAt = now))
                correctionRepository.save(
                    OperatorCorrectionRecord(
                        userId = userId,
                        accountId = accountId,
                        game = current.game,
                        operatorId = operatorId,
                        reason = "catalog_removed",
                        fields = emptySet(),
                        level = entry.level,
                        elite = entry.elite,
                        starLevel = entry.starLevel,
                        discLoadouts = entry.normalized().discLoadouts,
                        starStones = entry.starStones,
                        combatStats = entry.combatStats,
                        createdAt = now,
                    ),
                )
            }
        }
    }

    fun previewCurrentPatch(
        userId: String,
        accountId: String,
        game: String,
        operatorId: String,
        request: ObjectNode,
    ): OperatorCurrentPatchPreview {
        val prepared = prepareCurrentPatch(userId, accountId, game, operatorId, request)
        return OperatorCurrentPatchPreview(
            before = prepared.existing.takeIf { prepared.entryExisted }?.let { entry ->
                val catalog = checkNotNull(catalogService.getOperator(operatorId))
                OperatorCurrentEntryDto.of(OperatorHuajiRules.forDisplay(entry, catalog))
            },
            after = OperatorCurrentEntryDto.of(OperatorHuajiRules.forDisplay(prepared.merged, catalogService.getOperator(operatorId))),
            stale = prepared.stale,
        )
    }

    fun patchCurrent(userId: String, accountId: String, game: String, operatorId: String, request: ObjectNode): OperatorCurrentEntryDto {
        var saved: OperatorCurrent? = null
        transactionTemplate.executeWithoutResult {
            val prepared = prepareCurrentPatch(userId, accountId, game, operatorId, request)
            if (prepared.entryExisted && prepared.merged.revision == prepared.expectedRevision) {
                saved = prepared.sourceCurrent.copy(entries = prepared.sourceCurrent.entries + (operatorId to prepared.merged))
                return@executeWithoutResult
            }
            if (prepared.materializingEntry) {
                currentRepository.save(
                    prepared.sourceCurrent.copy(
                        entries = prepared.sourceCurrent.entries + (operatorId to prepared.existing),
                        updatedAt = prepared.now,
                    ),
                )
            }
            saved = currentRepository.compareAndSetEntries(
                userId,
                accountId,
                prepared.sourceCurrent.game,
                operatorId,
                prepared.expectedRevision,
                prepared.updates,
                prepared.now,
            ) ?: revisionConflict(operatorId)
            correctionRepository.save(
                OperatorCorrectionRecord(
                    userId = userId,
                    accountId = accountId,
                    game = prepared.sourceCurrent.game,
                    operatorId = operatorId,
                    reason = prepared.reason,
                    fields = prepared.fields,
                    level = prepared.merged.level.takeIf { "level" in prepared.fields },
                    elite = prepared.merged.elite.takeIf { "elite" in prepared.fields },
                    starLevel = prepared.merged.starLevel.takeIf { "star_level" in prepared.fields || "huaji" in prepared.fields },
                    huaji = prepared.merged.huaji.takeIf { "star_level" in prepared.fields || "huaji" in prepared.fields },
                    huajiLegacy = prepared.merged.huajiLegacy.takeIf { "star_level" in prepared.fields || "huaji" in prepared.fields },
                    discLoadouts = prepared.merged.discLoadouts.takeIf { "disc_loadouts" in prepared.fields },
                    starStones = prepared.merged.starStones.takeIf { "star_stones" in prepared.fields },
                    combatStats = prepared.merged.combatStats.takeIf { "combat_stats" in prepared.fields },
                    levelBreakthroughStage = prepared.merged.levelBreakthroughStage,
                    createdAt = prepared.now,
                ),
            )
        }
        return OperatorCurrentEntryDto.of(
            OperatorHuajiRules.forDisplay(checkNotNull(saved).entries.getValue(operatorId), catalogService.getOperator(operatorId)),
        )
    }

    fun completeFullImport(userId: String, accountId: String, game: String, operatorIds: Set<String>, effectiveAt: Instant) {
        val current = currentRepository.findByUserIdAndAccountIdAndGame(userId, accountId, game) ?: return
        val retained = current.entries.filterKeys { it in operatorIds }.toMutableMap()
        normalizeSpRelations(retained, operatorIds, Instant.now())
        currentRepository.save(
            current.copy(
                entries = retained,
                fullBaselineAt = effectiveAt,
                updatedAt = Instant.now(),
            ),
        )
        starStateService.pruneForOperatorCurrentChange(userId, accountId)
    }

    private fun prepareCurrentPatch(
        userId: String,
        accountId: String,
        game: String,
        operatorId: String,
        request: ObjectNode,
    ): PreparedCurrentPatch {
        rejectUnknown(
            request,
            setOf(
                "level", "level_breakthrough_stage", "elite", "star_level", "huaji", "huaji_legacy",
                "disc_loadouts", "star_stones", "combat_stats",
                "expected_revision", "reason",
            ),
            "schema_validation_failed",
            operatorId,
            "",
        )
        val expectedRevision = requiredLong(request, "expected_revision", operatorId)
        if (expectedRevision < 0) invalid("expected_revision must be non-negative", operatorId, "expected_revision")
        val reason = request.get("reason")?.takeIf { it.isTextual }?.asText()
            ?: invalid("reason is required", operatorId, "reason")
        if (reason !in CORRECTION_REASONS) invalid("Invalid correction reason", operatorId, "reason")
        val account = accountRepository.findByUserIdAndAccountId(userId, accountId)
            ?: throw apiError(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        if (game !in GAMES) throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_game", "Unsupported game")
        if (account.game != game) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "account_game_mismatch", "game must match the account game")
        }
        val catalog = catalogService.getOperator(operatorId)
            ?: throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "unknown_operator_id",
                "Unknown operator id: $operatorId",
                operator = operatorId,
            )
        if (game !in catalog.games) {
            throw apiError(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_game",
                "Operator is not available in game",
                operator = operatorId,
            )
        }
        val specificCurrent = currentRepository.findByUserIdAndAccountIdAndGame(userId, accountId, game)
        val genericCurrent = if (game in GENERIC_GAME_KEYS) {
            null
        } else {
            currentRepository.findByUserIdAndAccountIdAndGame(userId, accountId, UNIVERSAL_GAME)
                ?: currentRepository.findByUserIdAndAccountIdAndGame(userId, accountId, GENERIC_GAME)
        }
        val specificEntry = specificCurrent?.entries?.get(operatorId)?.normalized()
        val genericEntry = genericCurrent?.entries?.get(operatorId)?.normalized()
        val entryExisted = specificEntry != null || genericEntry != null
        val materializingEntry = specificEntry == null && (specificCurrent == null || genericEntry != null)
        val sourceCurrent = when {
            specificEntry != null -> checkNotNull(specificCurrent)
            genericEntry != null ->
                specificCurrent
                    ?: OperatorCurrent(
                        id = key(userId, accountId, game),
                        userId = userId,
                        accountId = accountId,
                        game = game,
                    )
            else -> {
                if (expectedRevision != 0L) revisionConflict(operatorId)
                specificCurrent ?: OperatorCurrent(
                    id = key(userId, accountId, game),
                    userId = userId,
                    accountId = accountId,
                    game = game,
                )
            }
        }
        // A generic entry is only a read fallback. The first edit materializes it in the requested game document.
        val shared = OperatorSharedGrowth.members(operatorId, catalogService).firstNotNullOfOrNull { id ->
            specificCurrent?.entries?.get(id) ?: genericCurrent?.entries?.get(id)
        }
        val existing = specificEntry ?: genericEntry ?: OperatorEntry(
            elite = shared?.elite ?: 0,
            starLevel = 0,
            level = shared?.level ?: 0,
            levelBreakthroughStage = shared?.levelBreakthroughStage,
        )
        if (existing.revision != expectedRevision) revisionConflict(operatorId)

        val now = Instant.now()
        val fields = mutableSetOf<String>()
        val sharedStage = OperatorSharedGrowth.members(operatorId, catalogService).asSequence()
            .mapNotNull { sourceCurrent.entries[it] }.filter { it.level == existing.level }
            .mapNotNull { OperatorLevelBreakthroughRules.read(it.level, it.levelBreakthroughStage) }.firstOrNull()
        var merged = existing.copy(
            huaji = OperatorHuajiRules.read(existing, catalog),
            levelBreakthroughStage = OperatorLevelBreakthroughRules.read(existing.level, existing.levelBreakthroughStage) ?: sharedStage,
        )
        if (request.has("level")) {
            fields += "level"
            val level = requiredInt(request, "level", operatorId)
            if (level !in 0..100) invalid("level must be 0..100", operatorId, "level")
            merged = merged.copy(
                level = level,
                levelBreakthroughStage = if (level ==
                    existing.level
                ) {
                    merged.levelBreakthroughStage
                } else {
                    OperatorLevelBreakthroughRules.inferred(level)
                },
            )
        }
        if (request.has("level_breakthrough_stage")) {
            fields += "level_breakthrough_stage"
            val stage = optionalInt(request, "level_breakthrough_stage", operatorId, "level_breakthrough_stage")
            OperatorLevelBreakthroughRules.requireValid(merged.level, stage, operatorId)
            merged = merged.copy(levelBreakthroughStage = stage)
        }
        if (request.has("elite")) {
            fields += "elite"
            val elite = requiredInt(request, "elite", operatorId)
            if (elite !in 0..17) invalid("elite must be 0..17", operatorId, "elite")
            merged = merged.copy(elite = elite)
        }
        if (request.has("star_level")) {
            fields += "star_level"
            val starLevel = requiredInt(request, "star_level", operatorId)
            validateStarLevel(starLevel, catalog)
            if (OperatorHuajiRules.anomalous(
                    starLevel,
                    catalog,
                )
            ) {
                invalid("Hidden rarity progress requires review", operatorId, "star_level", "invalid_star_level")
            }
            merged = merged.copy(
                starLevel = starLevel,
                huaji = OperatorHuajiRules.legacy(starLevel, catalog, merged.huaji),
                huajiLegacy =
                existing.huajiLegacy
                    ?: com.lhs.share.hub.repository.entity.OperatorHuajiLegacy(
                        if (entryExisted) existing.starLevel else starLevel,
                        if (entryExisted) "legacy_current" else reason,
                    ),
            )
        }
        if (request.has("huaji")) {
            fields += "huaji"
            val huaji = OperatorHuajiRules.patch(request.get("huaji"), catalog, checkNotNull(merged.huaji))
            if (request.has("star_level")) {
                val legacy = checkNotNull(merged.huaji)
                if (huaji.owned != legacy.owned ||
                    (request.path("star_level").asInt() != 31 && legacy.stage != null && huaji.stage != legacy.stage) ||
                    (request.path("star_level").asInt() == 31 && huaji.awakened != true)
                ) {
                    invalid("Conflicting legacy and normalized huaji", operatorId, "huaji", "huaji_conflict")
                }
            }
            merged = merged.copy(
                huaji = huaji,
                starLevel = OperatorHuajiRules.compatible(huaji, catalog, merged.starLevel),
                huajiLegacy =
                merged.huajiLegacy ?: com.lhs.share.hub.repository.entity.OperatorHuajiLegacy(existing.starLevel, "legacy_current"),
            )
        }
        if (request.has("huaji_legacy")) {
            if (!request.has("huaji")) invalid("Legacy trace requires independent facts", operatorId, "huaji_legacy")
            val trace = request.get("huaji_legacy") as? ObjectNode ?: invalid("Invalid legacy trace", operatorId, "huaji_legacy")
            rejectUnknown(trace, setOf("raw", "source"), "schema_validation_failed", operatorId, "huaji_legacy")
            val raw = requiredInt(trace, "raw", operatorId, "huaji_legacy.raw")
            val source = requiredText(trace, "source", operatorId)
            if (raw !in 0..31 || source.length > 128) invalid("Invalid legacy trace", operatorId, "huaji_legacy")
            merged = merged.copy(huajiLegacy = com.lhs.share.hub.repository.entity.OperatorHuajiLegacy(raw, source))
        }
        if (request.has("disc_loadouts")) {
            fields += "disc_loadouts"
            merged = merged.copy(
                discLoadouts = parseDiscLoadouts(request.get("disc_loadouts"), catalog, existing.normalized().discLoadouts),
                discs = emptyList(),
            )
            merged = merged.copy(discs = merged.discLoadouts.firstOrNull()?.discs.orEmpty())
        }
        if (request.has("star_stones")) {
            fields += "star_stones"
            merged = merged.copy(starStones = parsePatchStarStones(request.get("star_stones"), catalog))
        }
        val hasCombatPatch = request.has("combat_stats")
        if (hasCombatPatch) {
            fields += "combat_stats"
            val node = request.get("combat_stats")
            merged = if (node == null || node.isNull) {
                merged.copy(combatStats = null)
            } else {
                merged.copy(combatStats = mergeCombatStats(merged.combatStats, node, catalog, operatorId))
            }
        }
        if (fields.isEmpty()) invalid("At least one patch field is required", operatorId, "")
        merged = merged.normalized()
        val freshObservation = hasFreshObservation(request, merged)
        val legacySignedObservation = request.path("combat_stats").hasNonNull("combat_input_signature") &&
            !request.path("combat_stats").path("observed_inputs").has("huaji")
        val stale =
            !freshObservation &&
                (combatInputsChanged(existing.copy(huaji = OperatorHuajiRules.read(existing, catalog)), merged) || legacySignedObservation)
        merged = when {
            freshObservation -> merged.withFreshObservationMetadata(request.path("combat_stats"))
            legacySignedObservation &&
                (request.path("combat_stats").hasNonNull("observed_attack") || request.path("combat_stats").hasNonNull("observed_hp")) ->
                merged.withFreshObservationMetadata(request.path("combat_stats"), verified = false)
            hasCombatPatch &&
                (request.path("combat_stats").hasNonNull("observed_attack") || request.path("combat_stats").hasNonNull("observed_hp")) ->
                merged.withFreshObservationMetadata(request.path("combat_stats"), verified = false)
            stale -> merged.markObservationStale()
            else -> merged
        }
        val sameFacts = entryExisted && existing.level == merged.level && existing.elite == merged.elite &&
            OperatorLevelBreakthroughRules.read(existing.level, existing.levelBreakthroughStage) ==
            OperatorLevelBreakthroughRules.read(merged.level, merged.levelBreakthroughStage) &&
            OperatorHuajiRules.read(existing, catalog) == merged.huaji && existing.discLoadouts == merged.discLoadouts &&
            existing.starStones == merged.starStones && existing.combatStats == merged.combatStats
        if (sameFacts) merged = merged.copy(starLevel = existing.starLevel, huajiLegacy = existing.huajiLegacy)
        // An unrelated edit must not replace a historical invalid stage with its display-only unknown value.
        if ("huaji" !in fields && "star_level" !in fields &&
            existing.huaji?.stage?.let { OperatorHuajiRules.anomalous(it, catalog) } == true
        ) {
            merged = merged.copy(huaji = existing.huaji, huajiLegacy = existing.huajiLegacy)
        }
        merged = merged.copy(
            revision = if (sameFacts) expectedRevision else expectedRevision + 1,
            updatedAt = if (sameFacts) existing.updatedAt else now,
        ).normalized()

        val next = sourceCurrent.entries.toMutableMap().also { it[operatorId] = merged }
        val inheritedIds = OperatorSharedGrowth.members(operatorId, catalogService).filter {
            it !in next &&
                genericCurrent?.entries?.containsKey(it) == true
        }
        inheritedIds.forEach { id -> next[id] = genericCurrent!!.entries.getValue(id).normalized().copy(revision = 0) }
        OperatorSharedGrowth.synchronize(next, operatorId, catalogService, now)
        inheritedIds.forEach { id -> next[id] = next.getValue(id).copy(revision = 1, updatedAt = now) }
        val updates = next.filter { (id, value) -> id == operatorId || value != sourceCurrent.entries[id] }

        return PreparedCurrentPatch(
            sourceCurrent = sourceCurrent,
            entryExisted = entryExisted,
            materializingEntry = materializingEntry,
            existing = existing,
            merged = merged,
            expectedRevision = expectedRevision,
            updates = updates,
            fields = fields,
            reason = reason,
            stale = stale,
            now = now,
        )
    }

    private fun parsePatchStarStones(node: JsonNode?, catalog: OperatorCatalogEntity): List<OperatorStarStone> {
        if (node == null || node.isNull || !node.isArray) {
            invalid(
                "star_stones must be an array",
                catalog.operatorId,
                "star_stones",
                "invalid_equipped_star_stones",
            )
        }
        val types = mutableSetOf<String>()
        return node.mapIndexed { index, raw ->
            if (!raw.isObject) {
                invalid(
                    "star stone must be an object",
                    catalog.operatorId,
                    "star_stones[$index]",
                    "invalid_equipped_star_stones",
                )
            }
            val item = raw as ObjectNode
            rejectUnknown(
                item,
                setOf("name", "type", "level"),
                "invalid_equipped_star_stones",
                catalog.operatorId,
                "star_stones[$index]",
            )
            val type = item.get("type")?.takeIf { it.isTextual }?.asText()?.trim()
                ?: invalid(
                    "star stone type is required",
                    catalog.operatorId,
                    "star_stones[$index].type",
                    "invalid_equipped_star_stones",
                )
            if (type !in PATCH_STONE_TYPES || !types.add(type)) {
                invalid(
                    "star stone type must be unique and one of main1..main3 or assist1..assist3",
                    catalog.operatorId,
                    "star_stones[$index].type",
                    "invalid_equipped_star_stones",
                )
            }
            val nameNode = item.get("name")
            val name = if (nameNode != null && nameNode.isTextual && nameNode.asText().trim().length in 1..128) {
                nameNode.asText().trim()
            } else {
                invalid(
                    "star stone name must be a non-empty string",
                    catalog.operatorId,
                    "star_stones[$index].name",
                    "invalid_equipped_star_stones",
                )
            }
            val level = item.get("level")
            if (level == null || !level.isIntegralNumber || !level.canConvertToInt() || level.intValue() < 0) {
                invalid(
                    "star stone level must be a non-negative integer",
                    catalog.operatorId,
                    "star_stones[$index].level",
                    "invalid_equipped_star_stones",
                )
            }
            val catalogType = when {
                type.startsWith("main") -> "main"
                type.startsWith("assist") -> "assist"
                else -> type
            }
            if (catalog.starStones.isNotEmpty() && catalog.starStones.none { it.type == catalogType || it.type == type }) {
                invalid(
                    "star stone type is not supported by the operator catalog",
                    catalog.operatorId,
                    "star_stones[$index].type",
                    "invalid_equipped_star_stones",
                )
            }
            OperatorStarStone(name, type, level.intValue())
        }
    }

    private fun parseDiscLoadouts(
        node: JsonNode?,
        catalog: OperatorCatalogEntity,
        existing: List<OperatorDiscLoadout>,
    ): List<OperatorDiscLoadout> {
        if (node == null || node.isNull || !node.isArray) {
            invalid("disc_loadouts must be an array", catalog.operatorId, "disc_loadouts", "invalid_disc_loadout")
        }
        if (node.size() > 2) {
            invalid("disc_loadouts supports at most two loadouts", catalog.operatorId, "disc_loadouts", "invalid_disc_loadout")
        }
        val ids = mutableSetOf<String>()
        val parsed = node.mapIndexed { index, raw ->
            if (!raw.isObject) {
                invalid("loadout must be an object", catalog.operatorId, "disc_loadouts[$index]", "invalid_disc_loadout")
            }
            val item = raw as ObjectNode
            rejectUnknown(
                item,
                setOf("id", "name", "discs", "status", "target_discs"),
                "invalid_disc_loadout",
                catalog.operatorId,
                "disc_loadouts[$index]",
            )
            val id = item.get("id")?.takeIf { it.isTextual }?.asText()?.trim().orEmpty()
            if (id.length !in 1..64 || !ids.add(id)) {
                invalid(
                    "loadout id must be unique with length 1..64",
                    catalog.operatorId,
                    "disc_loadouts[$index].id",
                    "invalid_disc_loadout",
                )
            }
            val submittedName = item.get("name")
            val name = if (submittedName == null || submittedName.isNull || submittedName.asText().isBlank()) {
                if (index == 0) "命盘一" else "命盘二"
            } else if (submittedName.isTextual) {
                submittedName.asText().trim()
            } else {
                invalid(
                    "loadout name must be a string",
                    catalog.operatorId,
                    "disc_loadouts[$index].name",
                    "invalid_disc_loadout",
                )
            }
            if (name.length !in 1..64) {
                invalid(
                    "loadout name length must be 1..64",
                    catalog.operatorId,
                    "disc_loadouts[$index].name",
                    "invalid_disc_loadout",
                )
            }
            val status = if (item.has("status")) {
                item.get("status").takeIf { it.isTextual && it.asText() in setOf("unmarked", "reroll", "perfect") }?.asText()
                    ?: invalid("Invalid disc status", catalog.operatorId, "disc_loadouts[$index].status", "invalid_disc_loadout")
            } else {
                existing.getOrNull(index)?.status ?: "unmarked"
            }
            val discs = parseLoadoutDiscs(item.get("discs"), catalog, "disc_loadouts[$index].discs")
            val targets = if (item.has("target_discs")) {
                parseLoadoutDiscs(item.get("target_discs"), catalog, "disc_loadouts[$index].target_discs")
            } else {
                existing.getOrNull(index)?.targetDiscs.orEmpty()
            }
            OperatorDiscLoadout(id, name, discs, status, targets)
        }
        // 采集或旧客户端只更新实际命盘；遗漏的目标槽仍属于原来的命盘一/二。
        return parsed + existing.drop(parsed.size).map { it.copy(discs = emptyList()) }
            .takeIf { tail -> tail.any { it.status != "unmarked" || it.targetDiscs.isNotEmpty() } }.orEmpty()
    }

    private fun parseLoadoutDiscs(discsNode: JsonNode?, catalog: OperatorCatalogEntity, path: String): List<OperatorDisc> {
        if (discsNode == null || discsNode.isNull || !discsNode.isArray || discsNode.size() > 3) {
            invalid(
                "loadout discs must be an array with at most three items",
                catalog.operatorId,
                path,
                "invalid_disc_loadout",
            )
        }
        val names = mutableSetOf<String>()
        return discsNode.mapIndexed { discIndex, rawDisc ->
            if (!rawDisc.isObject) {
                invalid(
                    "disc must be an object",
                    catalog.operatorId,
                    "$path[$discIndex]",
                    "invalid_disc_loadout",
                )
            }
            val disc = rawDisc as ObjectNode
            rejectUnknown(
                disc,
                setOf("ot_name"),
                "invalid_disc_loadout",
                catalog.operatorId,
                "$path[$discIndex]",
            )
            val otName = disc.get("ot_name")?.takeIf { it.isTextual }?.asText()
                ?: invalid(
                    "ot_name is required",
                    catalog.operatorId,
                    "$path[$discIndex].ot_name",
                    "invalid_disc_loadout",
                )
            val catalogDisc = catalog.discs.firstOrNull { it.otName == otName }
                ?: invalid(
                    "disc is not in the operator catalog",
                    catalog.operatorId,
                    "$path[$discIndex].ot_name",
                    "invalid_disc_loadout",
                )
            if (!names.add(otName)) {
                invalid(
                    "disc ot_name must be unique within a loadout",
                    catalog.operatorId,
                    path,
                    "invalid_disc_loadout",
                )
            }
            OperatorDisc(catalogDisc.otName, catalogDisc.abbreviation, catalogDisc.color, catalogDisc.desp)
        }
    }

    private fun mergeCombatStats(
        existing: OperatorCombatStats?,
        raw: JsonNode,
        catalog: OperatorCatalogEntity,
        operatorId: String,
    ): OperatorCombatStats {
        if (!raw.isObject) {
            invalid("combat_stats must be an object or null", operatorId, "combat_stats", "invalid_combat_stats")
        }
        val node = raw as ObjectNode
        rejectUnknown(
            node,
            setOf(
                "observed_attack",
                "observed_hp",
                "manual_attack",
                "manual_hp",
                "source",
                "observed_at",
                "observed_status",
                "combat_input_signature",
                "observed_inputs",
                "display_mode",
                "oddities",
            ),
            "invalid_combat_stats",
            operatorId,
            "combat_stats",
        )
        var result = existing ?: OperatorCombatStats()
        if (node.has("observed_attack")) {
            result = result.copy(observedAttack = nullableNonNegativeLong(node, "observed_attack", operatorId))
        }
        if (node.has("observed_hp")) {
            result = result.copy(observedHp = nullableNonNegativeLong(node, "observed_hp", operatorId))
        }
        if (node.has("manual_attack")) {
            result = result.copy(manualAttack = nullableNonNegativeLong(node, "manual_attack", operatorId))
        }
        if (node.has("manual_hp")) {
            result = result.copy(manualHp = nullableNonNegativeLong(node, "manual_hp", operatorId))
        }
        if (node.has("source")) {
            val source = requiredText(node, "source", operatorId)
            if (source !in COMBAT_SOURCES) {
                invalid("Invalid combat source", operatorId, "combat_stats.source", "invalid_combat_stats")
            }
            result = result.copy(source = source)
        }
        if (node.has("observed_status")) {
            val status = requiredText(node, "observed_status", operatorId)
            if (status !in OBSERVED_STATUSES) {
                invalid("Invalid observed status", operatorId, "combat_stats.observed_status", "invalid_combat_stats")
            }
            result = result.copy(observedStatus = status)
        }
        if (node.has("observed_at")) {
            val atNode = node.get("observed_at")
            result = result.copy(observedAt = if (atNode.isNull) null else parseInstantNode(atNode, operatorId, "combat_stats.observed_at"))
        }
        if (node.has("combat_input_signature")) {
            val signatureNode = node.get("combat_input_signature")
            val signature = if (signatureNode.isNull) null else requiredText(node, "combat_input_signature", operatorId)
            if (signature != null && signature.length !in 1..256) {
                invalid(
                    "combat_input_signature length must be 1..256",
                    operatorId,
                    "combat_stats.combat_input_signature",
                    "invalid_combat_stats",
                )
            }
            result = result.copy(combatInputSignature = signature)
        }
        if (node.has("observed_inputs")) {
            val inputs = node.get("observed_inputs")
            result = result.copy(observedInputs = if (inputs.isNull) null else parseObservedInputs(inputs, operatorId, catalog))
        }
        if (node.has("display_mode")) {
            val displayMode = node.get("display_mode")
            result = result.copy(
                displayMode = if (displayMode.isNull) {
                    null
                } else {
                    mergeDisplayMode(result.displayMode, displayMode, operatorId)
                },
            )
        }
        if (node.has("oddities")) result = result.copy(oddities = mergeOddities(result.oddities, node.get("oddities"), catalog, operatorId))
        return result
    }

    private fun mergeDisplayMode(existing: OperatorCombatDisplayMode?, raw: JsonNode, operatorId: String): OperatorCombatDisplayMode? {
        if (!raw.isObject) {
            invalid("display_mode must be an object or null", operatorId, "combat_stats.display_mode", "invalid_combat_stats")
        }
        val node = raw as ObjectNode
        rejectUnknown(node, setOf("attack", "hp"), "invalid_combat_stats", operatorId, "combat_stats.display_mode")
        if (!node.has("attack") && !node.has("hp")) return existing
        var result = existing ?: OperatorCombatDisplayMode()
        if (node.has("attack")) result = result.copy(attack = parseDisplayModeValue(node.get("attack"), operatorId, "attack"))
        if (node.has("hp")) result = result.copy(hp = parseDisplayModeValue(node.get("hp"), operatorId, "hp"))
        return result
    }

    private fun parseDisplayModeValue(node: JsonNode, operatorId: String, field: String): String? {
        if (node.isNull) return null
        if (!node.isTextual || node.asText() !in DISPLAY_MODES) {
            invalid(
                "display mode must be auto, manual, or null",
                operatorId,
                "combat_stats.display_mode.$field",
                "invalid_combat_stats",
            )
        }
        return node.asText()
    }

    private fun mergeOddities(
        existing: Map<String, OperatorOddityValue>,
        raw: JsonNode,
        catalog: OperatorCatalogEntity,
        operatorId: String,
    ): Map<String, OperatorOddityValue> {
        if (!raw.isObject) invalid("oddities must be an object", operatorId, "combat_stats.oddities", "invalid_combat_stats")
        val oddities = raw as ObjectNode
        rejectUnknown(oddities, ODDITY_KEYS, "invalid_combat_stats", operatorId, "combat_stats.oddities")
        val limits = oddityLimits(catalog.rarity)
        val merged = existing.toMutableMap()
        oddities.fieldNames().asSequence().forEach { key ->
            val value = oddities.get(key)
            if (!value.isObject) {
                invalid("oddity must be an object", operatorId, "combat_stats.oddities.$key", "invalid_combat_stats")
            }
            val oddity = value as ObjectNode
            rejectUnknown(
                oddity,
                setOf("current", "max"),
                "invalid_combat_stats",
                operatorId,
                "combat_stats.oddities.$key",
            )
            val current = OperatorOddityValidation.requireCurrent(key, oddity.get("current"), limits.getValue(key), operatorId)
            if (oddity.has("max")) {
                val diagnosticMax = requiredInt(
                    oddity,
                    "max",
                    operatorId,
                    "combat_stats.oddities.$key.max",
                    "invalid_combat_stats",
                )
                if (diagnosticMax < 0) {
                    invalid(
                        "oddity max must be non-negative",
                        operatorId,
                        "combat_stats.oddities.$key.max",
                        "invalid_combat_stats",
                    )
                }
            }
            merged[key] = OperatorOddityValue(current)
        }
        return merged
    }

    private fun parseObservedInputs(node: JsonNode, operatorId: String, catalog: OperatorCatalogEntity): OperatorObservedInputs {
        if (!node.isObject) {
            invalid("observed_inputs must be an object", operatorId, "combat_stats.observed_inputs", "invalid_combat_stats")
        }
        val item = node as ObjectNode
        rejectUnknown(
            item,
            setOf(
                "level",
                "level_breakthrough_stage",
                "elite",
                "star_level",
                "huaji",
                "oddities_signature",
                "equipped_star_stones_signature",
            ),
            "invalid_combat_stats",
            operatorId,
            "combat_stats.observed_inputs",
        )
        val level = optionalInt(item, "level", operatorId, "combat_stats.observed_inputs.level")
        val elite = optionalInt(item, "elite", operatorId, "combat_stats.observed_inputs.elite")
        val starLevel = optionalInt(item, "star_level", operatorId, "combat_stats.observed_inputs.star_level")
        val breakthrough =
            optionalInt(item, "level_breakthrough_stage", operatorId, "combat_stats.observed_inputs.level_breakthrough_stage")
        if (breakthrough != null) OperatorLevelBreakthroughRules.requireValid(level ?: 0, breakthrough, operatorId)
        if (level != null && level !in 0..100) {
            invalid("observed level must be 0..100", operatorId, "combat_stats.observed_inputs.level", "invalid_combat_stats")
        }
        if (elite != null && elite !in 0..17) {
            invalid("observed elite must be 0..17", operatorId, "combat_stats.observed_inputs.elite", "invalid_combat_stats")
        }
        if (starLevel != null && starLevel !in 0..31) {
            invalid(
                "observed star_level must be 0..31",
                operatorId,
                "combat_stats.observed_inputs.star_level",
                "invalid_combat_stats",
            )
        }
        return OperatorObservedInputs(
            level,
            elite,
            starLevel,
            optionalText(item, "oddities_signature", operatorId),
            optionalText(item, "equipped_star_stones_signature", operatorId),
            if (item.has(
                    "huaji",
                )
            ) {
                OperatorHuajiRules.patch(
                    item.get("huaji"),
                    catalog,
                    com.lhs.share.hub.repository.entity.OperatorHuaji(true, null, null),
                )
            } else {
                null
            },
            breakthrough,
        )
    }

    private fun hasFreshObservation(request: ObjectNode, merged: OperatorEntry): Boolean {
        val raw = request.path("combat_stats")
        val stage = OperatorLevelBreakthroughRules.read(merged.level, merged.levelBreakthroughStage)
        val inputs = merged.combatStats?.observedInputs
        val sameCapture = if (raw.has("observed_inputs")) {
            inputs != null && inputs.level == merged.level &&
                OperatorLevelBreakthroughRules.read(merged.level, inputs.levelBreakthroughStage) == stage &&
                (inputs.elite == null || inputs.elite == merged.elite) &&
                (inputs.starLevel == null || inputs.starLevel == merged.starLevel)
        } else {
            OperatorLevelBreakthroughRules.inferred(merged.level) != null ||
                (
                    !raw.hasNonNull("combat_input_signature") && request.hasNonNull("level") &&
                        request.hasNonNull("level_breakthrough_stage")
                    )
        }
        return raw.isObject && raw.path("observed_status").asText() !in setOf("stale", "unverified", "unavailable") &&
            (raw.hasNonNull("observed_attack") || raw.hasNonNull("observed_hp")) &&
            merged.combatStats?.source in OBSERVATION_SOURCES && stage != null && sameCapture &&
            (!raw.hasNonNull("combat_input_signature") || (raw.path("observed_inputs").has("huaji") && inputs?.huaji == merged.huaji))
    }

    fun listRecords(
        userId: String,
        accountId: String,
        game: String?,
        from: Instant?,
        to: Instant?,
        cursor: String?,
        limit: Int,
    ): OperatorRecordPageResponse {
        if (limit !in 1..100) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "limit must be 1..100")
        }
        var records = recordRepository.findByUserIdAndAccountIdOrderByEffectiveAtDesc(userId, accountId).filter {
            (game == null || it.game == game) &&
                (from == null || !it.effectiveAt.isBefore(from)) &&
                (to == null || it.effectiveAt.isBefore(to))
        }
        if (cursor != null) {
            val split = String(Base64.getUrlDecoder().decode(cursor)).split("|", limit = 2)
            val at = Instant.parse(split[0])
            records = records.dropWhile {
                !it.effectiveAt.isBefore(at) || (it.effectiveAt.equals(at) && it.recordId >= split[1])
            }
        }
        val page = records.take(limit)
        val next = if (records.size > limit) {
            Base64.getUrlEncoder().withoutPadding().encodeToString(
                (page.last().effectiveAt.toString() + "|" + page.last().recordId).toByteArray(),
            )
        } else {
            null
        }
        return OperatorRecordPageResponse(
            page.map {
                OperatorRecordListItemDto(
                    it.accountId,
                    it.recordId,
                    it.recordType,
                    it.game,
                    it.snapshotScope,
                    it.effectiveAt,
                    it.receivedAt,
                    it.snapshotEffect,
                    it.entries,
                )
            },
            next,
        )
    }

    fun deleteRecord(userId: String, accountId: String, recordId: String) {
        val target = recordRepository.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId)
            ?: throw apiError(HttpStatus.NOT_FOUND, "record_not_found", "Record not found")
        transactionTemplate.executeWithoutResult {
            recordRepository.delete(target)
            val game = target.game ?: GENERIC_GAME
            currentRepository.deleteByUserIdAndAccountIdAndGame(userId, accountId, game)
            val records = recordRepository.findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc(
                userId,
                accountId,
                target.game,
            )
            val corrections = correctionRepository.findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc(
                userId,
                accountId,
                game,
            )
            val events = records.map { ReplayEvent(it.receivedAt, "record:${it.recordId}", it, null) } +
                corrections.map { ReplayEvent(it.createdAt, "correction:${it.id.orEmpty()}", null, it) }
            events.sortedWith(compareBy<ReplayEvent> { it.at }.thenBy { it.key }).forEach { event ->
                event.record?.let { record ->
                    val effect = applyRecord(userId, Validated(record.toRequest(), record.effectiveAt))
                    if (record.snapshotEffect != effect) recordRepository.save(record.copy(snapshotEffect = effect))
                }
                event.correction?.let(::applyCorrectionReplay)
            }
            starStateService.pruneForOperatorCurrentChange(userId, accountId)
        }
    }

    private fun applyCorrectionReplay(correction: OperatorCorrectionRecord) {
        val current = currentRepository.findByUserIdAndAccountIdAndGame(
            correction.userId,
            correction.accountId,
            correction.game,
        ) ?: OperatorCurrent(
            id = key(correction.userId, correction.accountId, correction.game),
            userId = correction.userId,
            accountId = correction.accountId,
            game = correction.game,
        )
        if (correction.reason == "catalog_removed") {
            currentRepository.save(current.copy(entries = current.entries - correction.operatorId, updatedAt = correction.createdAt))
            return
        }
        if (catalogService.getOperator(correction.operatorId) == null) return
        val shared = OperatorSharedGrowth.members(correction.operatorId, catalogService).firstNotNullOfOrNull { current.entries[it] }
        val existing = current.entries[correction.operatorId]?.normalized()
            ?: OperatorEntry(shared?.elite ?: 0, 0, shared?.level ?: 0, levelBreakthroughStage = shared?.levelBreakthroughStage)
        val catalog = checkNotNull(catalogService.getOperator(correction.operatorId))
        val sharedStage = OperatorSharedGrowth.members(correction.operatorId, catalogService).asSequence()
            .mapNotNull { current.entries[it] }.filter { it.level == existing.level }
            .mapNotNull { OperatorLevelBreakthroughRules.read(it.level, it.levelBreakthroughStage) }.firstOrNull()
        var merged = existing.copy(
            levelBreakthroughStage =
            OperatorLevelBreakthroughRules.read(existing.level, existing.levelBreakthroughStage) ?: sharedStage,
        )
        if ("level" in correction.fields) {
            val level = checkNotNull(correction.level)
            merged = merged.copy(
                level = level,
                levelBreakthroughStage = if (level ==
                    existing.level
                ) {
                    merged.levelBreakthroughStage
                } else {
                    OperatorLevelBreakthroughRules.inferred(level)
                },
            )
        }
        if ("level_breakthrough_stage" in
            correction.fields
        ) {
            merged = merged.copy(levelBreakthroughStage = correction.levelBreakthroughStage)
        }
        if ("elite" in correction.fields) merged = merged.copy(elite = checkNotNull(correction.elite))
        if ("star_level" in correction.fields || "huaji" in correction.fields) {
            val catalog = checkNotNull(catalogService.getOperator(correction.operatorId))
            val raw = correction.starLevel ?: existing.starLevel
            merged = merged.copy(
                starLevel = raw,
                huaji = correction.huaji ?: OperatorHuajiRules.legacy(raw, catalog, OperatorHuajiRules.read(existing, catalog)),
                huajiLegacy = correction.huajiLegacy,
            )
        }
        if ("disc_loadouts" in correction.fields) {
            merged = merged.copy(discLoadouts = correction.discLoadouts.orEmpty())
            merged = merged.copy(discs = merged.discLoadouts.firstOrNull()?.discs.orEmpty())
        }
        if ("star_stones" in correction.fields) merged = merged.copy(starStones = correction.starStones.orEmpty())
        if ("combat_stats" in correction.fields) merged = merged.copy(combatStats = correction.combatStats)
        if (combatInputsChanged(existing.copy(huaji = OperatorHuajiRules.read(existing, catalog)), merged) &&
            "combat_stats" !in correction.fields
        ) {
            merged = merged.markObservationStale()
        }
        merged = merged.copy(revision = existing.revision + 1, updatedAt = correction.createdAt).normalized()
        val entries = current.entries.toMutableMap().also { it[correction.operatorId] = merged }
        OperatorSharedGrowth.synchronize(
            entries,
            correction.operatorId,
            catalogService,
            correction.createdAt,
        )
        currentRepository.save(current.copy(entries = entries, updatedAt = correction.createdAt))
    }

    fun export(userId: String, accountId: String?, scope: String?): OperatorExportResponse {
        if ((accountId == null && scope != "all") || (accountId != null && scope != null)) {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Specify account_id or scope=all")
        }
        val accounts = if (accountId != null) {
            listOf(
                accountRepository.findByUserIdAndAccountId(userId, accountId)
                    ?: throw apiError(HttpStatus.NOT_FOUND, "account_not_found", "Account not found"),
            )
        } else {
            accountRepository.findAllByUserIdOrderByCreatedAtAsc(userId)
        }
        val exportId = UUID.randomUUID().toString().replace("-", "")
        val records = accounts.flatMap { account ->
            currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, account.accountId).map { current ->
                OperatorExportRecordDto(
                    account.accountId,
                    "myshare:export:$exportId:${account.accountId}:" +
                        if (current.game == GENERIC_GAME) "generic" else current.game,
                    game = current.game.takeUnless { it == GENERIC_GAME },
                    effectiveAt = current.fullBaselineAt ?: current.updatedAt,
                    entries = current.entries.map { (id, raw) ->
                        val entry = raw.normalized()
                        OperatorEntryRequest(
                            id = id,
                            elite = entry.elite,
                            starLevel = entry.starLevel,
                            level = entry.level,
                            discs = entry.discs.map { OperatorDiscRequest(it.otName, it.abbreviation, it.color, it.desp) },
                            starStones = entry.starStones.map { OperatorStarStoneRequest(it.name, it.type, it.level) },
                        )
                    },
                )
            }
        }
        return OperatorExportResponse(
            exportedAt = Instant.now(),
            catalogVersion = catalogService.currentCatalogVersion(),
            producer = ProducerDto("myshare", "5"),
            accounts = accounts.map { OperatorExportAccountDto(it.accountId, it.name) },
            records = records,
        )
    }

    private fun combatInputsChanged(beforeRaw: OperatorEntry, afterRaw: OperatorEntry): Boolean {
        val before = beforeRaw.normalized()
        val after = afterRaw.normalized()
        return before.level != after.level ||
            OperatorLevelBreakthroughRules.read(before.level, before.levelBreakthroughStage) !=
            OperatorLevelBreakthroughRules.read(after.level, after.levelBreakthroughStage) ||
            before.elite != after.elite ||
            (before.huaji ?: before.starLevel) != (after.huaji ?: after.starLevel) ||
            normalizedStarStones(before) != normalizedStarStones(after) ||
            before.combatStats?.oddities.orEmpty() != after.combatStats?.oddities.orEmpty()
    }

    private fun normalizedStarStones(entry: OperatorEntry): List<OperatorStarStone> = entry.normalized().starStones.sortedBy { it.type }

    private fun OperatorEntry.withFreshObservationMetadata(raw: JsonNode, verified: Boolean = true): OperatorEntry {
        val normalized = normalized()
        val stats = normalized.combatStats ?: return normalized
        val hasAttack = raw.hasNonNull("observed_attack")
        val hasHp = raw.hasNonNull("observed_hp")
        val displayMode = stats.displayMode ?: OperatorCombatDisplayMode()
        return normalized.copy(
            combatStats = stats.copy(
                manualAttack = if (hasAttack && !raw.has("manual_attack")) stats.observedAttack else stats.manualAttack,
                manualHp = if (hasHp && !raw.has("manual_hp")) stats.observedHp else stats.manualHp,
                observedStatus = when {
                    verified -> "valid"
                    raw.path("observed_status").asText() in setOf("stale", "unavailable") -> stats.observedStatus
                    raw.hasNonNull("combat_input_signature") && !raw.path("observed_inputs").has("huaji") -> "stale"
                    raw.hasNonNull("observed_inputs") && stats.observedInputs?.levelBreakthroughStage != null &&
                        OperatorLevelBreakthroughRules.read(normalized.level, normalized.levelBreakthroughStage) !=
                        stats.observedInputs.levelBreakthroughStage -> "stale"
                    else -> "unverified"
                },
                combatInputSignature = if (!verified) {
                    stats.combatInputSignature.takeIf { raw.hasNonNull("combat_input_signature") }
                } else {
                    stats.combatInputSignature.takeIf {
                        raw.hasNonNull("combat_input_signature")
                    } ?: combatInputSignature(normalized)
                },
                observedInputs = if (raw.has("observed_inputs")) {
                    stats.observedInputs
                } else if (!verified) {
                    OperatorObservedInputs(level = normalized.level, huaji = null, levelBreakthroughStage = null)
                } else {
                    OperatorObservedInputs(
                        level = normalized.level,
                        levelBreakthroughStage = OperatorLevelBreakthroughRules.read(normalized.level, normalized.levelBreakthroughStage),
                        elite = normalized.elite,
                        starLevel = normalized.starLevel,
                        huaji = normalized.huaji,
                        odditiesSignature = signature(canonicalOddities(normalized)),
                        equippedStarStonesSignature = signature(canonicalStarStones(normalized)),
                    )
                },
                displayMode = displayMode.copy(
                    attack = if (hasAttack && !raw.has("manual_attack") &&
                        !raw.path("display_mode").has("attack")
                    ) {
                        "manual"
                    } else {
                        displayMode.attack
                    },
                    hp = if (hasHp && !raw.has("manual_hp") && !raw.path("display_mode").has("hp")) "manual" else displayMode.hp,
                ).takeIf { it.attack != null || it.hp != null } ?: stats.displayMode,
            ),
        )
    }

    private fun combatInputSignature(entry: OperatorEntry): String {
        val normalized = entry.normalized()
        val canonical = ObjectNode(JSON_NODE_FACTORY).apply {
            put("level", normalized.level)
            val breakthrough = OperatorLevelBreakthroughRules.read(normalized.level, normalized.levelBreakthroughStage)
            if (breakthrough == null) putNull("level_breakthrough_stage") else put("level_breakthrough_stage", breakthrough)
            put("elite", normalized.elite)
            put("star_level", normalized.starLevel)
            normalized.huaji?.let { huaji ->
                val node = putObject("huaji").put("owned", huaji.owned)
                if (huaji.stage == null) node.putNull("stage") else node.put("stage", huaji.stage)
                if (huaji.awakened == null) node.putNull("awakened") else node.put("awakened", huaji.awakened)
            }
            set<JsonNode>("oddities", canonicalOddities(normalized))
            set<JsonNode>("equipped_star_stones", canonicalStarStones(normalized))
        }
        return signature(canonical)
    }

    private fun canonicalOddities(entry: OperatorEntry): ObjectNode = ObjectNode(JSON_NODE_FACTORY).apply {
        ODDITY_KEYS_IN_ORDER.forEach { key ->
            val current = entry.combatStats?.oddities?.get(key)?.current
            set<JsonNode>(
                key,
                ObjectNode(JSON_NODE_FACTORY).apply {
                    if (current == null) putNull("current") else set<JsonNode>("current", oddityNumberNode(current))
                },
            )
        }
    }

    private fun canonicalStarStones(entry: OperatorEntry): ArrayNode = ArrayNode(JSON_NODE_FACTORY).apply {
        entry.normalized().starStones
            .sortedWith(
                compareBy<OperatorStarStone> { STONE_SLOT_INDEX[it.type] ?: Int.MAX_VALUE }
                    .thenBy { it.type }
                    .thenBy { it.name ?: "" }
                    .thenBy { it.level },
            ).forEach { stone ->
                add(
                    ObjectNode(JSON_NODE_FACTORY).apply {
                        put("type", stone.type)
                        if (stone.name == null) putNull("name") else put("name", stone.name)
                        put("level", stone.level)
                    },
                )
            }
    }

    private fun signature(node: JsonNode): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(node.toString().toByteArray(StandardCharsets.UTF_8))
        return "sha256:${HexFormat.of().formatHex(digest)}"
    }

    private fun OperatorEntry.markObservationStale(): OperatorEntry {
        val stats = combatStats ?: return this
        if (stats.observedAttack == null && stats.observedHp == null) return this
        if (stats.observedStatus == "unavailable") return this
        return copy(combatStats = stats.copy(observedStatus = "stale"))
    }

    private fun oddityLimits(rarity: Int): Map<String, Int> {
        val schema = OperatorOddityRules.schema(rarity, null)
        return mapOf("attack" to schema.attack.max, "hp" to schema.hp.max, "special" to schema.special.max)
    }

    private fun sameBody(existing: OperatorRecord, request: OperatorRecordRequest): Boolean = existing.recordType == request.recordType &&
        existing.game == request.game &&
        existing.snapshotScope == request.snapshotScope &&
        (existing.effectiveAtPrecision?.let(Instant::parse) ?: existing.effectiveAt) == parseTime(request.effectiveAt, "effective_at") &&
        existing.entries == request.entries.map { it.toEntity() }

    private fun Validated.toEntity(userId: String, producer: ProducerDto, effect: String) = OperatorRecord(
        recordId = record.recordId,
        userId = userId,
        accountId = record.accountId,
        recordType = record.recordType,
        game = record.game,
        snapshotScope = record.snapshotScope,
        effectiveAt = effectiveAt,
        producer = ProducerInfo(producer.platform, producer.version),
        entries = record.entries.map { it.toEntity() },
        snapshotEffect = effect,
        effectiveAtPrecision = effectiveAt.toString(),
    )

    private fun OperatorEntryRequest.toEntity() = OperatorRecordEntry(
        id,
        name,
        alias,
        rarity,
        prof,
        subProf,
        games,
        elite,
        starLevel,
        level,
        discs.map { OperatorDisc(it.otName, it.abbreviation, it.color, it.desp) },
        starStones.map { OperatorStarStone(it.name, it.type, it.level) },
    )

    private fun OperatorRecord.toRequest() = OperatorRecordRequest(
        accountId,
        recordId,
        recordType,
        game,
        effectiveAt.toString(),
        snapshotScope,
        entries.map {
            OperatorEntryRequest(
                it.id,
                it.name,
                it.alias,
                it.rarity,
                it.prof,
                it.subProf,
                it.games,
                it.elite,
                it.starLevel,
                it.level,
                it.discs.map { disc -> OperatorDiscRequest(disc.otName, disc.abbreviation, disc.color, disc.desp) },
                it.starStones.map { stone -> OperatorStarStoneRequest(stone.name, stone.type, stone.level) },
            )
        },
    )

    private fun rejectUnknown(node: ObjectNode, allowed: Set<String>, code: String, operatorId: String, path: String) {
        node.fieldNames().asSequence().firstOrNull { it !in allowed }?.let { field ->
            invalid(
                "Unsupported field: $field",
                operatorId,
                listOf(path, field).filter { it.isNotEmpty() }.joinToString("."),
                code,
            )
        }
    }

    private fun requiredInt(
        node: ObjectNode,
        field: String,
        operatorId: String,
        path: String = field,
        code: String = "schema_validation_failed",
    ): Int {
        val value = node.get(field)
        if (value == null || value.isNull || !value.isIntegralNumber || !value.canConvertToInt()) {
            invalid("$field must be an integer", operatorId, path, code)
        }
        return value.intValue()
    }

    private fun optionalInt(node: ObjectNode, field: String, operatorId: String, path: String): Int? =
        if (!node.hasNonNull(field)) null else requiredInt(node, field, operatorId, path, "invalid_combat_stats")

    private fun requiredLong(node: ObjectNode, field: String, operatorId: String): Long {
        val value = node.get(field)
        if (value == null || value.isNull || !value.isIntegralNumber || !value.canConvertToLong()) {
            invalid("$field must be an integer", operatorId, field)
        }
        return value.longValue()
    }

    private fun nullableNonNegativeLong(node: ObjectNode, field: String, operatorId: String): Long? {
        if (!node.has(field)) return null
        val value = node.get(field)
        if (value.isNull) return null
        if (!value.isIntegralNumber || !value.canConvertToLong() || value.longValue() < 0) {
            invalid(
                "$field must be a non-negative integer or null",
                operatorId,
                "combat_stats.$field",
                "invalid_combat_stats",
            )
        }
        return value.longValue()
    }

    private fun requiredText(node: ObjectNode, field: String, operatorId: String): String {
        val value = node.get(field)
        if (value == null || !value.isTextual) {
            invalid("$field must be a string", operatorId, "combat_stats.$field", "invalid_combat_stats")
        }
        return value.asText()
    }

    private fun optionalText(node: ObjectNode, field: String, operatorId: String): String? {
        if (!node.has(field)) return null
        val value = node.get(field)
        if (value.isNull) return null
        val text = requiredText(node, field, operatorId)
        if (text.length !in 1..256) {
            invalid(
                "$field length must be 1..256",
                operatorId,
                "combat_stats.observed_inputs.$field",
                "invalid_combat_stats",
            )
        }
        return text
    }

    private fun parseInstantNode(node: JsonNode, operatorId: String, path: String): Instant {
        if (!node.isTextual) invalid("$path must be a timestamp", operatorId, path, "invalid_combat_stats")
        return try {
            OffsetDateTime.parse(node.asText()).toInstant()
        } catch (_: Exception) {
            invalid("Invalid timestamp", operatorId, path, "invalid_combat_stats")
        }
    }

    private fun invalid(message: String, operatorId: String, fieldPath: String, code: String = "schema_validation_failed"): Nothing {
        throw apiError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            code,
            message,
            operator = operatorId,
            field = fieldPath,
        )
    }

    private fun revisionConflict(operatorId: String): Nothing = throw apiError(
        HttpStatus.CONFLICT,
        "operator_revision_conflict",
        "Operator revision has changed",
        operator = operatorId,
        field = "expected_revision",
    )

    private fun parseTime(value: String, field: String) = try {
        OffsetDateTime.parse(value).toInstant()
    } catch (_: Exception) {
        throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Invalid $field")
    }

    private fun validateProducer(producer: ProducerDto) {
        if (!producer.platform.matches(Regex("^[a-z0-9][a-z0-9._-]{0,63}$")) || producer.version == "") {
            throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Invalid producer")
        }
    }

    private fun normalizeStoneType(type: String): String = when (type) {
        "main" -> "main1"
        "assist" -> "assist1"
        else -> type
    }

    private fun key(user: String, account: String, game: String) = "$user:$account:$game"

    private fun apiError(
        status: HttpStatus,
        code: String,
        message: String,
        record: String? = null,
        entry: String? = null,
        operator: String? = null,
        field: String? = null,
    ) = OperatorApiException(status, code, message, record, entry, operator, field)

    private fun conflict(record: String) = apiError(
        HttpStatus.CONFLICT,
        "record_conflict",
        "Record conflicts with existing record",
        record,
    )

    private data class Validated(val record: OperatorRecordRequest, val effectiveAt: Instant)

    private data class ReplayEvent(
        val at: Instant,
        val key: String,
        val record: OperatorRecord?,
        val correction: OperatorCorrectionRecord?,
    )

    private data class PreparedCurrentPatch(
        val sourceCurrent: OperatorCurrent,
        val entryExisted: Boolean,
        val materializingEntry: Boolean,
        val existing: OperatorEntry,
        val merged: OperatorEntry,
        val expectedRevision: Long,
        val updates: Map<String, OperatorEntry>,
        val fields: Set<String>,
        val reason: String,
        val stale: Boolean,
        val now: Instant,
    )

    companion object {
        const val FORMAT = "myshare-operator-exchange"
        const val VERSION = 2
        const val RECORD_TYPE = "operator_snapshot"
        const val FULL = "full"
        const val LISTED = "listed"
        const val APPLIED = "applied"
        const val SUPERSEDED = "superseded"
        const val GENERIC_GAME = "*"
        const val UNIVERSAL_GAME = "universal"
        val GENERIC_GAME_KEYS = setOf(UNIVERSAL_GAME, GENERIC_GAME)
        const val MAX_STAR_LEVEL = 31
        const val MAX_SP_STAR_LEVEL = 5
        val PATCH_STONE_TYPES = setOf("main1", "main2", "main3", "assist1", "assist2", "assist3")
        val SCOPES = setOf(FULL, LISTED)
        val GAMES = setOf("如鸢", "代号鸢")
        val STONE_TYPES = setOf("main", "assist", "main1", "main2", "main3", "assist1", "assist2", "assist3")
        val ACCOUNT_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
        val CORRECTION_REASONS = setOf("manual_correction", "local_migration", "v3_import")
        val COMBAT_SOURCES = setOf("scan", "manual", "imported")
        val OBSERVATION_SOURCES = setOf("scan", "imported", "manual")
        val OBSERVED_STATUSES = setOf("valid", "stale", "unverified", "unavailable")
        val DISPLAY_MODES = setOf("auto", "manual")
        val ODDITY_KEYS = setOf("attack", "hp", "special")
        val ODDITY_KEYS_IN_ORDER = listOf("attack", "hp", "special")
        val STONE_SLOT_INDEX = listOf("main1", "main2", "main3", "assist1", "assist2", "assist3")
            .withIndex()
            .associate { (index, type) -> type to index }
        val JSON_NODE_FACTORY = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance
    }
}

data class OperatorCurrentPatchPreview(
    val before: OperatorCurrentEntryDto?,
    val after: OperatorCurrentEntryDto,
    val stale: Boolean,
)
