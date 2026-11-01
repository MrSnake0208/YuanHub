package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeBatch
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeDocument
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeEvent
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRecordImportDocument
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRequestDecoder
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentPool
import java.time.Instant

internal const val RECRUITMENT_RECORD_IMPORT_SCHEMA = "yuanhub.recruitment.import.v1"
private val RECORD_UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

/** Resolve user facts against the target directory; never accept backup state in record imports. */
internal class RecruitmentRecordImport(private val mapper: ObjectMapper, private val catalog: RecruitmentCatalog) {
    fun read(node: JsonNode, current: RecruitmentArchive): RecruitmentExchangeDocument {
        if (mapper.writeValueAsBytes(node).size > RECRUITMENT_EXCHANGE_MAX_BYTES) throw recruitmentInvalid("文件超过5MiB上限")
        val input = RecruitmentRequestDecoder(mapper).read(node, RecruitmentRecordImportDocument::class.java)
        if (input.schema != RECRUITMENT_RECORD_IMPORT_SCHEMA) throw recruitmentInvalid("不支持的记录导入格式")
        if (input.game != current.gameSnapshot) throw recruitmentInvalid("文件与当前账号必须属于同一游戏")
        if (input.events.size > 20_000 || input.batches.size > 20_000) throw recruitmentInvalid("记录或批次超过20000条上限")
        if (input.events.isEmpty() && input.batches.isEmpty()) throw recruitmentInvalid("文件中没有可导入的记录或批次")
        val ids = (input.events.map { it.catalogPoolId } + input.batches.map { it.catalogPoolId }).distinct()
        if (ids.size > 500) throw recruitmentInvalid("文件超过500个卡池上限")
        val usedIds = current.pools.map { it.poolId }.toMutableSet()
        val pools = ids.associateWith { catalogId ->
            if (!RECRUITMENT_EXCHANGE_ID.matches(catalogId)) throw recruitmentInvalid("公共卡池ID格式不正确")
            val snapshot = catalog.snapshot(input.game, catalogId, requireEnabled = false)
            if (catalog.findPool(input.game, catalogId)?.hidden != false) throw recruitmentInvalid("卡池已隐藏，不能导入新记录：${snapshot.name}")
            val existing = current.pools.filter { it.snapshot.catalogPoolId == catalogId }
            if (existing.size > 1) throw recruitmentInvalid("${snapshot.name}对应多个个人池，请使用完整备份明确归属")
            var id = existing.singleOrNull()?.poolId ?: "catalog:$catalogId"
            if (existing.isEmpty()) {
                var suffix = 0
                while (!usedIds.add(id)) id = "catalog:$catalogId:${++suffix}"
            }
            RecruitmentPool(id, snapshot, progress = null)
        }
        val operators = mutableMapOf<String, RecruitmentAgentSnapshot>()
        val events = input.events.mapIndexed { index, event ->
            try {
                uuid(event.eventId)
                event.batchId?.let(::uuid)
                val pool = pools.getValue(event.catalogPoolId)
                val slot = pool.snapshot.upAgents.firstOrNull { it.id == event.agentId }
                val agent = if (slot != null) {
                    val operator = slot.operatorId?.let { id -> operators.getOrPut(id) { catalog.operator(input.game, id) } }
                    RecruitmentAgentSnapshot(slot.id, slot.name, rarity = operator?.rarity ?: 5)
                } else {
                    operators.getOrPut(event.agentId) { catalog.operator(input.game, event.agentId) }
                }
                RecruitmentExchangeEvent(
                    event.eventId, pool.poolId, pool.snapshot, agent, event.pullSpan, index + 1L, event.upStatus,
                    event.acquiredDate, event.note, "external", event.batchId, Instant.EPOCH, Instant.EPOCH,
                )
            } catch (error: RecruitmentApiException) {
                throw recruitmentInvalid("第${index + 1}条记录：${error.message}")
            }
        }
        val batches = input.batches.map { batch ->
            uuid(batch.batchId)
            recruitmentCount(batch.totalPullCount, "total_pull_count", true)
            RecruitmentExchangeBatch(batch.batchId, pools.getValue(batch.catalogPoolId).poolId, batch.totalPullCount, Instant.EPOCH)
        }
        // Fixed intermediate clocks make preview/commit resolution comparable; persistence supplies actual clocks.
        return RecruitmentExchangeDocument(
            RECRUITMENT_EXCHANGE_SCHEMA, Instant.EPOCH, game = input.game, archiveRevision = 0, baseline = 0,
            currentPoolId = null, pools = pools.values.toList(), temporaryAgents = emptyList(), events = events, batches = batches,
        ).also { RecruitmentExchangeValidation(mapper).validate(it) }
    }

    private fun uuid(id: String) {
        if (!RECORD_UUID.matches(id)) throw recruitmentInvalid("记录和批次ID须为小写UUID；首次生成后请保留，勿使用evt_1等流水号")
    }
}
