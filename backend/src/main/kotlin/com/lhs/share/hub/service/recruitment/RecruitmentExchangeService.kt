package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeDocument
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportCommitRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportOptions
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportPreviewRequest
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCommandResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportPreviewResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportStats
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentRequestRecord
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class RecruitmentExchangeService(
    private val store: RecruitmentRepository,
    private val accountService: SubAccountService,
    private val accounts: SubAccountRepository,
    private val recruitment: RecruitmentService,
    private val catalog: RecruitmentCatalog,
    private val events: AccountEventService,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    private val validation = RecruitmentExchangeValidation(mapper)

    // ponytail: single-process previews; use shared storage or sticky routing when deploying multiple instances.
    private val previews = LinkedHashMap<String, PreviewBinding>()
    internal var clock: Clock = Clock.systemUTC()

    fun export(userId: String, accountId: String): RecruitmentExchangeDocument = checkNotNull(
        transactions.execute {
            val account = accountService.requireAccount(userId, accountId)
            val current = store.archive(userId, accountId) ?: recruitment.empty(userId, accountId, account.game)
            val (records, batches) = history(userId, accountId)
            val projected = catalog.projectPools(current.pools).associateBy { it.poolId }
            val backup = current.copy(
                pools = current.pools.map { pool ->
                    val latest = projected.getValue(pool.poolId)
                    pool.copy(
                        snapshot = pool.snapshot.copy(
                            upAgents = latest.snapshot.upAgents,
                            allowCustomUp = latest.snapshot.allowCustomUp,
                        ),
                        mappedSnapshot = pool.mappedSnapshot?.copy(
                            upAgents =
                            latest.mappedSnapshot?.upAgents ?: pool.mappedSnapshot.upAgents,
                            allowCustomUp = latest.mappedSnapshot?.allowCustomUp ?: pool.mappedSnapshot.allowCustomUp,
                        ),
                    )
                },
            )
            exchangeDocument(backup, records, batches, clock.instant()).also {
                validation.validate(it)
                if (mapper.writeValueAsBytes(it).size > RECRUITMENT_EXCHANGE_MAX_BYTES) {
                    throw recruitmentInvalid("完整备份超过5MiB，不能导出无法恢复的文件")
                }
            }
        },
    )

    fun preview(userId: String, input: RecruitmentImportPreviewRequest): RecruitmentImportPreviewResponse {
        accountService.requireAccount(userId, input.accountId)
        val documentHash = recruitment.hash(input.document)
        val optionHash = recruitment.hash(mapper.valueToTree(input.options))
        val recordsOnly = input.document.path("schema").asText() == RECRUITMENT_RECORD_IMPORT_SCHEMA
        val (plan, document) = checkNotNull(
            transactions.execute {
                val account = accountService.requireAccount(userId, input.accountId)
                if (input.document.path("game").asText() != account.game) gameMismatch()
                val current = store.archive(userId, input.accountId) ?: recruitment.empty(userId, input.accountId, account.game)
                if (current.gameSnapshot != account.game) gameMismatch()
                val document = readDocument(input.document, current, input.options)
                val (records, batches) = history(userId, input.accountId)
                validation.validateImport(document, current, records, batches, catalog)
                recruitmentExchangePlan(current, records, batches, document, input.options, recordsOnly) to document
            },
        )
        val now = clock.instant()
        checkPlanSize(plan, now, recordsOnly)
        val expiry = now.plusSeconds(600)
        val token = "recruitment_preview_${UUID.randomUUID()}"
        synchronized(previews) {
            previews.entries.removeIf { !it.value.expiresAt.isAfter(now) }
            if (previews.size >= 4096) previews.remove(previews.keys.first())
            previews[token] = PreviewBinding(
                userId,
                input.accountId,
                documentHash,
                optionHash,
                plan.archive.archiveRevision,
                expiry,
                if (recordsOnly) recruitment.hash(mapper.valueToTree(document)) else null,
            )
        }
        val recordsById = document.events.associateBy { it.eventId }
        val batchesById = document.batches.associateBy { it.batchId }
        val poolsById = document.pools.associateBy { it.poolId }
        val items = if (recordsOnly) {
            plan.items.filter { it.entityType in setOf("event", "batch") }.map { item ->
                val record = recordsById[item.id].takeIf { item.entityType == "event" }
                val name = if (record != null) {
                    val count = if (record.agentSnapshot.rarity == 4) "4星计次" else record.pullSpan?.let { "$it 抽" } ?: "抽数未知"
                    "${record.poolSnapshot.name} · ${record.agentSnapshot.name} · $count"
                } else {
                    val batch = batchesById.getValue(item.id)
                    "${poolsById.getValue(batch.poolId).snapshot.name} · 批次 ${batch.totalPullCount} 抽"
                }
                item.copy(displayName = name)
            }
        } else {
            plan.items
        }
        val stats = RecruitmentImportStats(
            items.count { it.status == "add" },
            items.count { it.status == "duplicate" },
            items.count { it.status == "conflict" },
            items.count { it.status in setOf("skip", "count_overlap") },
        )
        return RecruitmentImportPreviewResponse(
            token, documentHash, plan.archive.archiveRevision, expiry, items, stats, plan.risks,
            plan.currentKnownTotal, plan.backupKnownTotal, plan.candidateKnownTotal,
            plan.canCommit && (!recordsOnly || items.none { it.status == "count_overlap" }),
        )
    }

    fun commit(userId: String, input: RecruitmentImportCommitRequest): RecruitmentCommandResponse {
        if (input.expectedRevision !in 0 until Long.MAX_VALUE || !RECRUITMENT_EXCHANGE_ID.matches(input.requestId)) {
            throw recruitmentInvalid("目标版本或请求ID格式不正确")
        }
        accountService.requireAccount(userId, input.accountId)
        val requestHash = recruitment.hash(mapper.valueToTree(listOf("recruitment_import", input)))
        // Durable success is checked before preview expiry/revision, including retries after a server restart.
        recruitment.retry(userId, input.accountId, input.requestId, requestHash)?.let { return it }
        val documentHash = recruitment.hash(input.document)
        val optionHash = recruitment.hash(mapper.valueToTree(input.options))
        checkBinding(userId, input, documentHash, optionHash)
        val result = try {
            checkNotNull(
                transactions.execute {
                    recruitment.retry(userId, input.accountId, input.requestId, requestHash)?.let { return@execute it }
                    checkBinding(userId, input, documentHash, optionHash)
                    val account = accountService.requireAccount(userId, input.accountId)
                    if (account.game != input.document.path("game").asText()) gameMismatch()
                    val existing = store.archive(userId, input.accountId)
                    val current = existing ?: recruitment.empty(userId, input.accountId, account.game)
                    if (current.gameSnapshot != account.game) gameMismatch()
                    if (current.archiveRevision != input.expectedRevision) throw recruitmentConflict("目标档案已变化，请重新预览")
                    val document = readDocument(input.document, current, input.options)
                    val recordsOnly = input.document.path("schema").asText() == RECRUITMENT_RECORD_IMPORT_SCHEMA
                    if (recordsOnly) {
                        val binding = checkBinding(userId, input, documentHash, optionHash)
                        if (binding.resolvedHash != recruitment.hash(mapper.valueToTree(document))) {
                            throw recruitmentConflict("目录或记录解析已变化，请重新预览")
                        }
                    }
                    val (records, batches) = history(userId, input.accountId)
                    validation.validateImport(document, current, records, batches, catalog)
                    val plan = recruitmentExchangePlan(current, records, batches, document, input.options, recordsOnly)
                    if (!plan.canCommit || (recordsOnly && plan.items.any { it.status == "count_overlap" })) {
                        throw recruitmentInvalid("请先处理重复计数提示并重新预览")
                    }
                    checkPlanSize(plan, clock.instant(), recordsOnly)
                    if (!accounts.fenceRecruitmentWrite(userId, input.accountId, account.game)) {
                        throw recruitmentConflict("账号已变化或删除，请重新读取账号列表")
                    }
                    val now = clock.instant()
                    val importId = "import_${UUID.randomUUID()}"
                    val next = plan.archive.copy(archiveRevision = current.archiveRevision + 1, updatedAt = now)
                    if (!store.saveArchive(next, existing != null)) throw recruitmentConflict()
                    plan.batchesToAdd.forEach { batch ->
                        store.insertBatch(
                            RecruitmentBatch(
                                "$userId:${input.accountId}:${batch.batchId}", userId, input.accountId, batch.batchId, batch.poolId,
                                batch.totalPullCount, if (recordsOnly) now else batch.createdAt, batch.deletedAt,
                                batch.deletedAt?.let {
                                    0L
                                },
                                importId, now,
                            ),
                        )
                    }
                    plan.eventsToAdd.forEach { record ->
                        store.insertEvent(
                            RecruitmentEvent(
                                "$userId:${input.accountId}:${record.eventId}", userId, input.accountId, record.eventId, record.poolId,
                                record.poolSnapshot, record.agentSnapshot, record.pullSpan, record.sortOrder, record.upStatus,
                                record.acquiredDate, record.note, record.source, record.batchId,
                                if (recordsOnly) now else record.createdAt, if (recordsOnly) now else record.updatedAt,
                                record.deletedAt, record.deletedAt?.let { 0L }, importId, now,
                            ),
                        )
                    }
                    val response = RecruitmentCommandResponse(next.archiveRevision, plan.eventsToAdd.map { it.eventId })
                    store.insertRequest(
                        RecruitmentRequestRecord(
                            "$userId:${input.accountId}:${input.requestId}",
                            userId,
                            input.accountId,
                            input.requestId,
                            requestHash,
                            response.archiveRevision,
                            response.eventIds,
                            createdAt = now,
                        ),
                    )
                    events.publishChange(userId, input.accountId, "recruitment_changed", mapOf("archive_revision" to next.archiveRevision))
                    response
                },
            )
        } catch (error: RuntimeException) {
            if (!RecruitmentService.isWriteConflict(error)) throw error
            recruitment.retry(userId, input.accountId, input.requestId, requestHash) ?: throw recruitmentConflict()
        }
        synchronized(previews) { previews.remove(input.previewToken) }
        return result
    }

    private fun checkPlanSize(plan: RecruitmentExchangePlan, now: Instant, recordsOnly: Boolean = false) {
        // Reserve the complete target metadata and maximum nanosecond precision before accepting the plan.
        val sizingTime = Instant.ofEpochSecond(now.epochSecond, 123456789)
        val importId = "import_00000000-0000-0000-0000-000000000000"
        val eventIds = plan.eventsToAdd.map { it.eventId }.toSet()
        val batchIds = plan.batchesToAdd.map { it.batchId }.toSet()
        val candidate = plan.candidateDocument.copy(
            exportedAt = sizingTime,
            events = plan.candidateDocument.events.map {
                if (it.eventId in
                    eventIds
                ) {
                    it.copy(
                        importBatchId = importId,
                        importedAt = sizingTime,
                        deletedRevision = it.deletedAt?.let { 0L },
                        createdAt = if (recordsOnly) sizingTime else it.createdAt,
                        updatedAt = if (recordsOnly) sizingTime else it.updatedAt,
                    )
                } else {
                    it
                }
            },
            batches = plan.candidateDocument.batches.map {
                if (it.batchId in
                    batchIds
                ) {
                    it.copy(
                        importBatchId = importId,
                        importedAt = sizingTime,
                        deletedRevision = it.deletedAt?.let { 0L },
                        createdAt = if (recordsOnly) sizingTime else it.createdAt,
                    )
                } else {
                    it
                }
            },
        )
        if (mapper.writeValueAsBytes(candidate).size > RECRUITMENT_EXCHANGE_MAX_BYTES) {
            throw recruitmentInvalid("合并后的完整备份超过5MiB，整包不能导入")
        }
    }

    private fun history(userId: String, accountId: String): Pair<List<RecruitmentEvent>, List<RecruitmentBatch>> {
        val records = store.exchangeEvents(userId, accountId, RECRUITMENT_EXCHANGE_MAX_EVENTS + 1)
        val batches = store.exchangeBatches(userId, accountId, RECRUITMENT_EXCHANGE_MAX_EVENTS + 1)
        if (records.size > RECRUITMENT_EXCHANGE_MAX_EVENTS || batches.size > RECRUITMENT_EXCHANGE_MAX_EVENTS) {
            throw recruitmentInvalid("完整档案超过20000条记录上限，不能截断备份或部分导入")
        }
        return records to batches
    }

    private fun readDocument(node: JsonNode, current: RecruitmentArchive, options: RecruitmentImportOptions): RecruitmentExchangeDocument {
        if (node.path("schema").asText() != RECRUITMENT_RECORD_IMPORT_SCHEMA) return validation.read(node)
        if (options.stateStrategy != "keep_current") throw recruitmentInvalid("记录导入只能追加，不能恢复备份状态")
        return RecruitmentRecordImport(mapper, catalog).read(node, current)
    }

    private fun checkBinding(
        userId: String,
        input: RecruitmentImportCommitRequest,
        documentHash: String,
        optionHash: String,
    ): PreviewBinding {
        val binding = synchronized(previews) { previews[input.previewToken] }
        if (binding == null || !binding.expiresAt.isAfter(clock.instant())) {
            throw RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_preview_expired", "预览已过期或服务已重启，请重新预览")
        }
        if (binding.userId != userId || binding.accountId != input.accountId || binding.documentHash != documentHash ||
            input.documentHash != documentHash || binding.optionHash != optionHash || binding.revision != input.expectedRevision
        ) {
            throw RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_preview_mismatch", "预览不属于当前账号、文件或选择，请重新预览")
        }
        return binding
    }

    private fun gameMismatch(): Nothing = throw RecruitmentApiException(
        HttpStatus.CONFLICT,
        "recruitment_game_mismatch",
        "备份、档案与目标账号必须属于同一游戏",
    )

    private data class PreviewBinding(
        val userId: String,
        val accountId: String,
        val documentHash: String,
        val optionHash: String,
        val revision: Long,
        val expiresAt: Instant,
        val resolvedHash: String? = null,
    )
}
