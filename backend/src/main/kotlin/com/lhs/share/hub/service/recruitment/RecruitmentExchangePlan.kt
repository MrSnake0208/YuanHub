package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeAccount
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeBatch
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeDocument
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeEvent
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportOptions
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportItem
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportStats
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import java.time.Instant

internal data class RecruitmentExchangePlan(
    val archive: RecruitmentArchive,
    val candidateDocument: RecruitmentExchangeDocument,
    val eventsToAdd: List<RecruitmentExchangeEvent>,
    val batchesToAdd: List<RecruitmentExchangeBatch>,
    val items: List<RecruitmentImportItem>,
    val risks: List<String>,
    val currentKnownTotal: Long,
    val backupKnownTotal: Long,
    val candidateKnownTotal: Long,
    val canCommit: Boolean,
) {
    val stats get() = RecruitmentImportStats(
        items.count { it.status == "add" },
        items.count { it.status == "duplicate" },
        items.count { it.status == "conflict" },
        items.count { it.status == "skip" || it.status == "count_overlap" },
    )
}

/** One bounded merge policy, after directory authorization. No record resurrection or implicit state addition. */
internal fun recruitmentExchangePlan(
    current: RecruitmentArchive,
    currentEvents: List<RecruitmentEvent>,
    currentBatches: List<RecruitmentBatch>,
    backup: RecruitmentExchangeDocument,
    options: RecruitmentImportOptions,
    recordsOnly: Boolean = false,
): RecruitmentExchangePlan {
    if (options.stateStrategy !in setOf("keep_current", "use_backup")) throw recruitmentInvalid("导入状态策略不正确")
    val original = exchangeDocument(current, currentEvents, currentBatches, Instant.EPOCH)
    if (recordsOnly && options.stateStrategy != "keep_current") throw recruitmentInvalid("记录导入只能追加，不能恢复备份状态")
    val restoring = !recordsOnly && currentEvents.isEmpty() && currentBatches.isEmpty() && current.baseline == 0L &&
        current.temporaryAgents.isEmpty() && current.pools.all {
            it.snapshot.catalogPoolId != null && it.progress == 0L && it.wishAgentIds.isEmpty()
        }
    val useState = !recordsOnly && (restoring || options.stateStrategy == "use_backup")
    val items = mutableListOf<RecruitmentImportItem>()
    val risks = linkedSetOf<String>()
    val badPools = mutableSetOf<String>()
    val badAgents = mutableSetOf<String>()
    val pools = (if (restoring) emptyList() else current.pools).associateBy { it.poolId }.toMutableMap()
    val agents = (if (restoring) emptyList() else current.temporaryAgents).associateBy { it.agentId }.toMutableMap()
    fun item(kind: String, id: String, status: String, reason: String) {
        items += RecruitmentImportItem(kind, id, status, reason)
    }
    backup.pools.forEach { pool ->
        val old = pools[pool.poolId]
        when {
            old == null -> {
                pools[pool.poolId] = pool.copy(
                    progress = if (useState) pool.progress else null,
                    wishAgentIds = if (useState) pool.wishAgentIds else emptyList(),
                )
                item("pool", pool.poolId, "add", "新增卡池快照；当前进度按状态策略处理")
            }
            poolBusiness(old) == poolBusiness(pool) -> {
                if (useState) pools[pool.poolId] = old.copy(progress = pool.progress, wishAgentIds = pool.wishAgentIds)
                item("pool", pool.poolId, "duplicate", "已有相同卡池快照")
            }
            else -> {
                badPools += pool.poolId
                item("pool", pool.poolId, "conflict", "相同ID的卡池快照不同，保留当前及其关联记录")
            }
        }
    }
    backup.temporaryAgents.forEach { agent ->
        val old = agents[agent.agentId]
        when {
            old == null -> {
                agents[agent.agentId] = agent
                item("agent", agent.agentId, "add", "新增临时密探及映射快照")
            }
            old == agent -> item("agent", agent.agentId, "duplicate", "已有相同临时密探")
            else -> {
                badAgents += agent.agentId
                item("agent", agent.agentId, "conflict", "相同ID的临时密探内容不同，保留当前")
            }
        }
    }
    if (pools.size > 500 || agents.size > 1000) throw recruitmentInvalid("合并后超过卡池或临时密探上限")
    val batches = original.batches.associateBy { it.batchId }.toMutableMap()
    val events = original.events.associateBy { it.eventId }.toMutableMap()
    val batchesToAdd = mutableListOf<RecruitmentExchangeBatch>()
    val eventsToAdd = mutableListOf<RecruitmentExchangeEvent>()
    val unavailableBatches = mutableSetOf<String>()
    fun overlap(poolId: String): Boolean = !restoring && (
        current.baseline > 0 || (!recordsOnly && backup.baseline > 0) ||
            current.pools.any { it.poolId == poolId && (it.progress == null || it.progress > 0) } ||
            (!recordsOnly && backup.pools.any { it.poolId == poolId && (it.progress == null || it.progress > 0) }) ||
            currentBatches.any { it.poolId == poolId && it.deletedAt == null }
        )
    backup.batches.forEach { batch ->
        val old = batches[batch.batchId]
        when {
            old != null && batchBusiness(old) == batchBusiness(batch) -> item("batch", batch.batchId, "duplicate", "已有相同计数批次")
            old != null -> {
                unavailableBatches += batch.batchId
                item("batch", batch.batchId, "conflict", "相同ID的批次内容或删除状态不同，保留当前")
            }
            batch.poolId in badPools -> {
                unavailableBatches += batch.batchId
                item("batch", batch.batchId, "skip", "所属卡池快照冲突")
            }
            batch.deletedAt == null && overlap(batch.poolId) && !options.confirmCountChange -> {
                risks += "新增计数批次可能与基准、当前进度或已有批次覆盖相同抽数；默认跳过，确认候选总数后重新预览"
                unavailableBatches += batch.batchId
                item("batch", batch.batchId, "count_overlap", "尚未明确确认抽数覆盖风险")
            }
            else -> {
                if (batch.deletedAt == null && overlap(batch.poolId)) risks += "已明确确认新增批次的抽数覆盖风险"
                batches[batch.batchId] = batch
                batchesToAdd += batch
                item("batch", batch.batchId, "add", if (batch.deletedAt == null) "新增批次计数" else "保留备份删除标记")
            }
        }
    }
    val liveBatchSpans = original.events.filter { it.deletedAt == null && it.batchId != null }
        .groupBy { it.batchId }.mapValues { (_, values) -> values.sumOf { it.pullSpan ?: 0 } }.toMutableMap()
    var nextOrder = current.nextEventOrder
    backup.events.sortedBy { it.sortOrder }.forEach { event ->
        val old = events[event.eventId]
        val batch = event.batchId?.let { batches[it] }
        when {
            old != null && eventBusiness(old) == eventBusiness(event) -> item("event", event.eventId, "duplicate", "已有相同业务记录")
            old != null -> item("event", event.eventId, "conflict", "相同ID内容或删除状态不同，保留当前，不复活或删除记录")
            event.poolId in badPools || event.agentSnapshot.agentId in badAgents -> item("event", event.eventId, "skip", "关联快照冲突")
            event.batchId != null && (event.batchId in unavailableBatches || batch == null) ->
                item("event", event.eventId, "skip", "关联批次未导入，不能拆开计数事实")
            event.deletedAt == null && batch?.deletedAt != null -> item("event", event.eventId, "conflict", "当前批次已删除，不复活关联记录")
            event.deletedAt == null && event.batchId != null &&
                (liveBatchSpans[event.batchId] ?: 0) + (event.pullSpan ?: 0) > batch!!.totalPullCount -> {
                risks += "合并后的批次已知间隔超过总抽数，关联新增记录已跳过"
                item("event", event.eventId, "count_overlap", "不能超出已有批次总抽数")
            }
            event.deletedAt == null && event.batchId == null && overlap(event.poolId) && !options.confirmCountChange -> {
                risks += "新增独立记录可能与基准、当前进度或已有批次覆盖相同抽数；默认跳过，确认候选总数后重新预览"
                item("event", event.eventId, "count_overlap", "尚未明确确认抽数覆盖风险")
            }
            else -> {
                if (event.deletedAt == null && event.batchId == null && overlap(event.poolId)) risks += "已明确确认新增独立记录的抽数覆盖风险"
                val ordered = event.copy(sortOrder = if (restoring) event.sortOrder else nextOrder++)
                events[event.eventId] = ordered
                eventsToAdd += ordered
                if (event.deletedAt == null && event.batchId != null) {
                    liveBatchSpans[event.batchId] = (liveBatchSpans[event.batchId] ?: 0) + (event.pullSpan ?: 0)
                }
                item("event", event.eventId, "add", if (event.deletedAt == null) "新增历史记录" else "保留备份删除标记")
            }
        }
    }
    if (events.size > RECRUITMENT_EXCHANGE_MAX_EVENTS || batches.size > RECRUITMENT_EXCHANGE_MAX_EVENTS) {
        throw recruitmentInvalid("合并后超过20000条记录上限，整包不能导入")
    }
    if (restoring) nextOrder = (events.values.maxOfOrNull { it.sortOrder } ?: 0) + 1
    val next = current.copy(
        baseline = if (useState) backup.baseline else current.baseline,
        currentPoolId = if (useState && backup.currentPoolId !in badPools) backup.currentPoolId else current.currentPoolId,
        pools = pools.values.toList(),
        temporaryAgents = agents.values.toList(),
        nextEventOrder = nextOrder,
    )
    val stateChanged = next.baseline != current.baseline || next.currentPoolId != current.currentPoolId ||
        next.pools.associate { it.poolId to Pair(it.progress, it.wishAgentIds) } !=
        current.pools.associate { it.poolId to Pair(it.progress, it.wishAgentIds) }
    val needsStateConfirmation = !restoring && options.stateStrategy == "use_backup" && stateChanged
    if (needsStateConfirmation) risks += "使用备份状态会替换基准、匹配卡池进度与心愿密探（不会相加）；须明确确认候选总抽数"
    item(
        "state",
        "archive",
        if (useState && stateChanged) {
            "add"
        } else if (useState) {
            "duplicate"
        } else {
            "skip"
        },
        if (restoring) {
            "空档案恢复完整逻辑状态"
        } else if (useState) {
            "使用备份状态替换基准、匹配卡池进度与心愿密探"
        } else {
            "保留当前基准、进度与偏好"
        },
    )
    val candidate = original.copy(
        archiveRevision = current.archiveRevision + 1,
        baseline = next.baseline,
        currentPoolId = next.currentPoolId,
        pools = next.pools,
        temporaryAgents = next.temporaryAgents,
        events = events.values.toList(),
        batches = batches.values.toList(),
    )
    if (candidate.currentPoolId != null && candidate.pools.none { it.poolId == candidate.currentPoolId }) {
        throw recruitmentConflict("候选当前卡池不存在")
    }
    return RecruitmentExchangePlan(
        next, candidate, eventsToAdd, batchesToAdd, items, risks.toList(),
        exchangeTotal(
            original,
        ),
        exchangeTotal(backup), exchangeTotal(candidate),
        !needsStateConfirmation || options.confirmCountChange,
    )
}

internal fun exchangeTotal(document: RecruitmentExchangeDocument): Long = document.baseline +
    document.pools.sumOf { it.progress ?: 0 } +
    document.events.filter { it.deletedAt == null && it.batchId == null }.sumOf { it.pullSpan ?: 0 } +
    document.batches.filter { it.deletedAt == null }.sumOf { it.totalPullCount }

internal fun exchangeDocument(archive: RecruitmentArchive, events: List<RecruitmentEvent>, batches: List<RecruitmentBatch>, now: Instant) =
    RecruitmentExchangeDocument(
        RECRUITMENT_EXCHANGE_SCHEMA, now, RecruitmentExchangeAccount(archive.accountId), archive.gameSnapshot, archive.archiveRevision,
        archive.baseline, archive.currentPoolId, archive.pools, archive.temporaryAgents,
        events.map {
            it.exchange()
        },
        batches.map { it.exchange() },
    )

internal fun RecruitmentEvent.exchange() = RecruitmentExchangeEvent(
    eventId, poolId, poolSnapshot, agentSnapshot, pullSpan, sortOrder, upStatus, acquiredDate, note, source, batchId,
    createdAt, updatedAt, deletedAt, deletedRevision, importBatchId, importedAt,
)
internal fun RecruitmentBatch.exchange() = RecruitmentExchangeBatch(
    batchId,
    poolId,
    totalPullCount,
    createdAt,
    deletedAt,
    deletedRevision,
    importBatchId,
    importedAt,
)

// Directory display metadata can change without changing the stable pool/agent reference or personal facts.
private fun snapshotBusiness(value: RecruitmentPoolSnapshot) = if (value.catalogPoolId == null) {
    value
} else {
    RecruitmentPoolSnapshot("", value.game, value.catalogPoolId)
}
private fun poolBusiness(value: RecruitmentPool) = value.copy(
    progress = null,
    wishAgentIds = emptyList(),
    snapshot = snapshotBusiness(value.snapshot),
    mappedSnapshot = value.mappedSnapshot?.let(::snapshotBusiness),
)

// Target placement and storage clocks change on import/reorder; spans, dates, notes, provenance and deletion remain business facts.
private fun eventBusiness(value: RecruitmentExchangeEvent) = value.copy(
    poolSnapshot = snapshotBusiness(value.poolSnapshot),
    agentSnapshot = if (value.poolSnapshot.catalogPoolId != null && !value.agentSnapshot.temporary) {
        value.agentSnapshot.copy(name = "", catalogRevision = null)
    } else {
        value.agentSnapshot
    },
    sortOrder = 0,
    createdAt = Instant.EPOCH,
    updatedAt = Instant.EPOCH,
    deletedAt = value.deletedAt?.let { Instant.EPOCH },
    deletedRevision = null,
    importBatchId = null,
    importedAt = null,
)
private fun batchBusiness(value: RecruitmentExchangeBatch) = value.copy(
    createdAt = Instant.EPOCH,
    deletedAt = value.deletedAt?.let {
        Instant.EPOCH
    },
    deletedRevision = null,
    importBatchId = null,
    importedAt = null,
)
