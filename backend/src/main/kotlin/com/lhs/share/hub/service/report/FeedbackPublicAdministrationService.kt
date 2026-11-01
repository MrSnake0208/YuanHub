package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.request.FeedbackMergeRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublicStatusRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublishRequest
import com.lhs.share.hub.controller.report.request.FeedbackTypeUpdateRequest
import com.lhs.share.hub.controller.report.request.FeedbackVersionRequest
import com.lhs.share.hub.controller.report.response.FeedbackVersionOptionResponse
import com.lhs.share.hub.repository.ChangelogEntryRepository
import com.lhs.share.hub.repository.FeedbackSupportRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.FeedbackSupport
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.notification.NotificationService
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom
import java.time.Instant

/**
 * 反馈公开管理服务:发布 / 取消公开 / 修改公开状态 / 合并重复反馈。
 *
 * 所有写入按当前工单运营负责人授权。公开字段使用定向 update，合并在 Mongo 事务中完成。
 */
@Service
class FeedbackPublicAdministrationService(
    private val ticketRepository: FeedbackTicketRepository,
    private val queryRepository: FeedbackTicketQueryRepository,
    private val supportRepository: FeedbackSupportRepository,
    private val changelogEntryRepository: ChangelogEntryRepository,
    private val accessService: FeedbackAccessService,
    private val notificationService: NotificationService,
) {
    private val random = SecureRandom()

    /** 发布到反馈广场;首次发布记录 publishedAt。 */
    fun publish(adminUserId: String, ticketId: String, request: FeedbackPublishRequest): FeedbackTicket {
        val ticket = requireTicket(ticketId)
        requireManage(adminUserId, ticket)
        requireIndependent(ticket)
        if (FeedbackType.isReport(ticket.type, ticket.category)) {
            throw ApiResultException(403, "举报工单不能发布到反馈广场")
        }
        if (!ticket.publicConsent) {
            throw ApiResultException(403, "用户未授权发布到反馈广场")
        }
        val title = request.publicTitle.trim()
        if (title.isEmpty()) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "公开标题不能为空")
        }
        val summary = request.publicSummary?.trim()?.takeIf { it.isNotEmpty() }
        val status = PublicFeedbackStatus.normalizeOrNull(request.publicStatus) ?: PublicFeedbackStatus.COLLECTING
        val now = Instant.now()
        return queryRepository.setPublicInfo(
            ticketId = ticketId,
            visibility = FeedbackVisibility.PUBLIC,
            publicTitle = title,
            publicSummary = summary,
            publicStatus = status,
            publishedAt = ticket.publishedAt ?: now,
            publicUpdatedAt = now,
            completedAt = if (status == PublicFeedbackStatus.COMPLETED) ticket.completedAt ?: now else null,
        ) ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    /** 取消公开;保留 FeedbackSupport 与已填写的公开字段,便于再次公开时恢复。 */
    fun unpublish(adminUserId: String, ticketId: String): FeedbackTicket {
        val ticket = requireTicket(ticketId)
        requireManage(adminUserId, ticket)
        requireIndependent(ticket)
        val now = Instant.now()
        return queryRepository.setPublicInfo(
            ticketId = ticketId,
            visibility = FeedbackVisibility.PRIVATE,
            publicTitle = ticket.publicTitle,
            publicSummary = ticket.publicSummary,
            publicStatus = ticket.publicStatus,
            publishedAt = ticket.publishedAt,
            publicUpdatedAt = now,
            completedAt = ticket.completedAt,
        ) ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    /** 修改公开开发状态;进入 COMPLETED 时记录 completedAt,离开时清空。 */
    fun updatePublicStatus(adminUserId: String, ticketId: String, request: FeedbackPublicStatusRequest): FeedbackTicket {
        val ticket = requireTicket(ticketId)
        requireManage(adminUserId, ticket)
        requireIndependent(ticket)
        if (!FeedbackVisibility.isPublic(ticket.visibility)) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "只有已公开的反馈可以修改公开状态")
        }
        val status = PublicFeedbackStatus.normalizeOrNull(request.publicStatus)
            ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "公开状态不能为空")
        val now = Instant.now()
        val completedAt = if (status == PublicFeedbackStatus.COMPLETED) ticket.completedAt ?: now else null
        return queryRepository.setPublicStatus(
            ticketId = ticketId,
            publicStatus = status,
            publicUpdatedAt = now,
            completedAt = completedAt,
        ) ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    /**
     * 合并重复反馈:把 [sourceId] 合并到 [FeedbackMergeRequest.targetFeedbackId] 的最终主反馈。
     *
     * 只写 source.mergedIntoId,源记录继续存在;禁止自合并、循环合并与把公开反馈并入未公开反馈。
     */
    @Transactional(transactionManager = "hubTransactionManager")
    fun merge(adminUserId: String, sourceId: String, request: FeedbackMergeRequest): FeedbackTicket {
        val source = requireTicket(sourceId)
        requireManage(adminUserId, source)
        requireIndependent(source)
        if (source.status != "OPEN" || source.mergedCount != 0) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "来源必须是尚无子反馈的活动工单")
        }
        val targetId = request.targetFeedbackId.trim()
        if (targetId == sourceId) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "不能把反馈合并到自身")
        }
        val target = requireTicket(targetId)
        if (FeedbackSpaces.id(source) != FeedbackSpaces.id(target)) throw ApiResultException(400, "不能跨专区合并反馈")
        requireManage(adminUserId, target)
        if (!FeedbackWorkflow.isActive(target) || FeedbackWorkflow.area(source) != FeedbackWorkflow.area(target)) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "目标必须是同负责板块的未合并活动工单")
        }
        if (FeedbackVisibility.isPublic(source.visibility) && !FeedbackVisibility.isPublic(target.visibility)) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "公开反馈不能合并到未公开反馈")
        }
        if (FeedbackType.isReport(source.type, source.category) != FeedbackType.isReport(target.type, target.category)) {
            throw ApiResultException(403, "举报与普通工单不能相互合并")
        }
        val updated = queryRepository.setMergedInto(sourceId, targetId)
            ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "来源已变化，请刷新后重试")
        queryRepository.incrementMergedCount(targetId)
            ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "目标已变化，请刷新后重试")
        autoSupport(target, source.reporterUserId)
        notificationService.clearFeedbackTasks(sourceId)
        return updated
    }

    /** 修改反馈类型;影响反馈广场的类型筛选。 */
    fun updateType(adminUserId: String, ticketId: String, request: FeedbackTypeUpdateRequest): FeedbackTicket {
        val ticket = requireTicket(ticketId)
        requireManage(adminUserId, ticket)
        requireIndependent(ticket)
        val type = request.type.trim().uppercase()
        if (FeedbackType.isReport(ticket.type, ticket.category) ||
            (type == FeedbackType.REPORT && FeedbackVisibility.isPublic(ticket.visibility))
        ) {
            throw ApiResultException(403, "不能通过修改类型改变举报工单的隐私边界")
        }
        if (type !in FeedbackType.all) {
            throw ApiResultException(
                HttpStatus.BAD_REQUEST.value(),
                "无效的反馈类型: ${request.type}, 可选: ${FeedbackType.all}",
            )
        }
        return queryRepository.setType(ticketId, type)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    /**
     * 关联/清除目标版本与完成版本。
     *
     * 版本使用更新日志条目 id;完成版本必须是已发布版本,目标版本允许草稿。
     * label 取更新日志版本标签作为展示快照。
     */
    fun updateVersions(adminUserId: String, ticketId: String, request: FeedbackVersionRequest): FeedbackTicket {
        val ticket = requireTicket(ticketId)
        requireManage(adminUserId, ticket)
        requireIndependent(ticket)
        if (FeedbackSpaces.id(ticket) != FeedbackSpaces.DEFAULT &&
            (request.targetVersionId != null || request.completedVersionId != null)
        ) {
            throw ApiResultException(400, "合作专区不能关联 YuanHub 主站版本")
        }
        val target = resolveVersion(request.targetVersionId, requirePublished = false)
        val completed = resolveVersion(request.completedVersionId, requirePublished = true)
        return queryRepository.setVersions(
            ticketId = ticketId,
            targetVersionId = target?.first,
            targetVersionLabel = target?.second,
            completedVersionId = completed?.first,
            completedVersionLabel = completed?.second,
        ) ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    /**
     * 返回反馈管理工作台可关联的产品版本。
     *
     * 反馈管理员不需要额外拥有 changelog:write / changelog:review 权限；
     * 这里只暴露版本标签，不返回草稿正文。无任何反馈管理范围时拒绝访问。
     */
    fun versionOptions(adminUserId: String, spaceId: String = FeedbackSpaces.DEFAULT): List<FeedbackVersionOptionResponse> {
        accessService.querySpaces(adminUserId, spaceId)
        if (spaceId != FeedbackSpaces.DEFAULT) return emptyList()
        if (accessService.operatorAreas(adminUserId).isEmpty()) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有反馈管理权限")
        }
        return changelogEntryRepository.findAll()
            .mapNotNull { entry ->
                val published = entry.publishedRevision?.takeIf { entry.withdrawnAt == null }
                val label = published?.versionLabel ?: entry.workingRevision?.versionLabel
                label?.trim()?.takeIf { it.isNotEmpty() }?.let {
                    entry.updatedAt to
                        FeedbackVersionOptionResponse(
                            id = entry.id,
                            versionLabel = it,
                            published = published != null,
                        )
                }
            }
            .sortedByDescending { it.first }
            .map { it.second }
    }

    private fun resolveVersion(versionId: String?, requirePublished: Boolean): Pair<String, String>? {
        val id = versionId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val entry = changelogEntryRepository.findById(id).orElseThrow {
            ApiResultException(HttpStatus.BAD_REQUEST.value(), "版本不存在: $id")
        }
        val published = entry.publishedRevision?.takeIf { entry.withdrawnAt == null }
        if (requirePublished && published == null) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "完成版本必须是已发布的更新日志")
        }
        val label = published?.versionLabel ?: entry.workingRevision?.versionLabel
        if (label.isNullOrBlank()) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "版本缺少标签: $id")
        }
        return id to label
    }

    // ========== 内部方法 ==========

    /** 合并后若源提交人尚未支持主反馈,补一次支持;同一用户不重复计票。 */
    private fun autoSupport(root: FeedbackTicket, reporterUserId: String) {
        if (!FeedbackVisibility.isPublic(root.visibility) || FeedbackType.isReport(root.type, root.category)) return
        val rootId = checkNotNull(root.id)
        if (supportRepository.existsByFeedbackIdAndUserId(rootId, reporterUserId)) return
        try {
            supportRepository.save(FeedbackSupport(id = generateSupportId(), feedbackId = rootId, userId = reporterUserId))
            queryRepository.incrementSupportCount(rootId)
                ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "主反馈公开状态已变化，请刷新后重试")
        } catch (_: DuplicateKeyException) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "支持记录已变化，请刷新后重试")
        }
    }

    private fun requireTicket(ticketId: String): FeedbackTicket = ticketRepository.findById(ticketId).orElseThrow {
        ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
    }

    private fun requireManage(adminUserId: String, ticket: FeedbackTicket) {
        if (!accessService.canControlTicket(adminUserId, ticket)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "只有当前运营负责人可执行此操作")
        }
    }

    private fun requireIndependent(ticket: FeedbackTicket) {
        if (ticket.mergedIntoId != null) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "已合并来源不能独立处理")
        }
    }

    private fun generateSupportId(): String {
        val bytes = ByteArray(8)
        random.nextBytes(bytes)
        val digits = "0123456789abcdef"
        val hex = bytes.joinToString("") { b ->
            val v = b.toInt() and 0xFF
            "" + digits[v shr 4] + digits[v and 0x0F]
        }
        return "sup_" + hex
    }
}
