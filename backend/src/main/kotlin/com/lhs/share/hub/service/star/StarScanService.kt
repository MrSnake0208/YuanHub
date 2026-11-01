package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.IntNode
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarScanApplyRequest
import com.lhs.share.hub.controller.star.request.StarScanReportRequest
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.controller.star.response.StarStateCommandResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarScanRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.StarScanRecord
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@Service
class StarScanService(
    private val records: StarScanRecordRepository,
    private val accounts: SubAccountService,
    private val accountRepository: SubAccountRepository,
    private val states: StarStateService,
    private val loadouts: StarLoadoutCurrentRepository,
    private val events: AccountEventService,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun account(userId: String, accountId: String): StarScanAccount {
        val account = accounts.requireAccount(userId, accountId)
        return StarScanAccount(account.accountId, account.name, account.game)
    }

    fun upload(userId: String, accountId: String, report: StarScanReportRequest): StarScanUploadResponse {
        val account = accounts.requireAccount(userId, accountId)
        validateReport(report)
        if (report.expectedAccountId != accountId || report.game != account.game) invalid("报告账号或游戏与连接码不一致")
        val frozen = mapper.writeValueAsString(report)
        fun existing(): StarScanUploadResponse? = records.findByUserIdAndAccountIdAndRecordId(userId, accountId, report.recordId)?.let {
            if (mapper.readTree(it.report) != mapper.readTree(frozen)) conflict("同批次已上传不同内容")
            StarScanUploadResponse(it.recordId, status(it))
        }
        existing()?.let { return it }
        return try {
            checkNotNull(
                transactions.execute {
                    if (!accountRepository.fenceRecruitmentWrite(userId, accountId, account.game)) conflict("账号已变化，请重新读取")
                    existing()?.let { return@execute it }
                    if (records.countByUserIdAndAccountIdAndAppliedAtIsNull(userId, accountId) >= 20) {
                        throw InventoryApiException(HttpStatus.TOO_MANY_REQUESTS, "star_scan_pending_limit", "请先处理已有的星石待核对报告")
                    }
                    records.insert(StarScanRecord("$userId:$accountId:${report.recordId}", userId, accountId, report.recordId, frozen))
                    events.publishChange(userId, accountId, "star_scan_ready", mapOf("record_id" to report.recordId))
                    StarScanUploadResponse(report.recordId, "needs_review")
                },
            )
        } catch (_: DuplicateKeyException) {
            existing() ?: conflict("本批次正在保存，请重试")
        }
    }

    fun pending(userId: String, accountId: String): List<StarScanSummary> {
        accounts.requireAccount(userId, accountId)
        return records.findTop20ByUserIdAndAccountIdAndAppliedAtIsNullOrderByCreatedAtDesc(userId, accountId).map {
            val report = mapper.readValue(it.report, StarScanReportRequest::class.java)
            StarScanSummary(it.recordId, report.capturedAt!!, report.entries.size, report.game)
        }
    }

    fun review(userId: String, accountId: String, recordId: String): StarScanReview = checkNotNull(
        transactions.execute {
            accounts.requireAccount(userId, accountId)
            val record = requireRecord(userId, accountId, recordId)
            val current = states.current(userId, accountId)
            val loadout = loadouts.findByUserIdAndAccountId(userId, accountId)
            StarScanReview(
                mapper.readValue(record.report, StarScanReportRequest::class.java),
                current,
                loadout?.revision ?: 0,
                loadout?.loadouts.orEmpty().flatMap { operator ->
                    operator.slots.values().mapNotNull { (slot, id) -> id?.let { StarScanAssignment(it, operator.operatorId, slot) } }
                },
                status(record),
            )
        },
    )

    fun apply(userId: String, accountId: String, recordId: String, request: StarScanApplyRequest): StarStateCommandResponse {
        accounts.requireAccount(userId, accountId)
        val identity = mapper.writeValueAsString(request.copy(entries = request.entries.sortedBy { it.observationId }))
        return starCasConflictBoundary({ conflict("数据已变化，请重新打开报告核对") }) {
            checkNotNull(
                transactions.execute {
                    val record = requireRecord(userId, accountId, recordId)
                    if (record.receipt != null) {
                        if (mapper.readTree(record.appliedRequest) != mapper.readTree(identity)) conflict("本报告已按另一份核对结果导入")
                        return@execute mapper.readValue(record.receipt, StarStateCommandResponse::class.java)
                    }
                    if (record.appliedAt != null) conflict("本报告已放弃，请重新采集")
                    val report = mapper.readValue(record.report, StarScanReportRequest::class.java)
                    val account = accounts.requireAccount(userId, accountId)
                    if (account.game != report.game || !accountRepository.fenceRecruitmentWrite(userId, accountId, report.game)) {
                        conflict("账号游戏已变化，请重新采集")
                    }
                    val current = states.current(userId, accountId)
                    val patch = buildPatch(report, current, request)
                    val receipt = states.patch(userId, accountId, patch, request.expectedLoadoutRevision, "import_data_safety")
                    records.save(
                        record.copy(appliedRequest = identity, receipt = mapper.writeValueAsString(receipt), appliedAt = Instant.now()),
                    )
                    events.publishChange(userId, accountId, "star_scan_applied", mapOf("record_id" to recordId))
                    receipt
                },
            )
        }
    }

    fun discard(userId: String, accountId: String, recordId: String) {
        val account = accounts.requireAccount(userId, accountId)
        // Keep the frozen report as a retry tombstone; discarding never edits StarState.
        starCasConflictBoundary({ conflict("报告状态已变化，请刷新") }) {
            transactions.executeWithoutResult {
                if (!accountRepository.fenceRecruitmentWrite(userId, accountId, account.game)) conflict("账号已变化，请刷新")
                val record = requireRecord(userId, accountId, recordId)
                if (record.appliedAt == null) records.save(record.copy(appliedAt = Instant.now()))
            }
        }
    }

    private fun requireRecord(userId: String, accountId: String, recordId: String): StarScanRecord =
        records.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId)
            ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "star_scan_not_found", "星石扫描报告不存在")

    companion object {
        private fun status(record: StarScanRecord) = when {
            record.receipt != null -> "applied"
            record.appliedAt != null -> "discarded"
            else -> "needs_review"
        }
        private val ID = Regex("^[A-Za-z0-9_-]{1,128}$")

        // Same canonical catalog as YuanHub src/data/starCatalog.js (YuanStar data/star_catalog.json).
        val MAIN_NAMES = "天府 武曲 天相 太阳 巨门 七杀 破军 贪狼 紫微 天同 太阴 天机 天梁 廉贞".split(" ").toSet()
        val SUPPORT_NAMES = "解神 文曲 擎羊 天钺 右弼 天马 天魁 左辅 三台 阴煞 天巫 文昌 红鸾 地劫 禄存 天刑 陀螺 铃星 天姚 地空 火星 八座 恩光 天贵".split(" ").toSet()
        private val QUALITIES = setOf("orange", "purple", "blue", "green", "white")

        fun validateReport(report: StarScanReportRequest) {
            if (report.format != "myshare-star-scan" || report.version != 1 || !ID.matches(report.recordId)) invalid("扫描报告格式或批次无效")
            if (report.expectedAccountId.isBlank() || report.capturedAt == null ||
                report.game !in setOf("如鸢", "代号鸢")
            ) {
                invalid("扫描报告缺少账号、游戏或时间")
            }
            if (report.width != 720 || report.height != 1280 || report.dpi != 320) invalid("星石扫描仅支持720×1280、DPI320")
            if (report.sections.keys != setOf("main", "support", "experience") || report.sections.values.any { !it }) invalid("需要完整的三段采集")
            if (report.entries.size > 1000 ||
                report.entries.map { it.observationId }.toSet().size != report.entries.size
            ) {
                invalid("观察条目数量或编号无效")
            }
            report.entries.forEach {
                if (!ID.matches(it.observationId) || it.kind !in setOf("main", "support")) invalid("观察编号或星石分类无效")
                if (it.name != null && it.name !in names(it.kind)) invalid("星石名称不在目录中")
                if (it.quality != null && it.quality !in QUALITIES || it.level != null && it.level !in 1..60) invalid("星石品质或等级无效")
                if (it.source.length > 128 || it.rawText.length > 256) invalid("识别诊断过长")
            }
            if (report.warnings.size > 100 || report.warnings.any { it.length > 256 }) invalid("识别提示过多")
            validateCounts(report.experience, report.bag)
        }

        fun buildPatch(
            report: StarScanReportRequest,
            current: StarStateCurrentResponse,
            request: StarScanApplyRequest,
        ): StarStatePatchRequest {
            if (request.expectedGeneration != current.generation || request.expectedRevision != current.revision ||
                request.expectedLoadoutRevision == null || request.expectedLoadoutRevision < 0
            ) {
                conflict("背包版本已变化，请重新打开报告核对")
            }
            if (request.entries.size > 1000) invalid("星石数量超过限制")
            validateCounts(request.experience, request.bag)
            val observations = report.entries.associateBy { it.observationId }
            val old = current.inventory.associateBy { it.instanceId }
            val seen = HashSet<String>()
            val retained = HashSet<String>()
            val entries = request.entries.map { selected ->
                val observed = observations[selected.observationId] ?: invalid("核对结果引用了不存在的观察")
                if (!seen.add(selected.observationId) || selected.kind != observed.kind) invalid("观察重复或分类不符")
                if (selected.name !in names(selected.kind) || selected.quality !in QUALITIES ||
                    selected.level == null
                ) {
                    invalid("请补全合法的名称、品质和等级")
                }
                val allowed = try {
                    StarBreakthroughRules.allowed(selected.level, selected.quality)
                } catch (
                    _: IllegalArgumentException,
                ) {
                    invalid("等级超过品质上限")
                }
                val previous = selected.existingInstanceId?.let { id ->
                    if (!retained.add(id)) invalid("同一旧星石不能对应多条观察")
                    val value = old[id] ?: conflict("对应的旧星石已不存在")
                    if (value.kind != selected.kind || value.name != selected.name ||
                        value.quality != selected.quality
                    ) {
                        invalid("旧实例必须具有相同分类、名称和品质")
                    }
                    value
                }
                val stage =
                    previous?.breakthroughStage?.takeIf { it in allowed }
                        ?: StarBreakthroughRules.inferred(selected.level, selected.quality)
                StarInventoryEntryRequest(
                    previous?.instanceId ?: "scan-${UUID.randomUUID()}",
                    selected.kind,
                    selected.name,
                    selected.quality,
                    selected.level,
                    stage?.let(IntNode::valueOf),
                )
            }
            if (old.keys.any { it !in retained } && !request.confirmRemovals) invalid("请明确确认移除未对应的旧星石及其关联")
            val levels = entries.associate { it.instanceId to it.level!! }
            val targets = current.planTargets.filter { (id, target) -> levels[id]?.let { it <= target } == true }
            // Unknown scan values preserve existing observations; explicit zero is a measured zero.
            val experience = StarWorkspaceExperienceRequest(
                request.experience.orange ?: current.experience.orange,
                request.experience.purple ?: current.experience.purple,
                request.experience.white ?: current.experience.white,
            )
            val bag = StarWorkspaceBagRequest(
                request.bag.currentCount ?: current.bag.currentCount,
                request.bag.capacity ?: current.bag.capacity,
            )
            return StarStatePatchRequest(request.expectedGeneration, request.expectedRevision, entries, targets, experience, bag)
        }

        private fun names(kind: String) = if (kind == "main") MAIN_NAMES else SUPPORT_NAMES
        private fun validateCounts(experience: StarWorkspaceExperienceRequest, bag: StarWorkspaceBagRequest) {
            if (listOf(experience.orange, experience.purple, experience.white, bag.currentCount).any { it != null && it < 0 } ||
                bag.capacity != null && bag.capacity < 1 ||
                bag.currentCount != null && bag.capacity != null && bag.currentCount > bag.capacity
            ) {
                invalid("背包和经验星曜数量无效")
            }
        }
        private fun invalid(message: String): Nothing =
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_scan_invalid", message)
        private fun conflict(message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "star_scan_conflict", message)
    }
}

data class StarScanAccount(val accountId: String, val name: String, val game: String)
data class StarScanUploadResponse(val recordId: String, val status: String)
data class StarScanSummary(val recordId: String, val capturedAt: Instant, val entryCount: Int, val game: String)
data class StarScanAssignment(val instanceId: String, val operatorId: String, val slot: String)
data class StarScanReview(
    val report: StarScanReportRequest,
    val state: StarStateCurrentResponse,
    val loadoutRevision: Long,
    val assignments: List<StarScanAssignment>,
    val status: String,
)
