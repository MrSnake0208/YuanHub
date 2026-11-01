package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.inventory.response.InventoryAcquiredResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAcquiredSummaryItem
import com.lhs.share.hub.controller.inventory.response.InventoryAcquiredSummaryResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAnnotationEntry
import com.lhs.share.hub.controller.inventory.response.InventoryAnnotationPreview
import com.lhs.share.hub.controller.inventory.response.InventoryCurrentResponse
import com.lhs.share.hub.controller.inventory.response.InventoryExportAccountDto
import com.lhs.share.hub.controller.inventory.response.InventoryExportEntryDto
import com.lhs.share.hub.controller.inventory.response.InventoryExportRecordDto
import com.lhs.share.hub.controller.inventory.response.InventoryExportResponse
import com.lhs.share.hub.controller.inventory.response.InventoryImportResult
import com.lhs.share.hub.controller.inventory.response.InventoryRecordListItemDto
import com.lhs.share.hub.controller.inventory.response.InventoryRecordPageResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryDeletedRecord
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.StockEntry
import com.mongodb.MongoException
import io.github.oshai.kotlinlogging.KotlinLogging
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Base64
import java.util.UUID

private val log = KotlinLogging.logger { }

/**
 * 库存与奖励服务(HubBackend.inventory_current / inventory_records)
 *
 * 系统维护 current_stock、外部 reward_delta/stock_snapshot，以及只由升级事务
 * 生成的 consumption_delta。获得量统计仍只读取 reward_delta。
 *
 * 整份文档先完成协议、目录和幂等冲突预检,再在 Hub Mongo transaction 中同时
 * 写入 inventory_records 与 inventory_current。部署 MongoDB 必须支持 transaction。
 */
@Service
class InventoryService(
    private val accountRepository: SubAccountRepository,
    private val currentRepository: InventoryCurrentRepository,
    private val recordRepository: InventoryRecordRepository,
    private val deletedRecordRepository: InventoryDeletedRecordRepository,
    private val catalogService: EntityCatalogService,
    @param:Qualifier("hubMongoTemplate") private val hubMongoTemplate: MongoTemplate,
    @param:Qualifier("hubTransactionTemplate") private val transactionTemplate: TransactionTemplate,
    private val inventoryRevisionRepository: InventoryRevisionRepository? = null,
    private val mailboxAccrual: MailboxAccrualService? = null,
) {
    // ==================== import ====================

    /**
     * 导入整份交换文档:先完整校验,再按 effective_at 升序应用(同时间奖励先于快照)。
     *
     * 整体校验失败抛异常(整份拒绝,不部分写入);单条幂等冲突抛 409,
     * 重复(同正文)计入 duplicates 不算失败。
     */
    fun import(userId: String, request: InventoryImportRequest): InventoryImportResult = import(userId, request, null)

    fun import(userId: String, accountId: String, request: InventoryImportRequest): InventoryImportResult =
        import(userId, request, accountId)

    fun importFromConnection(
        userId: String,
        accountId: String,
        connectionId: String,
        request: InventoryImportRequest,
    ): InventoryImportResult = import(userId, request, accountId, connectionId)

    fun firstConnectionSync(userId: String, accountId: String, connectionId: String): InventoryRecord? =
        recordRepository.findFirstByUserIdAndAccountIdAndSourceConnectionIdAndStockEffectOrderByReceivedAtAsc(
            userId,
            accountId,
            connectionId,
            "applied",
        )

    fun previewRewardAnnotations(userId: String, request: InventoryImportRequest): InventoryAnnotationPreview {
        val accountId = annotationAccount(request)
        validateDocument(request)
        val games = validateAccounts(userId, request, accountId)
        val revision = checkNotNull(inventoryRevisionRepository).findByUserIdAndAccountId(userId, accountId)?.revision ?: 0L
        val prepared = prepareRecords(userId, validateAndSort(request), games, mutableSetOf(), annotation = true, readOnly = true)
        val entries = prepared.flatMap { annotationEntries(userId, it.validated) }
        return InventoryAnnotationPreview(revision, entries, entries.all { it.historyOnly })
    }

    fun annotateRewards(userId: String, request: InventoryImportRequest, expectedInventoryRevision: Long): InventoryImportResult {
        if (expectedInventoryRevision !in 0..9007199254740990L) throw schemaError("Invalid inventory revision")
        return import(userId, request, annotationAccount(request), annotationRevision = expectedInventoryRevision)
    }

    private fun annotationAccount(request: InventoryImportRequest): String {
        val ids = request.records.map { it.accountId }.toSet()
        if (ids.size != 1 || request.records.any { it.recordType != REWARD_DELTA } ||
            request.accounts.orEmpty().any { it.id !in ids }
        ) {
            throw schemaError("Reward annotations require reward_delta records for one account")
        }
        return ids.single()
    }

    private fun annotationEntries(userId: String, validated: ValidatedRecord): List<InventoryAnnotationEntry> {
        val record = validated.record
        val existing = recordRepository.findByUserIdAndAccountIdAndRecordId(userId, record.accountId, record.recordId)
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, record.accountId, record.entityType)
        return record.entries.map { entry ->
            val baseline = maxOfNotNull(current?.fullBaselineAt, current?.entries?.get(entry.id)?.listedBaselineAt)
            InventoryAnnotationEntry(
                record.recordId,
                record.entityType,
                entry.id,
                baseline,
                validated.effectiveAt,
                existing?.stockEffect == "history_only" || (baseline != null && !validated.effectiveAt.isAfter(baseline)),
            )
        }
    }

    private fun annotationRejected(record: InventoryRecord, entryId: String): Nothing {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(record.userId, record.accountId, record.entityType)
        val baseline = maxOfNotNull(current?.fullBaselineAt, current?.entries?.get(entryId)?.listedBaselineAt)
        throw InventoryApiException(
            HttpStatus.CONFLICT,
            if (baseline == null) "annotation_baseline_missing" else "annotation_would_change_stock",
            "${record.entries.first { it.id == entryId }.name ?: entryId}未被库存盘点覆盖，请回到盘点核对实际领取时间和库存后再补记",
            record.recordId,
            entryId,
        )
    }

    private fun annotationStale(): Nothing = throw InventoryApiException(
        HttpStatus.CONFLICT,
        "inventory_state_stale",
        "库存盘点已变化，请回到盘点核对，再重新预览补记",
    )

    private fun import(
        userId: String,
        request: InventoryImportRequest,
        restrictedAccountId: String?,
        sourceConnectionId: String? = null,
        annotationRevision: Long? = null,
    ): InventoryImportResult {
        validateDocument(request)
        val accountGames = validateAccounts(userId, request, restrictedAccountId)
        val ordered = validateAndSort(request)
        repeat(MAX_TRANSACTION_ATTEMPTS) { attempt ->
            try {
                val warnings = mutableSetOf<String>()
                val prepared = prepareRecords(userId, ordered, accountGames, warnings, annotationRevision != null)
                return checkNotNull(
                    transactionTemplate.execute {
                        val transactionRecords = if (annotationRevision == null) {
                            prepared
                        } else {
                            val games = validateAccounts(userId, request, restrictedAccountId)
                            if (games != accountGames) annotationStale()
                            prepareRecords(userId, ordered, games, warnings, annotation = true)
                        }
                        if (annotationRevision != null && transactionRecords.any { !it.duplicate }) {
                            val accountId = checkNotNull(restrictedAccountId)
                            if (!accountRepository.fenceRecruitmentWrite(userId, accountId, accountGames.getValue(accountId))) {
                                annotationStale()
                            }
                            if (checkNotNull(inventoryRevisionRepository)
                                    .compareAndIncrement(userId, accountId, annotationRevision, Instant.now()) == null
                            ) {
                                annotationStale()
                            }
                        }
                        var accepted = 0
                        var duplicates = 0
                        var historyOnly = 0
                        var superseded = 0
                        val changedAccounts = mutableSetOf<String>()
                        transactionRecords.forEach { item ->
                            if (item.duplicate) {
                                duplicates++
                            } else {
                                mailboxAccrual?.consumeDaily(userId, item.validated.record)
                                when (
                                    applyRecord(
                                        userId,
                                        request.producer,
                                        item.validated,
                                        sourceConnectionId,
                                        annotationRevision != null,
                                    )
                                ) {
                                    Effect.HISTORY_ONLY -> {
                                        historyOnly++
                                        accepted++
                                    }
                                    Effect.SUPERSEDED -> {
                                        superseded++
                                        accepted++
                                    }
                                    Effect.APPLIED -> {
                                        accepted++
                                        changedAccounts += item.validated.record.accountId
                                    }
                                    Effect.DUPLICATE -> error("Duplicate records are removed during preflight")
                                }
                            }
                        }
                        changedAccounts.forEach { bumpInventoryRevision(userId, it) }
                        InventoryImportResult(accepted, duplicates, historyOnly, superseded, warnings.toList())
                    },
                )
            } catch (e: DuplicateKeyException) {
                if (attempt == MAX_TRANSACTION_ATTEMPTS - 1) {
                    if (annotationRevision !=
                        null
                    ) {
                        return resolveAnnotationConflict(userId, request, accountGames, ordered, annotationRevision)
                    }
                    throw e
                }
                log.info { "Concurrent inventory import detected; retrying preflight for userId=$userId" }
            } catch (e: Exception) {
                if (annotationRevision != null) {
                    val mongo = generateSequence<Throwable>(e) { it.cause }.filterIsInstance<MongoException>().toList()
                    if (mongo.any { it.hasErrorLabel("UnknownTransactionCommitResult") }) {
                        throw InventoryApiException(HttpStatus.SERVICE_UNAVAILABLE, "annotation_result_unknown", "补记结果尚未确认，请原样重试")
                    }
                    if (mongo.any { it.code == 112 || it.hasErrorLabel("TransientTransactionError") } ||
                        (e is InventoryApiException && e.code == "inventory_state_stale")
                    ) {
                        return resolveAnnotationConflict(userId, request, accountGames, ordered, annotationRevision)
                    }
                }
                throw e
            }
        }
        error("Unreachable")
    }

    private fun resolveAnnotationConflict(
        userId: String,
        request: InventoryImportRequest,
        games: Map<String, String>,
        ordered: List<ValidatedRecord>,
        expectedRevision: Long,
    ): InventoryImportResult {
        val accountId = annotationAccount(request)
        val latestGames = validateAccounts(userId, request, accountId)
        // Read revision before records so a committed exact retry is visible with its revision.
        val revision = checkNotNull(inventoryRevisionRepository).findByUserIdAndAccountId(userId, accountId)?.revision ?: 0L
        val prepared = prepareRecords(userId, ordered, latestGames, mutableSetOf(), annotation = true, readOnly = true)
        if (prepared.all { it.duplicate }) return InventoryImportResult(accepted = 0, duplicates = prepared.size)
        if (revision != expectedRevision || latestGames != games) annotationStale()
        throw InventoryApiException(HttpStatus.SERVICE_UNAVAILABLE, "annotation_result_unknown", "另一次库存提交尚未确认，请保持原文档重试")
    }

    private fun validateDocument(request: InventoryImportRequest) {
        if (request.format != FORMAT) throw schemaError("format must be $FORMAT")
        if (request.version != SUPPORTED_VERSION) {
            throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "unsupported_version",
                "Unsupported inventory exchange version: ${request.version}",
            )
        }
        parseInstant(request.exportedAt, "exported_at")
        validateProducer(request.producer)
        if (request.catalogVersion != null && request.catalogVersion.isEmpty()) throw schemaError("catalog_version must not be empty")
    }

    private fun prepareRecords(
        userId: String,
        ordered: List<ValidatedRecord>,
        accountGames: Map<String, String>,
        warnings: MutableSet<String>,
        annotation: Boolean = false,
        readOnly: Boolean = false,
    ): List<PreparedRecord> {
        val requestRecords = mutableMapOf<Pair<String, String>, ValidatedRecord>()
        return ordered.map { validated ->
            val record = validated.record
            val key = record.accountId to record.recordId
            val prior = requestRecords[key]
            if (prior != null) {
                if (!sameRequestBody(prior, validated)) throw recordConflict(record.recordId)
                PreparedRecord(validated, duplicate = true)
            } else {
                requestRecords[key] = validated
                val existing = recordRepository.findByUserIdAndAccountIdAndRecordId(userId, record.accountId, record.recordId)
                if (existing != null && !sameBody(existing, record)) throw recordConflict(record.recordId)
                if (annotation && existing != null && existing.stockEffect != "history_only") {
                    throw InventoryApiException(
                        HttpStatus.CONFLICT,
                        "annotation_would_change_stock",
                        "同一记录已影响库存，请核对操作历史，不能当作补记成功",
                        record.recordId,
                        record.entries.firstOrNull()?.id,
                    )
                }
                if (existing == null) validateCatalogEntries(record, accountGames.getValue(record.accountId), warnings, readOnly)
                PreparedRecord(validated, duplicate = existing != null)
            }
        }
    }

    /**
     * 校验并排序:枚举/catalog/entries 唯一性/count 范围/时间解析,全通过后按
     * effective_at 升序(同时间 reward_delta 优先,让快照成为同一时间的最终权威)。
     */
    private fun validateAndSort(request: InventoryImportRequest): List<ValidatedRecord> {
        val records = request.records
        if (records.isEmpty()) throw schemaError("records must contain at least one record")
        records.forEach { record ->
            if (record.recordId.isBlank() || record.recordId.length > 128) {
                throw schemaError("record_id length must be 1..128", record.recordId.takeIf { it.isNotBlank() })
            }
            if (record.acquisitionChannel != null && record.acquisitionChannel.isEmpty()) {
                throw schemaError("acquisition_channel must not be empty", record.recordId)
            }
            validateStaminaCost(record)
            validateEnums(record)
            validateEntries(record)
        }
        return records
            .map { record ->
                val effectiveAt = parseInstant(record.effectiveAt, "effective_at")
                ValidatedRecord(record, effectiveAt)
            }
            .sortedWith(
                compareBy<ValidatedRecord> { it.record.accountId }
                    .thenBy { it.effectiveAt }
                    .thenBy { if (it.record.recordType == REWARD_DELTA) 0 else 1 },
            )
    }

    private fun validateAccounts(userId: String, request: InventoryImportRequest, restrictedAccountId: String?): Map<String, String> {
        val ids = request.accounts.orEmpty().map { account ->
            if (!ACCOUNT_ID.matches(account.id)) throw schemaError("accounts[].id is invalid")
            if (account.name != null && (account.name.isEmpty() || account.name.length > 64)) {
                throw schemaError("accounts[].name length must be 1..64")
            }
            account.id
        }
        if (ids.toSet().size != ids.size) throw schemaError("accounts[].id must be unique")

        val referenced = request.records.map { record ->
            if (!ACCOUNT_ID.matches(record.accountId)) {
                throw schemaError("record account_id is invalid", record.recordId)
            }
            record.accountId
        }.toSet()
        if (restrictedAccountId != null && referenced != setOf(restrictedAccountId)) {
            throw InventoryApiException(
                HttpStatus.FORBIDDEN,
                "account_scope_mismatch",
                "Inventory document contains records outside the API token's account",
            )
        }
        val owned = accountRepository.findAllByUserIdAndAccountIdIn(userId, referenced)
            .associate { it.accountId to it.game }
        val unknown = referenced.firstOrNull { it !in owned }
        if (unknown == null) {
            return owned
        }
        throw InventoryApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "unknown_account_id",
            "Unknown account_id: $unknown",
        )
    }

    /**
     * 枚举校验:record_type / entity_type / snapshot_scope 取值与携带约束。
     */
    private fun validateEnums(record: InventoryRecordRequest) {
        if (record.recordType != REWARD_DELTA && record.recordType != STOCK_SNAPSHOT) {
            throw schemaError("Invalid record_type: ${record.recordType}", record.recordId)
        }
        if (record.entityType != ENTITY_ITEM && record.entityType != ENTITY_AGENT) {
            throw schemaError("Invalid entity_type: ${record.entityType}", record.recordId)
        }
        if (record.recordType == STOCK_SNAPSHOT) {
            if (record.snapshotScope != SNAPSHOT_FULL && record.snapshotScope != SNAPSHOT_LISTED) {
                throw schemaError("Invalid snapshot_scope: ${record.snapshotScope}", record.recordId)
            }
            if (record.snapshotScope == SNAPSHOT_LISTED && record.entries.isEmpty()) {
                throw schemaError("listed snapshots require at least one entry", record.recordId)
            }
        } else if (record.snapshotScope != null) {
            throw schemaError("reward_delta must not contain snapshot_scope", record.recordId)
        } else if (record.entries.isEmpty()) {
            throw schemaError("reward_delta requires at least one entry", record.recordId)
        }
    }

    private fun validateStaminaCost(record: InventoryRecordRequest) {
        val isDispatchReward = record.recordType == REWARD_DELTA && record.acquisitionChannel?.contains("派遣") == true
        if (isDispatchReward && record.staminaCost == null) {
            throw schemaError("stamina_cost is required for dispatch rewards", record.recordId)
        }
        if (!isDispatchReward && record.staminaCost != null) {
            throw schemaError("stamina_cost is only allowed for dispatch rewards", record.recordId)
        }
        if (record.staminaCost != null && (record.staminaCost < 0 || record.staminaCost > MAX_COUNT)) {
            throw schemaError("stamina_cost is outside the supported range", record.recordId)
        }
    }

    /**
     * entries 校验:同一 record 内 id 唯一;(entity_type, id) 存在于目录;
     * count 范围由记录类型决定(reward_delta 1..MAX, snapshot 0..MAX)。
     */
    private fun validateEntries(record: InventoryRecordRequest) {
        val seen = mutableSetOf<String>()
        record.entries.forEach { entry ->
            if (entry.id.isBlank() || entry.id.length > 128) {
                throw schemaError("entry id length must be 1..128", record.recordId, entry.id.takeIf { it.isNotBlank() })
            }
            if (entry.name != null && entry.name.isEmpty()) {
                throw schemaError("entry name must not be empty", record.recordId, entry.id)
            }
            if (!seen.add(entry.id)) {
                throw schemaError("Duplicate entry id: ${entry.id}", record.recordId, entry.id)
            }
            if (record.recordType == REWARD_DELTA && entry.count < 1) {
                throw schemaError("reward_delta count must be at least 1", record.recordId, entry.id)
            }
            if (entry.count < 0 || entry.count > MAX_COUNT) {
                throw schemaError("entry count is outside the supported range", record.recordId, entry.id)
            }
        }
    }

    // 已接收的同正文记录仍需幂等成功，即使其密探后来被公共图鉴删除。
    private fun validateCatalogEntries(
        record: InventoryRecordRequest,
        accountGame: String,
        warnings: MutableSet<String>,
        readOnly: Boolean = false,
    ) {
        record.entries.forEach { entry ->
            val exists = if (readOnly) {
                catalogService.existsReadOnly(
                    record.entityType,
                    entry.id,
                )
            } else {
                catalogService.exists(record.entityType, entry.id)
            }
            if (!exists) {
                throw InventoryApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "unknown_entity_id",
                    "Unknown ${record.entityType} id: ${entry.id}",
                    record.recordId,
                    entry.id,
                )
            }
            val matchesGame = record.entityType != "agent" || if (readOnly) {
                catalogService.agentMatchesGameReadOnly(entry.id, accountGame)
            } else {
                catalogService.agentMatchesGame(entry.id, accountGame)
            }
            if (!matchesGame) {
                if (record.recordType == STOCK_SNAPSHOT && entry.count == 0L) {
                    warnings += "已忽略${accountGame}不支持的零值密探：${entry.name ?: entry.id}"
                    return@forEach
                }
                throw InventoryApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "agent_game_mismatch",
                    "Agent ${entry.id} is not available in $accountGame",
                    record.recordId,
                    entry.id,
                )
            }
        }
    }

    /**
     * 应用单条记录:先幂等检查,再按类型分派。
     * 返回该记录产生的效果(供 accepted/duplicates/history_only/superseded 统计)。
     */
    private fun applyRecord(
        userId: String,
        producer: ProducerDto,
        validated: ValidatedRecord,
        sourceConnectionId: String?,
        annotation: Boolean = false,
    ): Effect {
        val record = validated.record

        val entity = InventoryRecord(
            recordId = record.recordId,
            userId = userId,
            accountId = record.accountId,
            recordType = record.recordType,
            entityType = record.entityType,
            acquisitionChannel = record.acquisitionChannel,
            staminaCost = record.staminaCost,
            snapshotScope = record.snapshotScope,
            effectiveAt = validated.effectiveAt,
            producer = ProducerInfo(platform = producer.platform, version = producer.version),
            entries = record.entries.map { RecordEntry(id = it.id, name = it.name, count = it.count) },
            stockEffect = "applied",
            sourceConnectionId = sourceConnectionId,
        )

        return when (record.recordType) {
            REWARD_DELTA -> applyRewardDelta(userId, record.accountId, entity, annotation)
            STOCK_SNAPSHOT -> applyStockSnapshot(userId, record.accountId, entity)
            else -> throw IllegalStateException("已校验,不应到达")
        }
    }

    /**
     * 判断已存在记录与新记录是否「正文相同」(协议:直接比较业务字段)。
     */
    private fun sameBody(existing: InventoryRecord, newReq: InventoryRecordRequest): Boolean {
        if (existing.recordType != newReq.recordType ||
            existing.entityType != newReq.entityType ||
            existing.acquisitionChannel != newReq.acquisitionChannel ||
            existing.staminaCost != newReq.staminaCost ||
            existing.snapshotScope != newReq.snapshotScope ||
            !existing.effectiveAt.equals(parseInstant(newReq.effectiveAt, "effective_at"))
        ) {
            return false
        }
        if (existing.entries.size != newReq.entries.size) return false
        val existingById = existing.entries.associateBy { it.id }
        return newReq.entries.all { e ->
            val e2 = existingById[e.id] ?: return@all false
            e2.count == e.count && e2.name == e.name
        }
    }

    private fun sameRequestBody(first: ValidatedRecord, second: ValidatedRecord): Boolean {
        val a = first.record
        val b = second.record
        if (a.recordType != b.recordType ||
            a.entityType != b.entityType ||
            a.acquisitionChannel != b.acquisitionChannel ||
            a.staminaCost != b.staminaCost ||
            a.snapshotScope != b.snapshotScope ||
            !first.effectiveAt.equals(second.effectiveAt) ||
            a.entries.size != b.entries.size
        ) {
            return false
        }
        val firstEntries = a.entries.associateBy { it.id }
        return b.entries.all { entry -> firstEntries[entry.id] == entry }
    }

    /**
     * 奖励增量:先计算效果(基线比较),再落流水,最后更新当前库存。
     *
     * 流水须保留完整 entries(历史统计聚合不区分 stock_effect);
     * stock_effect 为记录级标记:存在任一 applied 条目 → applied,否则 history_only。
     * 幂等唯一索引兜底:并发重复由外层 transaction 回滚并重新预检。
     */
    private fun applyRewardDelta(userId: String, accountId: String, entity: InventoryRecord, annotation: Boolean = false): Effect {
        val comp = computeReward(userId, accountId, entity)
        if (annotation && comp.appliedEntries.isNotEmpty()) annotationRejected(entity, comp.appliedEntries.first().id)
        val stored = entity.copy(stockEffect = comp.effect.stock())
        recordRepository.save(stored)
        applyRewardToCurrent(userId, accountId, entity.entityType, comp)
        return comp.effect
    }

    /**
     * 计算奖励增量效果(纯计算,不写库):对每个 entry 比较其有效基线
     * max(full_baseline_at, listed_baseline_at),晚于基线 → applied。
     */
    private fun computeReward(userId: String, accountId: String, entity: InventoryRecord): RewardComputation {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
        val fullBaseline = current?.fullBaselineAt
        val listedBaselines = current?.entries?.mapValues { it.value.listedBaselineAt } ?: emptyMap()

        // 计算每个 entry 是否生效(晚于基线)
        val appliedEntries = entity.entries.filter { entry ->
            val baseline = maxOfNotNull(fullBaseline, listedBaselines[entry.id])
            baseline == null || entity.effectiveAt.isAfter(baseline)
        }
        return RewardComputation(
            effect = if (appliedEntries.isEmpty()) Effect.HISTORY_ONLY else Effect.APPLIED,
            appliedEntries = appliedEntries,
        )
    }

    /**
     * 把奖励增量效果应用到当前库存。
     */
    private fun applyRewardToCurrent(userId: String, accountId: String, entityType: String, comp: RewardComputation) {
        if (comp.effect == Effect.APPLIED) {
            comp.appliedEntries.forEach { entry ->
                incCurrent(userId, accountId, entityType, entry.id, entry.count)
            }
        }
    }

    /**
     * 增加当前库存某个对象的 count,并 touch updated_at;文档不存在时创建。
     * 注意不改变 full_baseline_at / listed_baseline_at。
     */
    private fun incCurrent(userId: String, accountId: String, entityType: String, entityId: String, delta: Long) {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entityType)
            ?: newCurrent(userId, accountId, entityType)
        val entries = current.entries.toMutableMap()
        val old = entries[entityId] ?: StockEntry()
        entries[entityId] = old.copy(count = old.count + delta)
        currentRepository.save(current.copy(entries = entries, updatedAt = Instant.now()))
    }

    /**
     * 库存快照:先计算效果(基线比较),再落流水,最后应用快照。
     */
    private fun applyStockSnapshot(userId: String, accountId: String, entity: InventoryRecord): Effect {
        val comp = computeSnapshot(userId, accountId, entity)
        val stored = entity.copy(stockEffect = comp.effect.stock())
        recordRepository.save(stored)
        if (comp.effect == Effect.APPLIED) {
            applySnapshotToCurrent(userId, accountId, entity, comp)
        }
        return comp.effect
    }

    /**
     * 计算快照效果(纯计算,不写库):full 快照不早于现有 full 基线才生效;
     * listed 补零过滤后为空时只存档,有效条目均早于基线时整条 superseded。
     */
    private fun computeSnapshot(userId: String, accountId: String, entity: InventoryRecord): SnapshotComputation {
        // 原始正文保留用于审计和幂等比较；导入与删除/恢复重放只在库存计算时过滤补零。
        val entries = if (entity.entityType == ENTITY_AGENT) {
            val game = requireAccount(userId, accountId).game
            entity.entries.filterNot { entry ->
                entry.count == 0L && !catalogService.agentMatchesGame(entry.id, game)
            }
        } else {
            entity.entries
        }
        if (entity.snapshotScope == SNAPSHOT_LISTED && entries.isEmpty()) {
            return SnapshotComputation(Effect.HISTORY_ONLY, emptyList())
        }
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
        val existingFullBaseline = current?.fullBaselineAt
        val isFull = entity.snapshotScope == SNAPSHOT_FULL
        val effective = entity.effectiveAt

        if (isFull) {
            val superseded = existingFullBaseline != null && effective.isBefore(existingFullBaseline)
            return SnapshotComputation(if (superseded) Effect.SUPERSEDED else Effect.APPLIED, entries)
        }

        val appliedEntries = entries.filter { entry ->
            val baseline = maxOfNotNull(existingFullBaseline, current?.entries?.get(entry.id)?.listedBaselineAt)
            baseline == null || !effective.isBefore(baseline)
        }
        return SnapshotComputation(
            if (appliedEntries.isEmpty()) Effect.SUPERSEDED else Effect.APPLIED,
            appliedEntries,
        )
    }

    /**
     * 把快照效果应用到当前库存。
     */
    private fun applySnapshotToCurrent(userId: String, accountId: String, entity: InventoryRecord, computation: SnapshotComputation) {
        if (entity.snapshotScope == SNAPSHOT_FULL) {
            applyFullSnapshot(userId, accountId, entity, computation.appliedEntries)
        } else {
            applyListedSnapshot(userId, accountId, entity, computation.appliedEntries)
        }
    }

    /**
     * full 快照:替换整个 entries(未列出归零)并更新 full_baseline_at;
     * 对拥有更晚 listed_baseline_at 的对象保留其更晚的局部值(item 粒度保留)。
     */
    private fun applyFullSnapshot(userId: String, accountId: String, entity: InventoryRecord, entries: List<RecordEntry>) {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
        val effective = entity.effectiveAt

        // 构建新 entries:以快照值为准;但保留更晚 listed 基线覆盖的 item(避免旧 full 覆盖新局部读取)
        val snapshotEntries = entries.associate { it.id to StockEntry(count = it.count, listedBaselineAt = null) }
        val merged = LinkedHashMap<String, StockEntry>()
        // 快照列出的对象使用快照值(未列出即归零)
        snapshotEntries.forEach { (id, se) -> merged[id] = se }
        // 若存在更晚 listed 覆盖的对象(未出现在 full 中但 listed_baseline_at 晚于本快照),保留其值
        current?.entries?.forEach { (id, se) ->
            if (se.listedBaselineAt != null && se.listedBaselineAt.isAfter(effective)) {
                merged[id] = se
            }
        }

        val updated = (current ?: newCurrent(userId, accountId, entity.entityType)).copy(
            fullBaselineAt = effective,
            entries = merged,
            updatedAt = Instant.now(),
        )
        currentRepository.save(updated)
    }

    /**
     * listed 快照:只覆盖列出的对象并更新其 listed_baseline_at,未列出对象不变。
     */
    private fun applyListedSnapshot(userId: String, accountId: String, entity: InventoryRecord, entries: List<RecordEntry>) {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
            ?: newCurrent(userId, accountId, entity.entityType)
        val updatedEntries = current.entries.toMutableMap()
        entries.forEach { entry ->
            updatedEntries[entry.id] = StockEntry(entry.count, entity.effectiveAt)
        }
        currentRepository.save(current.copy(entries = updatedEntries, updatedAt = Instant.now()))
    }

    private fun newCurrent(userId: String, accountId: String, entityType: String) = InventoryCurrent(
        id = "$userId:$accountId:$entityType",
        userId = userId,
        accountId = accountId,
        entityType = entityType,
    )

    // ==================== 记录管理(删除/重放/列表) ====================

    /**
     * 删除单条记录并全量重放:语义等价于「该记录从未导入过」。
     *
     * 步骤:
     * 1. 归属校验(仅本人,不存在/越权统一 404);
     * 2. 删除 inventory_records 中的目标记录;
     * 3. 删除该用户该 entity_type 的 inventory_current 文档;
     * 4. 将剩余记录按 effective_at 升序(同时间奖励先于快照)逐条重放,
     *    重建当前库存,并把每条记录的实际效果回写 stock_effect。
     *
     * 协议 5.1 §6.1:错误记录由平台管理接口撤销;删除后历史统计不再包含该记录。
     */
    fun deleteRecord(userId: String, accountId: String, recordId: String) {
        requireAccount(userId, accountId)
        val record = recordRepository.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId)
            ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "record_not_found", "Record not found", recordId)
        if (record.transactionId?.startsWith("reset_") == true) {
            throw InventoryApiException(HttpStatus.CONFLICT, "reset_record_delete_forbidden", "请到密探的重置记录中整笔撤销，不能单独删除库存流水", recordId)
        }
        if (record.recordType == CONSUMPTION_DELTA) {
            throw InventoryApiException(
                HttpStatus.CONFLICT,
                "consumption_record_delete_forbidden",
                "Consumption records cannot be deleted without rolling back their business operation",
                recordId,
            )
        }
        val entityType = record.entityType

        transactionTemplate.executeWithoutResult {
            val previous = deletedRecordRepository.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId)
            deletedRecordRepository.save(
                InventoryDeletedRecord(
                    id = previous?.id,
                    userId = userId,
                    accountId = accountId,
                    recordId = recordId,
                    record = record,
                ),
            )
            recordRepository.deleteById(record.checkId())
            val replayed = rebuildCurrent(userId, accountId, entityType)
            bumpInventoryRevision(userId, accountId)
            log.info {
                "删除库存记录并重放完成: userId=$userId, accountId=$accountId, recordId=$recordId, " +
                    "entityType=$entityType, 重放 $replayed 条"
            }
        }
    }

    /** 恢复上次删除的原记录；若同一幂等键已重新导入，保留现有记录并返回冲突。 */
    fun restoreRecord(userId: String, accountId: String, recordId: String) {
        requireAccount(userId, accountId)
        transactionTemplate.executeWithoutResult {
            val deleted = deletedRecordRepository.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId)
                ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "deleted_record_not_found", "Deleted record not found", recordId)
            if (deleted.record.transactionId?.startsWith("reset_") == true) {
                throw InventoryApiException(HttpStatus.CONFLICT, "reset_record_delete_forbidden", "密探重置流水必须随整笔操作处理", recordId)
            }
            if (recordRepository.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId) != null) {
                throw InventoryApiException(HttpStatus.CONFLICT, "record_already_exists", "Record already exists", recordId)
            }
            recordRepository.save(deleted.record)
            rebuildCurrent(userId, accountId, deleted.record.entityType)
            deletedRecordRepository.deleteById(checkNotNull(deleted.id))
            bumpInventoryRevision(userId, accountId)
        }
    }

    private fun rebuildCurrent(userId: String, accountId: String, entityType: String): Int {
        currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entityType)?.let {
            currentRepository.deleteById(it.checkId())
        }
        val remaining = recordRepository.findByUserIdAndAccountIdOrderByEffectiveAtAsc(userId, accountId)
            .filter { it.entityType == entityType }
            .sortedWith(
                compareBy<InventoryRecord> { it.effectiveAt }
                    .thenBy {
                        when (it.recordType) {
                            REWARD_DELTA -> 0
                            RESOURCE_DELTA -> 0
                            STOCK_SNAPSHOT -> 1
                            else -> 2
                        }
                    }.thenBy { it.resourceRevision ?: Long.MIN_VALUE },
            )
        remaining.forEach { replayRecord(userId, accountId, it) }
        return remaining.size
    }

    /**
     * 重放一条已落库记录:重新计算效果、回写 stock_effect、更新当前库存。
     * 不插入流水(记录已在库里)。
     */
    private fun replayRecord(userId: String, accountId: String, entity: InventoryRecord) {
        when (entity.recordType) {
            REWARD_DELTA -> {
                val comp = computeReward(userId, accountId, entity)
                recordRepository.save(entity.copy(stockEffect = comp.effect.stock()))
                applyRewardToCurrent(userId, accountId, entity.entityType, comp)
            }
            STOCK_SNAPSHOT -> {
                val comp = computeSnapshot(userId, accountId, entity)
                recordRepository.save(entity.copy(stockEffect = comp.effect.stock()))
                if (comp.effect == Effect.APPLIED) {
                    applySnapshotToCurrent(userId, accountId, entity, comp)
                }
            }
            CONSUMPTION_DELTA -> applyConsumptionDelta(userId, accountId, entity)
            RESOURCE_DELTA -> applyResourceDelta(userId, accountId, entity)
            else -> throw IllegalStateException("已落库记录类型非法: ${entity.recordType}")
        }
    }

    private fun applyResourceDelta(userId: String, accountId: String, entity: InventoryRecord) {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
            ?: throw InventoryApiException(HttpStatus.CONFLICT, "resource_replay_conflict", "后续资源操作依赖这次盘点，无法撤销")
        val entries = current.entries.toMutableMap()
        var applied = false
        entity.entries.forEach { change ->
            val baseline = maxOfNotNull(current.fullBaselineAt, entries[change.id]?.listedBaselineAt)
                ?: throw InventoryApiException(HttpStatus.CONFLICT, "resource_replay_conflict", "后续资源操作缺少库存基准，无法撤销")
            if (entity.effectiveAt.isAfter(baseline)) {
                val old = entries[change.id] ?: StockEntry()
                val count = old.count + change.count
                if (count !in 0..MAX_COUNT) {
                    throw InventoryApiException(HttpStatus.CONFLICT, "resource_replay_conflict", "后续资源操作依赖这笔收入，无法完成删除或恢复")
                }
                entries[change.id] = old.copy(count = count)
                applied = true
            }
        }
        if (applied) currentRepository.save(current.copy(entries = entries, updatedAt = entity.effectiveAt))
        recordRepository.save(entity.copy(stockEffect = if (applied) APPLIED else "history_only"))
    }

    private fun applyConsumptionDelta(userId: String, accountId: String, entity: InventoryRecord) {
        val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entity.entityType)
            ?: throw IllegalStateException("Consumption replay has no ${entity.entityType} inventory baseline")
        val entries = current.entries.toMutableMap()
        entity.entries.forEach { consumed ->
            val old = entries[consumed.id]
                ?: throw IllegalStateException("Consumption replay is missing inventory entry ${consumed.id}")
            if (old.count < consumed.count) {
                throw IllegalStateException("Consumption replay would make inventory negative for ${consumed.id}")
            }
            entries[consumed.id] = old.copy(count = old.count - consumed.count)
        }
        currentRepository.save(current.copy(entries = entries, updatedAt = entity.effectiveAt))
        if (entity.stockEffect != APPLIED) recordRepository.save(entity.copy(stockEffect = APPLIED))
    }

    /**
     * 导入记录列表(entityType/from/to 可选过滤;按 effective_at 倒序,最新在前)。
     */
    fun listRecords(
        userId: String,
        accountId: String,
        entityType: String?,
        from: Instant?,
        to: Instant?,
        cursor: String?,
        limit: Int,
    ): InventoryRecordPageResponse {
        requireAccount(userId, accountId)
        validateEntityType(entityType)
        validateRange(from, to)
        if (limit !in 1..MAX_RECORDS_LIMIT) throw schemaError("limit must be between 1 and $MAX_RECORDS_LIMIT")

        val criteria = Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)
        if (entityType != null) criteria.and("entityType").`is`(entityType)
        if (from != null || to != null) {
            val time = criteria.and("effectiveAt")
            if (from != null) time.gte(from)
            if (to != null) time.lt(to)
        }
        cursor?.let { value ->
            val decoded = decodeCursor(value)
            criteria.andOperator(
                Criteria().orOperator(
                    Criteria.where("effectiveAt").lt(decoded.effectiveAt),
                    Criteria.where("effectiveAt").`is`(decoded.effectiveAt).and("recordId").lt(decoded.recordId),
                ),
            )
        }
        val query = Query(criteria)
            .with(Sort.by(Sort.Order.desc("effectiveAt"), Sort.Order.desc("recordId")))
            .limit(limit + 1)
        val records = hubMongoTemplate.find(query, InventoryRecord::class.java, "inventory_records")
        val hasNext = records.size > limit
        val page = records.take(limit)
        val nextCursor = if (hasNext) page.lastOrNull()?.let(::encodeCursor) else null
        return InventoryRecordPageResponse(page.map(InventoryRecordListItemDto::of), nextCursor)
    }

    // ==================== 查询 ====================

    /**
     * 当前库存查询(entityType 可选;直接读 inventory_current,不扫流水)。
     */
    fun current(userId: String, accountId: String, entityType: String?): List<InventoryCurrentResponse> {
        requireAccount(userId, accountId)
        validateEntityType(entityType)
        val list = if (entityType != null) {
            currentRepository.findByUserIdAndAccountIdAndEntityType(userId, accountId, entityType)?.let { listOf(it) } ?: emptyList()
        } else {
            currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId)
        }
        return list.map { InventoryCurrentResponse.of(it) }
    }

    /**
     * 时段获得量([from, to)),只聚合 reward_delta,返回 map<entity_id, count>。
     */
    fun acquired(userId: String, accountId: String, entityType: String, from: Instant, to: Instant): InventoryAcquiredResponse {
        requireAccount(userId, accountId)
        validateEntityType(entityType)
        validateRange(from, to)
        val result = aggregateRewardDelta(userId, accountId, entityType, from, to)
        return InventoryAcquiredResponse(
            accountId = accountId,
            entityType = entityType,
            from = from,
            to = to,
            acquired = result,
        )
    }

    /** Counts positive reward entries and distinct acquisition dates, independent of current stock. */
    fun acquiredSummary(
        userId: String,
        accountId: String,
        entityType: String,
        fromDate: LocalDate,
        toDate: LocalDate,
        timezone: String,
    ): InventoryAcquiredSummaryResponse {
        requireAccount(userId, accountId)
        validateEntityType(entityType)
        val zone = runCatching { ZoneId.of(timezone) }.getOrElse {
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_timezone", "Invalid timezone")
        }
        val from = fromDate.atStartOfDay(zone).toInstant()
        val to = toDate.atStartOfDay(zone).toInstant()
        validateRange(from, to)
        val match = Document(
            mapOf(
                "userId" to userId,
                "accountId" to accountId,
                "entityType" to entityType,
                "recordType" to REWARD_DELTA,
                "effectiveAt" to Document(mapOf("\$gte" to from, "\$lt" to to)),
            ),
        )
        val day = Document("\$dateToString", Document(mapOf("format" to "%Y-%m-%d", "date" to "\$effectiveAt", "timezone" to zone.id)))
        val pipeline = listOf(
            Document("\$match", match),
            Document("\$unwind", "\$entries"),
            Document("\$match", Document("entries.count", Document("\$gt", 0))),
            Document(
                "\$group",
                Document(
                    mapOf(
                        "_id" to "\$entries.id",
                        "count" to Document("\$sum", "\$entries.count"),
                        "days" to Document("\$addToSet", day),
                    ),
                ),
            ),
        )
        val items = mutableMapOf<String, InventoryAcquiredSummaryItem>()
        hubMongoTemplate.getCollection("inventory_records").aggregate(pipeline).forEach { doc ->
            items[doc.getString("_id")] = InventoryAcquiredSummaryItem((doc["count"] as Number).toLong(), (doc["days"] as List<*>).size)
        }
        return InventoryAcquiredSummaryResponse(accountId, entityType, from, to, zone.id, items)
    }

    /**
     * 聚合:match(user, recordType=reward_delta, entityType, effective_at in [from,to)) →
     * unwind entries → group by entries.id → sum entries.count。
     */
    private fun aggregateRewardDelta(
        userId: String,
        accountId: String,
        entityType: String,
        from: Instant,
        to: Instant,
    ): Map<String, Long> {
        val match = Document(
            mapOf(
                "userId" to userId,
                "accountId" to accountId,
                "recordType" to REWARD_DELTA,
                "entityType" to entityType,
                "effectiveAt" to Document(mapOf("\$gte" to from, "\$lt" to to)),
            ),
        )
        val unwind = Document("\$unwind", "\$entries")
        val group = Document(
            "\$group",
            Document(
                mapOf(
                    "_id" to "\$entries.id",
                    "count" to Document("\$sum", "\$entries.count"),
                ),
            ),
        )
        val result = hubMongoTemplate.getCollection("inventory_records")
            .aggregate(listOf(Document("\$match", match), unwind, group))
        val map = mutableMapOf<String, Long>()
        result.forEach { doc ->
            val id = doc.getString("_id") ?: return@forEach
            val count = (doc["count"] as? Number)?.toLong() ?: 0L
            map[id] = count
        }
        return map
    }

    /**
     * 导出:每种 entity_type 生成一条 full stock_snapshot(当前状态,由 current 直接读取);
     * 若 includeRewards,再附带区间 [from, to) 内的 reward_delta 流水(按 effective_at 升序)。
     */
    fun export(
        userId: String,
        accountId: String?,
        scope: String?,
        includeRewards: Boolean,
        from: Instant?,
        to: Instant?,
    ): InventoryExportResponse {
        val now = Instant.now()
        val records = mutableListOf<InventoryExportRecordDto>()
        validateRange(from, to)
        val exportId = UUID.randomUUID().toString()
        val accounts = exportAccounts(userId, accountId, scope)

        accounts.forEach { account ->
            ENTITY_TYPES.forEach { type ->
                val current = currentRepository.findByUserIdAndAccountIdAndEntityType(userId, account.accountId, type)
                val entries = current?.entries.orEmpty().map { (id, se) ->
                    InventoryExportEntryDto(id = id, name = null, count = se.count)
                }
                records.add(
                    InventoryExportRecordDto(
                        accountId = account.accountId,
                        recordId = "myshare:export:$exportId:${account.accountId}:$type",
                        recordType = STOCK_SNAPSHOT,
                        entityType = type,
                        acquisitionChannel = "背包",
                        staminaCost = null,
                        effectiveAt = now,
                        snapshotScope = SNAPSHOT_FULL,
                        entries = entries,
                    ),
                )
            }
        }

        // 可选:奖励流水
        if (includeRewards) {
            accounts.forEach { account ->
                val rewards = recordRepository.findByUserIdAndAccountIdOrderByEffectiveAtAsc(userId, account.accountId)
                    .filter { it.recordType == REWARD_DELTA }
                    .filter { from == null || !it.effectiveAt.isBefore(from) }
                    .filter { to == null || it.effectiveAt.isBefore(to) }
                rewards.forEach { r ->
                    records.add(
                        InventoryExportRecordDto(
                            accountId = r.accountId,
                            recordId = r.recordId,
                            recordType = r.recordType,
                            entityType = r.entityType,
                            acquisitionChannel = r.acquisitionChannel,
                            staminaCost = r.staminaCost,
                            effectiveAt = r.effectiveAt,
                            snapshotScope = r.snapshotScope,
                            entries = r.entries.map { e -> InventoryExportEntryDto(id = e.id, name = e.name, count = e.count) },
                        ),
                    )
                }
            }
        }

        return InventoryExportResponse(
            exportedAt = now,
            catalogVersion = catalogService.catalog().catalogVersion,
            producer = ProducerDto(platform = "myshare"),
            accounts = accounts.map { InventoryExportAccountDto(it.accountId, it.name) },
            records = records,
        )
    }

    private fun exportAccounts(userId: String, accountId: String?, scope: String?) = when {
        accountId != null && scope == null -> listOf(requireAccount(userId, accountId))
        accountId == null && scope == "all" -> accountRepository.findAllByUserIdOrderByCreatedAtAsc(userId).ifEmpty {
            throw schemaError("No inventory accounts are available to export")
        }
        else -> throw schemaError("Exactly one of account_id or scope=all must be provided")
    }

    // ==================== 工具 ====================

    private fun parseInstant(value: String, field: String): Instant {
        return try {
            // 协议 5.1 要求 RFC 3339,须支持带 UTC offset 的时间(如 2026-08-16T10:30:00+08:00)
            // 与纯 UTC 时间(2026-08-16T02:30:00Z)。Instant.parse 只能解析 Z 结尾,
            // 因此统一用 OffsetDateTime 解析后转 Instant。
            java.time.OffsetDateTime.parse(value).toInstant()
        } catch (e: Exception) {
            throw schemaError("$field must be an RFC 3339 date-time with a timezone")
        }
    }

    private fun validateProducer(producer: ProducerDto) {
        if (!PRODUCER_PLATFORM.matches(producer.platform)) throw schemaError("producer.platform is invalid")
        if (producer.version != null && producer.version.isEmpty()) throw schemaError("producer.version must not be empty")
    }

    private fun validateEntityType(entityType: String?) {
        if (entityType != null && entityType !in ENTITY_TYPES) throw schemaError("entity_type must be item or agent")
    }

    private fun validateRange(from: Instant?, to: Instant?) {
        if (from != null && to != null && !from.isBefore(to)) throw schemaError("from must be earlier than to")
    }

    private fun requireAccount(userId: String, accountId: String) = accountRepository.findByUserIdAndAccountId(userId, accountId)
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

    private fun encodeCursor(record: InventoryRecord): String {
        val value = "${record.effectiveAt}\n${record.recordId}"
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray(StandardCharsets.UTF_8))
    }

    private fun decodeCursor(cursor: String): RecordCursor {
        return try {
            val value = String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
            val parts = value.split('\n', limit = 2)
            require(parts.size == 2 && parts[1].isNotBlank())
            RecordCursor(Instant.parse(parts[0]), parts[1])
        } catch (e: Exception) {
            throw schemaError("cursor is invalid")
        }
    }

    private fun schemaError(message: String, recordId: String? = null, entryId: String? = null) =
        InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message, recordId, entryId)

    private fun recordConflict(recordId: String) = InventoryApiException(
        HttpStatus.CONFLICT,
        "record_conflict",
        "record_id is already associated with different content",
        recordId,
    )

    private fun maxOfNotNull(vararg values: Instant?): Instant? {
        var max: Instant? = null
        values.forEach { v ->
            if (v != null && (max == null || v.isAfter(max))) max = v
        }
        return max
    }

    private fun bumpInventoryRevision(userId: String, accountId: String) {
        val repository = inventoryRevisionRepository ?: return
        val current = repository.findByUserIdAndAccountId(userId, accountId)
        repository.save(
            InventoryRevision(
                id = "$userId:$accountId",
                userId = userId,
                accountId = accountId,
                revision = (current?.revision ?: 0) + 1,
                updatedAt = Instant.now(),
            ),
        )
    }

    private data class ValidatedRecord(
        val record: InventoryRecordRequest,
        val effectiveAt: Instant,
    )

    private data class PreparedRecord(
        val validated: ValidatedRecord,
        val duplicate: Boolean,
    )

    private data class RecordCursor(
        val effectiveAt: Instant,
        val recordId: String,
    )

    /**
     * 奖励增量计算结果
     */
    private data class RewardComputation(
        val effect: Effect,
        val appliedEntries: List<RecordEntry>,
    )

    /**
     * 快照计算结果
     */
    private data class SnapshotComputation(
        val effect: Effect,
        val appliedEntries: List<RecordEntry>,
    )

    private enum class Effect {
        APPLIED,
        DUPLICATE,
        HISTORY_ONLY,
        SUPERSEDED,
        ;

        /**
         * 效果 → stock_effect 标记(DUPLICATE 无对应标记,不落库)
         */
        fun stock(): String = when (this) {
            APPLIED -> "applied"
            HISTORY_ONLY -> "history_only"
            SUPERSEDED -> "superseded"
            DUPLICATE -> throw IllegalStateException("DUPLICATE 无对应 stock_effect")
        }
    }

    /**
     * 已加载实体的 id 必然非空(否则不存在于库中),集中校验避免空指针。
     */
    private fun InventoryRecord.checkId(): String = checkNotNull(id) { "流水实体未持久化" }

    private fun InventoryCurrent.checkId(): String = checkNotNull(id) { "库存实体未持久化" }

    companion object {
        private const val SUPPORTED_VERSION = 2
        private const val FORMAT = "myshare-inventory-exchange"
        private const val REWARD_DELTA = "reward_delta"
        private const val STOCK_SNAPSHOT = "stock_snapshot"
        private const val CONSUMPTION_DELTA = "consumption_delta"
        private const val RESOURCE_DELTA = "resource_delta"
        private const val ENTITY_ITEM = "item"
        private const val ENTITY_AGENT = "agent"
        private const val SNAPSHOT_FULL = "full"
        private const val SNAPSHOT_LISTED = "listed"
        private const val APPLIED = "applied"
        private const val HISTORY_ONLY = "history_only"
        private const val SUPERSEDED = "superseded"
        private const val MAX_COUNT = 2147483647L
        private const val MAX_RECORDS_LIMIT = 100
        private const val MAX_TRANSACTION_ATTEMPTS = 3
        private val PRODUCER_PLATFORM = Regex("^[a-z0-9][a-z0-9._-]{0,63}$")
        private val ACCOUNT_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
        private val ENTITY_TYPES = listOf(ENTITY_ITEM, ENTITY_AGENT)
    }
}
