package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentBaselineSet
import com.lhs.share.hub.controller.recruitment.request.RecruitmentBatchCreate
import com.lhs.share.hub.controller.recruitment.request.RecruitmentBatchSelect
import com.lhs.share.hub.controller.recruitment.request.RecruitmentEventCreate
import com.lhs.share.hub.controller.recruitment.request.RecruitmentEventInput
import com.lhs.share.hub.controller.recruitment.request.RecruitmentEventReorder
import com.lhs.share.hub.controller.recruitment.request.RecruitmentEventSelect
import com.lhs.share.hub.controller.recruitment.request.RecruitmentEventUpdate
import com.lhs.share.hub.controller.recruitment.request.RecruitmentPoolCreate
import com.lhs.share.hub.controller.recruitment.request.RecruitmentPoolRecordsSave
import com.lhs.share.hub.controller.recruitment.request.RecruitmentPoolSelect
import com.lhs.share.hub.controller.recruitment.request.RecruitmentProgressSet
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRequestDecoder
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCommandResponse
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/** All methods are invoked inside the account-fenced Hub transaction. */
@Service
class RecruitmentMutation(
    private val store: RecruitmentRepository,
    private val catalog: RecruitmentCatalog,
    mapper: ObjectMapper,
) {
    private val decoder = RecruitmentRequestDecoder(mapper)

    fun apply(archive: RecruitmentArchive, operation: String, data: JsonNode, now: Instant): RecruitmentMutationResult {
        if (!data.isObject) throw recruitmentInvalid("操作数据必须是对象")
        val poolId = when (operation) {
            "set_current_pool" -> read<RecruitmentPoolSelect>(data).poolId
            "progress_set" -> read<RecruitmentProgressSet>(data).poolId
            "pool_records_save" -> read<RecruitmentPoolRecordsSave>(data).poolId
            "event_create" -> read<RecruitmentEventCreate>(data).poolId
            "batch_create" -> read<RecruitmentBatchCreate>(data).poolId
            else -> null
        }
        var current = if (poolId == null || archive.pools.any { it.poolId == poolId }) {
            archive
        } else {
            if (archive.pools.size >= 500) throw recruitmentInvalid("卡池档案已达500个上限")
            val selected = catalog.projectPools(archive.pools, archive.gameSnapshot).firstOrNull { it.poolId == poolId }
                ?: throw recruitmentNotFound("pool")
            archive.copy(pools = archive.pools + selected, currentPoolId = archive.currentPoolId ?: poolId)
        }
        var next = current
        var result = RecruitmentCommandResponse(current.archiveRevision + 1)
        when (operation) {
            "pool_create" -> {
                val input = read<RecruitmentPoolCreate>(data)
                if (!data.has("progress")) throw recruitmentInvalid("请明确提供初始进度；未知时填写null")
                input.progress?.let { recruitmentCount(it, "progress") }
                if (current.pools.size >= 500) throw recruitmentInvalid("卡池档案已达500个上限")
                val id = validId(input.poolId ?: newId("pool_"))
                if (current.pools.any { it.poolId == id }) throw conflictId("pool")
                if (input.name != null) throw recruitmentInvalid("卡池只能由管理员配置，请选择公共卡池")
                val catalogId = input.catalogPoolId ?: throw recruitmentInvalid("请选择管理员配置的公共卡池")
                val snapshot = catalog.snapshot(current.gameSnapshot, catalogId)
                if (current.pools.any { (it.mappedSnapshot ?: it.snapshot).catalogPoolId == catalogId }) {
                    throw recruitmentInvalid("该公共卡池已关联个人卡池，请维护已有卡池，不能重复创建")
                }
                next =
                    current.copy(
                        pools = current.pools + RecruitmentPool(id, snapshot, input.progress),
                        currentPoolId =
                        current.currentPoolId ?: id,
                    )
                result = result.copy(poolId = id)
            }
            "set_current_pool" -> {
                val input = read<RecruitmentPoolSelect>(data)
                pool(current, input.poolId)
                next = current.copy(currentPoolId = input.poolId)
                result = result.copy(poolId = input.poolId)
            }
            "progress_set" -> {
                val input = read<RecruitmentProgressSet>(data)
                if (!data.has("progress")) throw recruitmentInvalid("请提供当前进度；未知时填写null")
                input.progress?.let { recruitmentCount(it, "progress") }
                next = replacePool(current, pool(current, input.poolId).copy(progress = input.progress))
            }
            "pool_records_save" -> {
                val input = read<RecruitmentPoolRecordsSave>(data)
                input.wishAgentIds?.let { ids ->
                    val selected = pool(current, input.poolId)
                    if (!catalog.personalSnapshot(selected).allowCustomUp) throw recruitmentInvalid("该卡池未开放自选心愿UP")
                    catalog.validateWishes(current.gameSnapshot, ids)
                    val wished = selected.copy(wishAgentIds = ids)
                    val snapshot = catalog.personalSnapshot(wished)
                    current = replacePool(
                        current,
                        if (wished.mappedSnapshot != null) wished.copy(mappedSnapshot = snapshot) else wished.copy(snapshot = snapshot),
                    )
                }
                if (input.remainingPulls != null && input.remainingPulls !in 1..40 || input.entries.size > 120 ||
                    input.deletedEventIds.size > 120
                ) {
                    throw recruitmentInvalid("剩余抽数须为1–40，每次最多维护120条出货记录")
                }
                val ids = input.entries.map { validId(it.eventId ?: throw recruitmentInvalid("每条出货须提供稳定ID")) }
                if ((ids + input.deletedEventIds).toSet().size != ids.size + input.deletedEventIds.size) {
                    throw recruitmentInvalid("记录ID不能重复，也不能同时修改和删除")
                }
                input.deletedEventIds.forEach(::validId)
                val oldEvents = input.entries.mapNotNull { entry ->
                    store.event(current.userId, current.accountId, entry.eventId!!)?.let { old ->
                        if (old.poolId != input.poolId || old.deletedAt != null) throw recruitmentInvalid("不能修改其他池或已删除的出货")
                        old
                    }
                }.associateBy { it.eventId }
                val removed = input.deletedEventIds.map { id ->
                    liveEvent(current, id).also { if (it.poolId != input.poolId) throw recruitmentInvalid("不能删除其他卡池的出货") }
                }
                val changed = input.entries.mapNotNull { entry -> oldEvents[entry.eventId]?.let { updateEvent(current, it, entry, now) } }
                val newEntries = input.entries.filter { it.eventId !in oldEvents }
                val added = if (newEntries.isEmpty()) emptyList() else newEvents(current, input.poolId, newEntries, now)
                val modifiedEvents = changed + added + removed
                val ordered = input.orderedEventIds?.let { ids ->
                    if (ids.size > 20_000 || ids.toSet().size != ids.size) {
                        throw recruitmentInvalid("排序ID不能重复，最多20000条")
                    }
                    ids.forEach(::validId)
                    val existing = store.poolEvents(current.userId, current.accountId, input.poolId, 20_001)
                    val removedIds = removed.map { it.eventId }.toSet()
                    val replacements = changed.associateBy { it.eventId }
                    val live = existing.filter { it.eventId !in removedIds }.map { replacements[it.eventId] ?: it } + added
                    if (existing.size > 20_000 || live.size > 20_000 || live.map { it.eventId }.toSet() != ids.toSet()) {
                        throw recruitmentConflict("排序需要保存后本池完整有效记录（最多20000条），请重新核对")
                    }
                    val byId = live.associateBy { it.eventId }
                    val slots = live.map { it.sortOrder }.sorted()
                    ids.mapIndexedNotNull { index, id ->
                        byId.getValue(id).takeIf { it.sortOrder != slots[index] }?.copy(sortOrder = slots[index], updatedAt = now)
                    }
                }
                if (input.remainingPulls == null && modifiedEvents.isEmpty() && ordered == null && input.wishAgentIds == null) {
                    throw recruitmentInvalid("请修改出货记录、顺序或填写保底进度后保存")
                }
                val touchedBatches = (changed + removed).mapNotNull { it.batchId }.toSet()
                val adjustedBatches = touchedBatches.map { id ->
                    val batch = liveBatch(current, id)
                    val total =
                        recruitmentCount(batch.totalPullCount - removed.filter { it.batchId == id }.sumOf { it.pullSpan ?: 0 }, "批次剩余")
                    val replacements = changed.associateBy { it.eventId }
                    val removedIds = removed.map { it.eventId }.toSet()
                    val spans = store.batchEvents(current.userId, current.accountId, id)
                        .filter { it.deletedAt == null && it.eventId !in removedIds }
                        .sumOf { (replacements[it.eventId] ?: it).pullSpan ?: 0 }
                    if (spans > total) throw recruitmentInvalid("已知间隔之和超出扣除已删除记录后的批次总抽数，请核对记录")
                    batch.copy(totalPullCount = total)
                }
                adjustedBatches.forEach(store::saveBatch)
                changed.forEach(store::saveEvent)
                added.forEach(store::insertEvent)
                removed.forEach {
                    store.saveEvent(
                        it.copy(
                            deletedAt = now,
                            deletedRevision = current.archiveRevision + 1,
                            updatedAt = now,
                            batchCountDeducted = it.batchId != null && it.pullSpan != null,
                        ),
                    )
                }
                // The full set was checked before any writes; slot changes share the same account-fenced transaction.
                ordered?.forEach(store::saveEvent)
                val currentPool = pool(current, input.poolId)
                val progress = input.remainingPulls?.let { 40L - it } ?: currentPool.progress
                next = replacePool(current, currentPool.copy(progress = progress))
                    .copy(nextEventOrder = current.nextEventOrder + added.size)
                result = result.copy(poolId = input.poolId, eventIds = changed.map { it.eventId } + added.map { it.eventId })
            }
            "baseline_set" -> next = current.copy(baseline = recruitmentCount(read<RecruitmentBaselineSet>(data).baseline, "baseline"))
            "temporary_agent_create", "pool_map", "agent_map" ->
                throw recruitmentInvalid("卡池及UP占位密探只能由管理员管理")
            "event_create" -> {
                val input = read<RecruitmentEventCreate>(data)
                val events = newEvents(current, input.poolId, input.entries, now)
                val count = events.sumOf { it.pullSpan ?: 0 }
                val progress = pool(current, input.poolId).progress
                validateMode(input.mode, input.extractFromBaseline)
                val topRarityEvents = events.filter { it.agentSnapshot.rarity == 5 }
                if (input.mode == "current" && topRarityEvents.isNotEmpty()) {
                    if (progress == null) throw recruitmentInvalid("当前进度未知，请先校准进度或改用历史补录")
                    if (topRarityEvents.any { it.pullSpan == null } ||
                        topRarityEvents.first().pullSpan!! <= progress
                    ) {
                        throw recruitmentInvalid("当前出货须填写确切间隔，首条抽数必须大于已记录进度")
                    }
                    if (!data.has("tail_progress")) throw recruitmentInvalid("请提供出货后的尾抽进度；未知时填写null")
                    input.tailProgress?.let { recruitmentCount(it, "tail_progress") }
                    next = replacePool(current, pool(current, input.poolId).copy(progress = input.tailProgress))
                }
                if (input.extractFromBaseline &&
                    topRarityEvents.any { it.pullSpan == null }
                ) {
                    throw recruitmentInvalid("未知间隔不能从历史基准中拆出，请先确认抽数")
                }
                next = extract(next, input.extractFromBaseline, count).copy(nextEventOrder = current.nextEventOrder + events.size)
                events.forEach(store::insertEvent)
                result = result.copy(eventIds = events.map { it.eventId }, poolId = input.poolId)
            }
            "event_update" -> {
                val input = read<RecruitmentEventUpdate>(data)
                val old = liveEvent(current, input.eventId)
                if (input.entry.eventId != null && input.entry.eventId != old.eventId) throw recruitmentInvalid("不能修改记录ID")
                val changed = updateEvent(current, old, input.entry, now)
                old.batchId?.let { id ->
                    val batch = liveBatch(current, id)
                    val sum =
                        store.batchEvents(current.userId, current.accountId, id).filter {
                            it.eventId != old.eventId && it.deletedAt == null
                        }.sumOf {
                            it.pullSpan
                                ?: 0
                        } +
                            (changed.pullSpan ?: 0)
                    if (sum > batch.totalPullCount) throw recruitmentInvalid("已知间隔之和超出批次总抽数，请核对记录")
                }
                store.saveEvent(changed)
                result = result.copy(eventIds = listOf(old.eventId))
            }
            "event_delete", "event_restore" -> {
                val input = read<RecruitmentEventSelect>(data)
                val old = store.event(current.userId, current.accountId, input.eventId) ?: throw recruitmentNotFound("event")
                val restoring = operation == "event_restore"
                if (restoring) {
                    if (old.deletedAt == null ||
                        old.deletedRevision != current.archiveRevision
                    ) {
                        throw recruitmentConflict("撤销已过期，请重新读取档案")
                    }
                } else if (old.deletedAt != null) {
                    throw recruitmentNotFound("event")
                }
                old.batchId?.let { id ->
                    val batch = liveBatch(current, id)
                    val delta = if (restoring) {
                        if (old.batchCountDeducted) old.pullSpan ?: 0 else 0
                    } else {
                        -(old.pullSpan ?: 0)
                    }
                    store.saveBatch(batch.copy(totalPullCount = recruitmentCount(batch.totalPullCount + delta, "批次剩余")))
                }
                store.saveEvent(
                    old.copy(
                        deletedAt = if (restoring) null else now,
                        deletedRevision = if (restoring) {
                            null
                        } else {
                            current.archiveRevision +
                                1
                        },
                        updatedAt = now,
                        batchCountDeducted = !restoring && old.batchId != null && old.pullSpan != null,
                    ),
                )
                result = result.copy(eventIds = listOf(old.eventId))
            }
            "event_reorder" -> {
                val input = read<RecruitmentEventReorder>(data)
                pool(current, input.poolId)
                if (input.eventIds.size > 20_000 ||
                    input.eventIds.toSet().size != input.eventIds.size
                ) {
                    throw recruitmentInvalid("重排ID不能重复，最多20000条")
                }
                val events = store.poolEvents(current.userId, current.accountId, input.poolId, 20_001)
                if (events.size > 20_000 ||
                    events.map { it.eventId }.toSet() != input.eventIds.toSet()
                ) {
                    throw recruitmentConflict("排序需要当前卡池完整有效记录，请刷新后重试")
                }
                // Preserve this pool's global order slots; reordering cannot change pull counts or other pools.
                val slots = events.map { it.sortOrder }.sorted()
                val byId = events.associateBy { it.eventId }
                input.eventIds.forEachIndexed { index, id ->
                    store.saveEvent(byId.getValue(id).copy(sortOrder = slots[index], updatedAt = now))
                }
                result = result.copy(eventIds = input.eventIds)
            }
            "batch_create" -> {
                val input = read<RecruitmentBatchCreate>(data)
                val total = recruitmentCount(input.totalPullCount, "total_pull_count", true)
                val id = validId(input.batchId ?: newId("batch_"))
                if (store.batch(current.userId, current.accountId, id) != null) throw conflictId("batch")
                val events = newEvents(current, input.poolId, input.entries, now).map { it.copy(batchId = id) }
                if (events.sumOf { it.pullSpan ?: 0 } > total) throw recruitmentInvalid("已知间隔之和超出批次总抽数，请核对记录")
                validateMode(input.mode, input.extractFromBaseline)
                if (input.mode == "current" && events.any { it.agentSnapshot.rarity == 5 }) {
                    val progress =
                        pool(current, input.poolId).progress
                            ?: throw recruitmentInvalid("当前进度未知，请先校准进度或改用历史补录")
                    if (total <= progress) throw recruitmentInvalid("批次抽数必须大于已记录的当前进度")
                    if (!data.has("tail_progress")) throw recruitmentInvalid("请提供出货后的尾抽进度；未知时填写null")
                    input.tailProgress?.let { recruitmentCount(it, "tail_progress") }
                    next = replacePool(current, pool(current, input.poolId).copy(progress = input.tailProgress))
                }
                next = extract(next, input.extractFromBaseline, total).copy(nextEventOrder = current.nextEventOrder + events.size)
                store.insertBatch(RecruitmentBatch(scoped(current, id), current.userId, current.accountId, id, input.poolId, total, now))
                events.forEach(store::insertEvent)
                result = result.copy(eventIds = events.map { it.eventId }, poolId = input.poolId, batchId = id)
            }
            "batch_delete", "batch_restore" -> {
                val input = read<RecruitmentBatchSelect>(data)
                val batch = store.batch(current.userId, current.accountId, input.batchId) ?: throw recruitmentNotFound("batch")
                val restoring = operation == "batch_restore"
                if (restoring) {
                    if (batch.deletedAt == null ||
                        batch.deletedRevision != current.archiveRevision
                    ) {
                        throw recruitmentConflict("批次撤销已过期，请重新读取档案")
                    }
                } else {
                    if (batch.deletedAt != null) throw recruitmentNotFound("batch")
                    if (input.confirmTotalPullCount !=
                        batch.totalPullCount
                    ) {
                        throw recruitmentInvalid("删除前请确认当前批次总抽数")
                    }
                }
                val events = store.batchEvents(current.userId, current.accountId, batch.batchId).filter {
                    if (restoring) it.deletedRevision == batch.deletedRevision else it.deletedAt == null
                }
                events.forEach {
                    store.saveEvent(
                        it.copy(
                            deletedAt = if (restoring) null else now,
                            deletedRevision = if (restoring) {
                                null
                            } else {
                                current.archiveRevision +
                                    1
                            },
                            updatedAt = now,
                        ),
                    )
                }
                store.saveBatch(
                    batch.copy(
                        deletedAt = if (restoring) null else now,
                        deletedRevision = if (restoring) {
                            null
                        } else {
                            current.archiveRevision +
                                1
                        },
                    ),
                )
                result = result.copy(eventIds = events.map { it.eventId }, batchId = batch.batchId)
            }
            else -> throw recruitmentInvalid("不支持该操作")
        }
        return RecruitmentMutationResult(next.copy(archiveRevision = current.archiveRevision + 1, updatedAt = now), result)
    }

    private fun newEvents(
        current: RecruitmentArchive,
        poolId: String,
        entries: List<RecruitmentEventInput>,
        now: Instant,
    ): List<RecruitmentEvent> {
        val pool = pool(current, poolId)
        if (pool.snapshot.catalogPoolId == null) throw recruitmentInvalid("旧临时卡池仅支持维护已有记录，请选择管理员卡池新增")
        val poolSnapshot = catalog.personalSnapshot(pool)
        if (entries.isEmpty() || entries.size > 120) throw recruitmentInvalid("每次请填写1至120条密探结果")
        val seen = HashSet<String>()
        return entries.mapIndexed { index, entry ->
            val id = validId(entry.eventId ?: newId("event_"))
            if (!seen.add(id) || store.event(current.userId, current.accountId, id) != null) throw conflictId("event")
            val event = RecruitmentEvent(
                scoped(current, id), current.userId, current.accountId, id, poolId,
                poolSnapshot,
                agent(current, poolSnapshot, entry.agentId), entry.pullSpan, current.nextEventOrder + index, createdAt = now,
            )
            updateEvent(current, event, entry.copy(agentId = event.agentSnapshot.agentId), now)
        }
    }

    private fun updateEvent(
        current: RecruitmentArchive,
        old: RecruitmentEvent,
        entry: RecruitmentEventInput,
        now: Instant,
    ): RecruitmentEvent {
        entry.pullSpan?.let { recruitmentCount(it, "pull_span", true) }
        if (entry.upStatus !in setOf("up", "non_up", "unknown")) throw recruitmentInvalid("UP状态只允许up、non_up或unknown")
        if (entry.note != null && entry.note.length > 1000) throw recruitmentInvalid("备注不能超过1000个字符")
        val snapshot = if (entry.agentId ==
            old.agentSnapshot.agentId
        ) {
            old.agentSnapshot
        } else {
            agent(current, catalog.personalSnapshot(pool(current, old.poolId), requireEnabled = false), entry.agentId)
        }
        if (snapshot.rarity == 4 && entry.pullSpan != null) throw recruitmentInvalid("4星仅统计获得次数，不能填写绝密出货抽数")
        return old.copy(
            agentSnapshot = snapshot,
            pullSpan = entry.pullSpan,
            upStatus = entry.upStatus,
            acquiredDate = entry.acquiredDate,
            note = entry.note?.trim()?.takeIf {
                it.isNotEmpty()
            },
            updatedAt = now,
        )
    }

    internal fun agent(current: RecruitmentArchive, poolSnapshot: RecruitmentPoolSnapshot, id: String): RecruitmentAgentSnapshot {
        poolSnapshot.upAgents.firstOrNull { it.id == id || it.active && it.operatorId == id }?.let { slot ->
            if (!slot.active) throw recruitmentInvalid("该UP密探已退役，不能新增选择")
            return RecruitmentAgentSnapshot(
                slot.id,
                slot.name,
                catalogRevision = poolSnapshot.catalogRevision,
                rarity = slot.operatorId?.let {
                    try {
                        catalog.operator(current.gameSnapshot, it).rarity
                    } catch (_: RecruitmentApiException) {
                        // Retained slots remain usable when their catalog entry has been removed.
                        5
                    }
                } ?: 5,
            )
        }
        return catalog.operator(current.gameSnapshot, id)
    }

    internal fun projectPools(pools: List<RecruitmentPool>, game: String? = null): List<RecruitmentPool> = catalog.projectPools(pools, game)
    internal fun projectEvents(events: List<RecruitmentEvent>): List<RecruitmentEvent> = catalog.projectEvents(events)
    internal fun poolStates(pools: List<RecruitmentPool>): Map<String, String> = catalog.poolStates(pools)

    private fun pool(current: RecruitmentArchive, id: String) =
        current.pools.firstOrNull { it.poolId == id } ?: throw recruitmentNotFound("pool")
    private fun replacePool(current: RecruitmentArchive, next: RecruitmentPool) = current.copy(
        pools = current.pools.map {
            if (it.poolId ==
                next.poolId
            ) {
                next
            } else {
                it
            }
        },
    )
    private fun liveEvent(current: RecruitmentArchive, id: String) =
        store.event(current.userId, current.accountId, id)?.takeIf { it.deletedAt == null } ?: throw recruitmentNotFound("event")
    private fun liveBatch(current: RecruitmentArchive, id: String) =
        store.batch(current.userId, current.accountId, id)?.takeIf { it.deletedAt == null } ?: throw recruitmentNotFound("batch")
    private fun extract(current: RecruitmentArchive, requested: Boolean, count: Long): RecruitmentArchive {
        if (!requested) return current
        if (count <= 0 || current.baseline < count) throw recruitmentInvalid("历史基准余额不足，无法拆出这次已知抽数")
        return current.copy(baseline = current.baseline - count)
    }
    private fun validateMode(mode: String, extract: Boolean) {
        if (mode !in setOf("current", "historical") ||
            mode == "current" && extract
        ) {
            throw recruitmentInvalid("请选择当前出货或历史补录；只有历史补录可从基准拆出")
        }
    }
    private inline fun <reified T> read(data: JsonNode): T = decoder.read(data, T::class.java)
    private fun validId(id: String) =
        id.takeIf { Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$").matches(it) } ?: throw recruitmentInvalid("记录ID格式不正确")
    private fun newId(prefix: String) = prefix + UUID.randomUUID().toString()
    private fun scoped(current: RecruitmentArchive, id: String) = "${current.userId}:${current.accountId}:$id"
    private fun conflictId(kind: String) =
        RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_${kind}_id_conflict", "该记录ID已存在（$kind）")
}

data class RecruitmentMutationResult(val archive: RecruitmentArchive, val response: RecruitmentCommandResponse)
