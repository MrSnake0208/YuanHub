package com.lhs.share.hub.service.report

import com.lhs.share.common.utils.IpUtil
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.request.FeedbackMessageAppendRequest
import com.lhs.share.hub.controller.report.request.FeedbackReportCreateRequest
import com.lhs.share.hub.controller.report.request.FeedbackStatusUpdateRequest
import com.lhs.share.hub.controller.report.response.FeedbackMessageResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportListItem
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.FeedbackWorkflowEventRepository
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.FeedbackClientInfo
import com.lhs.share.hub.repository.entity.FeedbackDiagnostics
import com.lhs.share.hub.repository.entity.FeedbackMessage
import com.lhs.share.hub.repository.entity.FeedbackMessageFile
import com.lhs.share.hub.repository.entity.FeedbackMessageImage
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.repository.entity.effectiveKind
import com.lhs.share.hub.service.HubUserInfoService
import com.lhs.share.hub.service.notification.NotificationService
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import java.security.SecureRandom
import java.time.Instant

/**
 * 反馈工单服务
 *
 * 处理反馈工单的创建、列表、详情、追加消息、状态变更等业务逻辑。
 */
@Service
class FeedbackReportService(
    private val feedbackTicketRepository: FeedbackTicketRepository,
    private val feedbackTicketQueryRepository: FeedbackTicketQueryRepository,
    private val feedbackAccessService: FeedbackAccessService,
    private val mediaAssetRepository: MediaAssetRepository,
    private val notificationService: NotificationService,
    private val hubUserInfoService: HubUserInfoService,
    private val properties: ShareProperties,
    private val workflowEvents: FeedbackWorkflowEventRepository,
    private val categories: FeedbackCategoryService,
) {
    private val log = KotlinLogging.logger { }
    private val random = SecureRandom()

    private data class NormalizedFields(
        val type: String,
        val category: String,
    )

    private data class ReporterMessageBoundary(
        val id: String?,
        val createdAt: Instant,
        val index: Int,
    )

    private enum class ActorMode {
        REPORTER,
        ADMIN,
    }

    companion object {
        /** 允许的状态 */
        private val VALID_STATUSES = setOf("OPEN", "RESOLVED", "DISMISSED")

        /** 管理员回复前，提交人最多连续补充的消息数。 */
        private const val PENDING_LIMIT = 3

        /** 消息中最多附件数 */
        private const val MAX_MEDIA_PER_MESSAGE = 10

        /** 管理员可设的状态 */
        private val ADMIN_ALLOWED_STATUSES = setOf("OPEN", "RESOLVED", "DISMISSED")

        /** 提交人可设的状态(只能关闭自己的 OPEN) */
        private val REPORTER_ALLOWED_STATUSES = setOf("RESOLVED")
    }

    private fun validateArea(area: String): String {
        return try {
            categories.requireValid(area)
        } catch (e: IllegalArgumentException) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), e.message)
        }
    }

    /**
     * 解析新格式 type/category，并兼容第一版的 type/category/area 组合。
     * 新格式的 category 是板块，旧格式的 category 是反馈性质。
     */
    private fun normalizeCreateFields(request: FeedbackReportCreateRequest): NormalizedFields {
        val type = request.type.trim().uppercase()
        val rawCategory = request.category?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
        val legacyArea = request.area?.let(::validateArea)

        if (type == FeedbackType.LEGACY_FEEDBACK) {
            val legacyType = rawCategory?.takeIf { it in FeedbackType.all }
            val category = legacyArea
                ?: rawCategory?.takeIf { it in categories.keys() }
                ?: FeedbackArea.OTHER
            return NormalizedFields(legacyType ?: FeedbackType.LEGACY_FEEDBACK, category)
        }
        if (type !in FeedbackType.all) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的工单类型: ${request.type}, 可选: ${FeedbackType.all}")
        }

        val category = when {
            rawCategory == null -> legacyArea ?: if (type == FeedbackType.REPORT) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "REPORT 必须指定反馈板块")
            } else {
                FeedbackArea.OTHER
            }
            rawCategory in categories.keys() -> {
                if (legacyArea != null && legacyArea != rawCategory) {
                    throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "反馈板块参数冲突: category=$rawCategory, area=$legacyArea")
                }
                rawCategory
            }
            rawCategory == type && legacyArea != null -> legacyArea
            rawCategory in FeedbackType.all -> {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "反馈类型和板块参数冲突: type=$type, category=$rawCategory")
            }
            else -> {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的反馈板块: $rawCategory")
            }
        }
        return NormalizedFields(type, category)
    }

    private fun normalizeTypeFilter(type: String): String {
        val normalized = type.trim().uppercase()
        if (normalized !in FeedbackType.all && normalized != FeedbackType.LEGACY_FEEDBACK) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的工单类型: $type, 可选: ${FeedbackType.all}")
        }
        return normalized
    }

    private fun normalizeCategoryFilter(category: String?, area: String?): String? {
        val normalizedCategory = category?.let(::validateArea)
        val normalizedArea = area?.let(::validateArea)
        if (normalizedCategory != null && normalizedArea != null && normalizedCategory != normalizedArea) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "反馈板块参数冲突: category=$category, area=$area")
        }
        return normalizedCategory ?: normalizedArea
    }

    /** 从旧文档推导新 API 语义，保留无法推断的 FEEDBACK 类型。 */
    private fun normalizedTicketFields(ticket: FeedbackTicket): NormalizedFields {
        val rawType = ticket.type.trim().uppercase()
        val rawCategory = ticket.category?.trim()?.uppercase()
        val board = FeedbackWorkflow.area(ticket)
        val type = if (rawType == FeedbackType.LEGACY_FEEDBACK) {
            rawCategory?.takeIf { it in FeedbackType.all } ?: FeedbackType.LEGACY_FEEDBACK
        } else {
            rawType
        }
        return NormalizedFields(type, board)
    }

    /**
     * 创建反馈工单
     */
    fun create(userId: String, request: FeedbackReportCreateRequest): FeedbackReportResponse {
        val space = categories.requireSpace(request.spaceId, forSubmission = true)
        val fields = normalizeCreateFields(request)
        categories.requireInSpace(fields.category, space.id)
        val title = request.title?.trim()?.takeIf { it.isNotEmpty() }
        if (request.publicConsent && title == null) {
            throw ApiResultException(400, "允许发布到反馈广场时请填写标题")
        }

        // 校验 media_ids 归属
        val mediaAssets = validateMediaIds(userId, request.mediaIds, request.spaceId)

        // 生成工单 id
        val ticketId = generateId("rpt_")

        // 获取客户端信息
        val clientInfo = if (request.clientInfoConsent) {
            buildClientInfo()
        } else {
            null
        }

        // 应用诊断信息与 consent 无关:版本与 Build 始终记录。
        val diagnostics = buildDiagnostics(request)

        // 构建首条消息
        val firstMessage = FeedbackMessage(
            id = generateId("rpm_"),
            senderKind = "REPORTER",
            authorUserId = userId,
            content = request.content,
            images = mediaAssets.toMessageImages(),
            createdAt = Instant.now(),
            files = mediaAssets.toMessageFiles(),
        )

        val now = Instant.now()
        val ticket = FeedbackTicket(
            id = ticketId,
            spaceId = space.id,
            type = fields.type,
            category = fields.category,
            area = fields.category,
            status = "OPEN",
            workflowStage = FeedbackWorkflow.UNASSIGNED,
            workArea = fields.category,
            teamReadReporterIndex = -1,
            reporterUserId = userId,
            content = request.content,
            title = title,
            publicConsent = request.publicConsent,
            visibility = FeedbackVisibility.PRIVATE,
            clientInfoConsent = request.clientInfoConsent,
            clientInfo = clientInfo,
            diagnostics = diagnostics,
            messages = listOf(firstMessage),
            createdAt = now,
            updatedAt = now,
        )

        val saved = feedbackTicketRepository.save(ticket)
        log.info { "反馈工单创建成功: id=${saved.id}, userId=$userId, type=${fields.type}, category=${fields.category}" }
        notifyCategoryReceivers(saved)
        return toResponse(saved, userId)
    }

    /**
     * 查询反馈工单列表
     */
    fun list(
        currentUserId: String,
        page: Int,
        pageSize: Int,
        status: String?,
        type: String?,
        category: String?,
        area: String?,
        mine: Boolean,
        reporterUserId: String?,
        keyword: String?,
        sortBy: String,
        sortOrder: String,
        queue: String? = null,
        spaceId: String? = null,
    ): FeedbackReportListResponse = listInternal(
        currentUserId = currentUserId,
        page = page,
        pageSize = pageSize,
        status = status,
        type = type,
        category = category,
        area = area,
        mine = mine,
        reporterUserId = reporterUserId,
        keyword = keyword,
        sortBy = sortBy,
        sortOrder = sortOrder,
        queue = queue,
        allowedAreas = null,
        spaceId = spaceId,
    )

    fun listForAutomation(
        currentUserId: String,
        page: Int,
        pageSize: Int,
        status: String?,
        type: String?,
        category: String?,
        area: String?,
        reporterUserId: String?,
        keyword: String?,
        sortBy: String,
        sortOrder: String,
        queue: String? = null,
        allowedAreas: Set<String>? = null,
        spaceId: String = FeedbackSpaces.DEFAULT,
    ): FeedbackReportListResponse = listInternal(
        currentUserId = currentUserId,
        page = page,
        pageSize = pageSize,
        status = status,
        type = type,
        category = category,
        area = area,
        mine = false,
        reporterUserId = reporterUserId,
        keyword = keyword,
        sortBy = sortBy,
        sortOrder = sortOrder,
        queue = queue,
        allowedAreas = allowedAreas,
        spaceId = spaceId,
    )

    private fun listInternal(
        currentUserId: String,
        page: Int,
        pageSize: Int,
        status: String?,
        type: String?,
        category: String?,
        area: String?,
        mine: Boolean,
        reporterUserId: String?,
        keyword: String?,
        sortBy: String,
        sortOrder: String,
        queue: String? = null,
        allowedAreas: Set<String>? = null,
        spaceId: String? = null,
    ): FeedbackReportListResponse {
        if (page < 1) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "page 必须大于等于 1")
        }
        if (pageSize !in 1..100) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "pageSize 必须在 1..100 之间")
        }

        val normalizedStatus = status?.trim()?.uppercase()
        if (normalizedStatus != null && normalizedStatus !in VALID_STATUSES) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的状态: $status")
        }
        val normalizedType = type?.let(::normalizeTypeFilter)
        val normalizedCategory = if (mine) {
            normalizeCategoryFilter(category, area)
        } else {
            val selected = category ?: area
            selected?.trim()?.uppercase()?.also {
                if (it !in categories.keys()) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的反馈板块")
            }
        }
        if (!mine && queue != null && queue !in setOf("UNASSIGNED", "MINE", "NEEDS_REPLY", "DEV", "RETURNED", "CLOSED", "ALL")) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的工作队列")
        }
        if (sortBy !in setOf("createdAt", "updatedAt")) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "sortBy 只允许 createdAt 或 updatedAt")
        }
        if (!sortOrder.equals("asc", ignoreCase = true) && !sortOrder.equals("desc", ignoreCase = true)) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "sortOrder 只允许 asc 或 desc")
        }

        val spaceIds = if (mine) {
            if (spaceId == FeedbackSpaces.ALL || spaceId == null) null else setOf(categories.requireSpace(spaceId).id)
        } else {
            feedbackAccessService.querySpaces(currentUserId, spaceId)
        }
        val scopedKeys = categories.list().filter { spaceIds == null || it.spaceId in spaceIds }.mapTo(linkedSetOf()) { it.key }
        val normalizedAllowedAreas = allowedAreas?.mapTo(linkedSetOf()) { it.trim().uppercase() }
        val grantedAreas = feedbackAccessService.operatorAreas(currentUserId).let { current ->
            (normalizedAllowedAreas?.let(current::intersect) ?: current).intersect(scopedKeys)
        }
        val developerAreas = if (mine) {
            emptySet()
        } else {
            feedbackAccessService.developerAreas(currentUserId).let { current ->
                (normalizedAllowedAreas?.let(current::intersect) ?: current).intersect(scopedKeys)
            }
        }
        if (!mine && grantedAreas.isEmpty() && developerAreas.isEmpty()) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有任何反馈模块的管理权限")
        }
        if (!mine && normalizedCategory != null && normalizedCategory !in grantedAreas && normalizedCategory !in developerAreas) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有 $normalizedCategory 模块的管理权限")
        }

        val pageable = PageRequest.of(
            page - 1,
            pageSize,
            if (sortOrder.equals("asc", ignoreCase = true)) Sort.Direction.ASC else Sort.Direction.DESC,
            sortBy,
        )
        val resultPage = feedbackTicketQueryRepository.search(
            reporterUserId = if (mine) currentUserId else reporterUserId,
            manageableCategories = null,
            status = normalizedStatus,
            type = normalizedType,
            category = normalizedCategory,
            keyword = keyword,
            pageable = pageable,
            workAreas = if (mine) null else grantedAreas,
            queue = if (mine) null else queue ?: "ALL",
            actorUserId = currentUserId,
            developerAreas = developerAreas,
            knownAreas = categories.keys(),
            spaceIds = spaceIds,
        )
        val userDict = hubUserInfoService.getDict(
            resultPage.content.flatMap {
                listOfNotNull(it.reporterUserId, it.operatorAssigneeUserId)
            }.toSet(),
        )
        val items = resultPage.content.map { ticket ->
            val fields = normalizedTicketFields(ticket)
            val reporterBoundary = lastReporterMessageBoundary(ticket)
            FeedbackReportListItem(
                id = checkNotNull(ticket.id),
                spaceId = FeedbackSpaces.id(ticket),
                type = fields.type,
                category = fields.category,
                area = fields.category,
                status = ticket.status,
                workflowStage = if (mine) "UNASSIGNED" else FeedbackWorkflow.stage(ticket),
                workArea = if (mine) null else FeedbackWorkflow.area(ticket),
                operatorAssigneeUserId = if (mine) null else ticket.operatorAssigneeUserId,
                operatorAssigneeName = if (mine) null else ticket.operatorAssigneeUserId?.let { userDict[it]?.userName },
                mergedIntoId = ticket.mergedIntoId,
                mergedCount = ticket.mergedCount,
                teamUnread = !mine && ticket.status == "OPEN" && ticket.mergedIntoId == null &&
                    reporterBoundary != null && reporterBoundary.index > (ticket.teamReadReporterIndex ?: reporterBoundary.index),
                needsReply = !mine && FeedbackWorkflow.needsReply(ticket),
                content = ticket.content.take(100),
                hasAdminReply = ticket.hasAdminReply || ticket.messages.any { it.senderKind == "ADMIN" },
                lastMessageSender = ticket.lastMessageSender,
                lastReporterMessageId = reporterBoundary?.id,
                lastReporterMessageCreatedAt = reporterBoundary?.createdAt,
                lastReporterMessageIndex = reporterBoundary?.index,
                reporterUserId = ticket.reporterUserId,
                reporterName = userDict[ticket.reporterUserId]?.userName,
                createdAt = ticket.createdAt,
                updatedAt = ticket.updatedAt,
            )
        }
        return FeedbackReportListResponse(
            reports = items,
            total = resultPage.totalElements,
            page = page,
            pageSize = pageSize,
            mine = mine,
            sortBy = sortBy,
            sortOrder = sortOrder,
        )
    }

    /**
     * 获取工单详情
     */
    @Transactional(transactionManager = "hubTransactionManager")
    fun getById(currentUserId: String, ticketId: String, adminMode: Boolean = false): FeedbackReportResponse {
        val ticket = requireViewableTicket(currentUserId, ticketId)
        if (adminMode && !feedbackAccessService.canViewTicket(currentUserId, ticket)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有后台查看权限")
        }
        val showWorkflow = adminMode || ticket.reporterUserId != currentUserId
        val viewed = if (showWorkflow && feedbackAccessService.canViewTicket(currentUserId, ticket)) {
            val boundary = FeedbackWorkflow.lastReporterIndex(ticket)
            feedbackTicketQueryRepository.advanceTeamRead(ticketId, boundary)
                ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已变化，请刷新")
            if (boundary >= 0) notificationService.clearFeedbackReminders(ticketId, boundary)
            ticket.copy(teamReadReporterIndex = maxOf(ticket.teamReadReporterIndex ?: -1, boundary))
        } else {
            ticket
        }
        return toResponse(viewed, currentUserId, showWorkflow).copy(
            mergedSourceIds = if (showWorkflow && viewed.mergedCount > 0 && feedbackAccessService.canViewTicket(currentUserId, viewed)) {
                feedbackTicketRepository.findByMergedIntoId(ticketId).mapNotNull { it.id }
            } else {
                emptyList()
            },
        )
    }

    /**
     * Machine-facing admin read that intentionally does not advance the shared team-read cursor.
     *
     * Unlike [getById], this path never treats the token owner as a reporter: backend feedback
     * visibility is required even when the same user happened to submit the ticket.
     */
    fun getByIdForAutomation(currentUserId: String, ticketId: String, allowedAreas: Set<String>? = null): FeedbackReportResponse {
        val ticket = requireAutomationTicket(currentUserId, ticketId, allowedAreas)
        return toResponse(ticket, currentUserId, adminMode = true).copy(
            mergedSourceIds = if (ticket.mergedCount > 0) {
                feedbackTicketRepository.findByMergedIntoId(ticketId).mapNotNull { it.id }
            } else {
                emptyList()
            },
        )
    }

    /** 返回经过工单范围授权且仍可用的普通文件元数据。 */
    fun getAttachment(currentUserId: String, ticketId: String, mediaId: String): MediaAsset {
        val ticket = requireViewableTicket(currentUserId, ticketId)
        if (ticket.messages.none { message -> message.files.any { it.id == mediaId } || message.images.any { it.id == mediaId } }) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        val asset = mediaAssetRepository.findById(mediaId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        if (asset.deletedAt != null) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        return asset
    }

    /** Machine-facing private attachment lookup with strict backend-ticket authorization. */
    fun getAttachmentForAutomation(
        currentUserId: String,
        ticketId: String,
        mediaId: String,
        allowedAreas: Set<String>? = null,
    ): MediaAsset {
        val ticket = requireAutomationTicket(currentUserId, ticketId, allowedAreas)
        val referencedAsImage = ticket.messages.any { message -> message.images.any { it.id == mediaId } }
        val referencedAsFile = ticket.messages.any { message -> message.files.any { it.id == mediaId } }
        if (!referencedAsImage && !referencedAsFile) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        val asset = mediaAssetRepository.findById(mediaId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        val kindMatchesReference =
            (referencedAsImage && asset.effectiveKind() == MediaKind.IMAGE) ||
                (referencedAsFile && asset.effectiveKind() == MediaKind.FILE)
        if (asset.deletedAt != null || !kindMatchesReference) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "附件不存在")
        }
        return asset
    }

    /**
     * 追加消息
     */
    @Transactional(transactionManager = "hubTransactionManager")
    fun appendMessage(currentUserId: String, ticketId: String, request: FeedbackMessageAppendRequest): FeedbackReportResponse {
        val ticket = feedbackTicketRepository.findById(ticketId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
        }

        val isReporter = ticket.reporterUserId == currentUserId
        val fields = normalizedTicketFields(ticket)
        val isManager = feedbackAccessService.canControlTicket(currentUserId, ticket) ||
            (FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED && feedbackAccessService.canClaimTicket(currentUserId, ticket))
        val actorMode = resolveActorMode(request.actorMode, isReporter, isManager)

        // 仅 OPEN 工单可追加
        if (ticket.mergedIntoId != null) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "该反馈已合并至 ${ticket.mergedIntoId}，不能继续向来源追加消息")
        }
        if (ticket.status != "OPEN") {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "仅 OPEN 状态的工单可追加消息")
        }

        // 提交人补充受连续消息限制；模块管理员回复会重置计数。
        if (actorMode == ActorMode.REPORTER) {
            val pendingCount = countPendingMessagesAfterLastAdminReply(ticket)
            if (pendingCount >= PENDING_LIMIT) {
                throw ApiResultException(
                    HttpStatus.BAD_REQUEST.value(),
                    "连续补充已达上限($PENDING_LIMIT 条), 请等待管理员回复后继续补充",
                )
            }
        }

        // 校验 media_ids 归属
        val mediaAssets = validateMediaIds(currentUserId, request.mediaIds, FeedbackSpaces.id(ticket))

        // 构建消息
        val senderKind = actorMode.name
        val message = FeedbackMessage(
            id = generateId("rpm_"),
            senderKind = senderKind,
            authorUserId = currentUserId,
            content = request.content,
            images = mediaAssets.toMessageImages(),
            createdAt = Instant.now(),
            files = mediaAssets.toMessageFiles(),
        )

        val now = Instant.now()
        val updatedMessages = ticket.messages + message
        val updatedTicket = ticket.copy(
            messages = updatedMessages,
            lastMessageSender = senderKind,
            updatedAt = now,
            hasAdminReply = if (senderKind == "ADMIN") true else ticket.hasAdminReply,
            adminReply = if (senderKind == "ADMIN") request.content.take(200) else ticket.adminReply,
            workflowStage = if (senderKind == "ADMIN" &&
                FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED
            ) {
                FeedbackWorkflow.PROCESSING
            } else {
                ticket.workflowStage
            },
            operatorAssigneeUserId = if (senderKind == "ADMIN" &&
                FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED
            ) {
                currentUserId
            } else {
                ticket.operatorAssigneeUserId
            },
            operatorAssignedAt = if (senderKind == "ADMIN" &&
                FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED
            ) {
                now
            } else {
                ticket.operatorAssignedAt
            },
            teamReadReporterIndex = if (senderKind == "ADMIN") {
                FeedbackWorkflow.lastReporterIndex(ticket)
            } else {
                ticket.teamReadReporterIndex ?: FeedbackWorkflow.lastReporterIndex(ticket)
            },
        )

        val saved = feedbackTicketQueryRepository.saveIfUnchanged(ticket, updatedTicket)
            ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已更新，请重新打开详情后重试")
        log.info { "反馈工单消息追加: ticketId=$ticketId, sender=$senderKind" }

        // 提交人追加后, 给有该模块管理权限的管理员逐个生成通知
        if (actorMode == ActorMode.REPORTER) {
            (
                if (FeedbackWorkflow.stage(saved) ==
                    FeedbackWorkflow.UNASSIGNED
                ) {
                    feedbackAccessService.operatorUserIds(FeedbackWorkflow.area(saved))
                } else {
                    setOfNotNull(saved.operatorAssigneeUserId) +
                        (
                            if (FeedbackWorkflow.stage(saved) ==
                                FeedbackWorkflow.DEV_HANDOFF
                            ) {
                                feedbackAccessService.developerUserIds(FeedbackWorkflow.area(saved))
                            } else {
                                emptySet()
                            }
                            )
                }
                )
                .filter { it != currentUserId }
                .forEach { managerId ->
                    notificationService.create(
                        userId = managerId,
                        kind = "FEEDBACK_MESSAGE_FROM_REPORTER",
                        title = "反馈有新的用户追加消息",
                        body = "用户追加了反馈消息: \"${request.content.take(100)}\"",
                        refType = "FEEDBACK",
                        refId = ticketId,
                        messageIndex = FeedbackWorkflow.lastReporterIndex(saved),
                    )
                }
        }

        // 管理员回复后, 给提交人生成通知, 包括管理员与提交人为同一账号的场景
        if (actorMode == ActorMode.ADMIN) {
            notificationService.clearFeedbackReminders(ticketId, FeedbackWorkflow.lastReporterIndex(ticket))
            notificationService.create(
                userId = ticket.reporterUserId,
                kind = "FEEDBACK_REPLY",
                title = "你的反馈有新回复",
                body = "管理员回复了你的反馈: \"${request.content.take(100)}\"",
                refType = "FEEDBACK",
                refId = ticketId,
            )
        }

        return toResponse(saved, currentUserId, actorMode == ActorMode.ADMIN)
    }

    /**
     * 更新工单状态
     */
    @Transactional(transactionManager = "hubTransactionManager")
    fun updateStatus(currentUserId: String, ticketId: String, request: FeedbackStatusUpdateRequest): FeedbackReportResponse {
        val ticket = feedbackTicketRepository.findById(ticketId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
        }

        val isReporter = ticket.reporterUserId == currentUserId
        val fields = normalizedTicketFields(ticket)
        val isManager = feedbackAccessService.canControlTicket(currentUserId, ticket) ||
            (FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED && feedbackAccessService.canClaimTicket(currentUserId, ticket))
        val actorMode = resolveActorMode(request.actorMode, isReporter, isManager)
        if (ticket.mergedIntoId != null) throw ApiResultException(HttpStatus.CONFLICT.value(), "已合并来源不能独立处理")

        val newStatus = request.status.trim().uppercase()
        if (newStatus !in VALID_STATUSES) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的状态: $newStatus")
        }

        // 权限校验状态变更
        if (actorMode == ActorMode.ADMIN) {
            if (newStatus !in ADMIN_ALLOWED_STATUSES) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "管理员不允许设置状态: $newStatus")
            }
            if (newStatus == "RESOLVED" && FeedbackWorkflow.stage(ticket) != FeedbackWorkflow.PROCESSING) {
                throw ApiResultException(HttpStatus.CONFLICT.value(), "只有处理中工单可标记完成")
            }
            if (newStatus == "DISMISSED" && FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.DEV_HANDOFF) {
                throw ApiResultException(HttpStatus.CONFLICT.value(), "请先撤回程序交接")
            }
            if (newStatus == "DISMISSED" && FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED &&
                request.reason.isNullOrBlank()
            ) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "未接单工单驳回须填写原因")
            }
        } else {
            // 提交人只能关闭自己的 OPEN 工单
            if (newStatus !in REPORTER_ALLOWED_STATUSES) {
                throw ApiResultException(HttpStatus.FORBIDDEN.value(), "提交人只能将工单设为 RESOLVED")
            }
            if (ticket.status != "OPEN") {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "仅 OPEN 状态的工单可自行关闭")
            }
        }

        // 状态无变化, 不更新
        if (ticket.status == newStatus) {
            return toResponse(ticket, currentUserId, actorMode == ActorMode.ADMIN)
        }

        val now = Instant.now()
        val completePublic = actorMode == ActorMode.ADMIN && newStatus == "RESOLVED" &&
            request.completePublicFeedback && FeedbackVisibility.isPublic(ticket.visibility)
        val updatedTicket = ticket.copy(
            status = newStatus,
            publicStatus = if (completePublic) PublicFeedbackStatus.COMPLETED else ticket.publicStatus,
            completedAt = if (completePublic) ticket.completedAt ?: now else ticket.completedAt,
            publicUpdatedAt = if (completePublic) now else ticket.publicUpdatedAt,
            workflowStage = if (actorMode == ActorMode.ADMIN && newStatus == "OPEN" && ticket.status != "OPEN") {
                if (ticket.operatorAssigneeUserId != null &&
                    FeedbackWorkflow.area(ticket) in feedbackAccessService.operatorAreas(ticket.operatorAssigneeUserId)
                ) {
                    FeedbackWorkflow.PROCESSING
                } else {
                    FeedbackWorkflow.UNASSIGNED
                }
            } else {
                ticket.workflowStage
            },
            operatorAssigneeUserId = if (actorMode == ActorMode.ADMIN && newStatus == "OPEN" && ticket.status != "OPEN" &&
                (
                    ticket.operatorAssigneeUserId == null ||
                        FeedbackWorkflow.area(ticket) !in feedbackAccessService.operatorAreas(ticket.operatorAssigneeUserId)
                    )
            ) {
                null
            } else {
                ticket.operatorAssigneeUserId
            },
            handlerUserId = if (actorMode == ActorMode.ADMIN) currentUserId else ticket.handlerUserId,
            handledAt = if (actorMode == ActorMode.ADMIN) now else ticket.handledAt,
            updatedAt = now,
        )

        val saved = feedbackTicketQueryRepository.saveIfUnchanged(ticket, updatedTicket)
            ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已更新，请重新打开详情后重试")
        log.info { "反馈工单状态更新: ticketId=$ticketId, ${ticket.status} → $newStatus, by=$currentUserId" }
        if (newStatus != "OPEN") notificationService.clearFeedbackTasks(ticketId)

        // 管理员改状态后, 给提交人生成通知 (状态有实际变化), 包括同账号场景
        if (actorMode == ActorMode.ADMIN) {
            if (newStatus == "DISMISSED") {
                workflowEvents.save(
                    FeedbackWorkflowEvent(
                        ticketId = ticketId,
                        action = "DISMISS",
                        actorUserId = currentUserId,
                        note = request.reason?.trim().orEmpty(),
                    ),
                )
            }
            val statusLabel = when (newStatus) {
                "RESOLVED" -> "已处理"
                "DISMISSED" -> "已忽略"
                else -> newStatus
            }
            notificationService.create(
                userId = ticket.reporterUserId,
                kind = "FEEDBACK_STATUS_UPDATED",
                title = "你的反馈状态已更新",
                body = "反馈摘要：${ticket.content.take(100)}\n管理员将你的反馈状态更新为: $statusLabel",
                refType = "FEEDBACK",
                refId = ticketId,
            )
        }

        return toResponse(saved, currentUserId, actorMode == ActorMode.ADMIN)
    }

    // ========== 内部方法 ==========

    /** 从消息数组推导列表判断未读所需的最后一条用户消息边界。 */
    private fun lastReporterMessageBoundary(ticket: FeedbackTicket): ReporterMessageBoundary? {
        if (ticket.messages.any { message ->
                message.senderKind.trim().uppercase() !in setOf("REPORTER", "ADMIN")
            }
        ) {
            return null
        }
        val entry = ticket.messages.withIndex()
            .lastOrNull { it.value.senderKind.trim().equals("REPORTER", ignoreCase = true) }
            ?: return null
        return ReporterMessageBoundary(
            id = entry.value.id.trim().takeIf { it.isNotEmpty() },
            createdAt = entry.value.createdAt,
            index = entry.index,
        )
    }

    private fun resolveActorMode(requestedMode: String?, isReporter: Boolean, isManager: Boolean): ActorMode {
        val actorMode = requestedMode?.trim()?.uppercase()?.let { normalized ->
            ActorMode.entries.firstOrNull { it.name == normalized }
                ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的 actor_mode: $requestedMode")
        }

        return when (actorMode) {
            ActorMode.REPORTER -> {
                if (!isReporter) {
                    throw ApiResultException(HttpStatus.FORBIDDEN.value(), "当前用户不是工单提交人")
                }
                ActorMode.REPORTER
            }
            ActorMode.ADMIN -> {
                if (!isManager) {
                    throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈模块的管理权限")
                }
                ActorMode.ADMIN
            }
            null -> when {
                isReporter && isManager -> throw ApiResultException(
                    HttpStatus.BAD_REQUEST.value(),
                    "当前用户同时具有提交人和管理员身份，请明确指定 actor_mode",
                )
                isReporter -> ActorMode.REPORTER
                isManager -> ActorMode.ADMIN
                else -> throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈工单的操作权限")
            }
        }
    }

    private fun notifyCategoryReceivers(ticket: FeedbackTicket) {
        val ticketId = checkNotNull(ticket.id)
        val category = normalizedTicketFields(ticket).category
        val categoryLabel = categories.label(category) ?: category
        feedbackAccessService.operatorUserIds(category)
            .filter { it != ticket.reporterUserId }
            .forEach { receiverId ->
                notificationService.create(
                    userId = receiverId,
                    kind = "FEEDBACK_ASSIGNED",
                    title = "$categoryLabel 有新反馈",
                    body = ticket.content.take(100),
                    refType = "FEEDBACK",
                    refId = ticketId,
                    messageIndex = 0,
                )
            }
    }

    private fun requireViewableTicket(currentUserId: String, ticketId: String): FeedbackTicket {
        val ticket = feedbackTicketRepository.findById(ticketId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
        }
        val isReporter = ticket.reporterUserId == currentUserId
        val fields = normalizedTicketFields(ticket)
        if (!isReporter && !feedbackAccessService.canViewTicket(currentUserId, ticket)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈模块的查看权限")
        }
        return ticket
    }

    private fun requireAutomationTicket(currentUserId: String, ticketId: String, allowedAreas: Set<String>?): FeedbackTicket {
        val ticket = feedbackTicketRepository.findById(ticketId).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $ticketId")
        }
        if (FeedbackSpaces.id(ticket) != FeedbackSpaces.DEFAULT || !feedbackAccessService.canViewTicket(currentUserId, ticket)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈模块的后台查看权限")
        }
        val normalizedAllowedAreas = allowedAreas?.mapTo(linkedSetOf()) { it.trim().uppercase() }
        if (normalizedAllowedAreas != null && FeedbackWorkflow.area(ticket) !in normalizedAllowedAreas) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "Integration token 不允许访问该反馈板块")
        }
        return ticket
    }

    private fun List<MediaAsset>.toMessageImages(): List<FeedbackMessageImage> = filter { it.effectiveKind() == MediaKind.IMAGE }
        .map { FeedbackMessageImage(id = checkNotNull(it.id), url = if (it.privateStorage) "" else it.storagePath) }

    private fun List<MediaAsset>.toMessageFiles(): List<FeedbackMessageFile> = filter { it.effectiveKind() == MediaKind.FILE }
        .map {
            FeedbackMessageFile(
                id = checkNotNull(it.id),
                name = it.originalName,
                mime = it.mime,
                size = it.size,
            )
        }

    /**
     * 校验媒体 id 列表: 最多 10 个附件, 必须是当前用户自己的未删除媒体
     */
    private fun validateMediaIds(userId: String, mediaIds: List<String>, spaceId: String): List<MediaAsset> {
        if (mediaIds.isEmpty()) return emptyList()
        if (mediaIds.size > MAX_MEDIA_PER_MESSAGE) {
            throw ApiResultException(
                HttpStatus.BAD_REQUEST.value(),
                "附件数量超过上限($MAX_MEDIA_PER_MESSAGE 个)",
            )
        }
        if (mediaIds.size != mediaIds.toSet().size) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "媒体 ID 不能重复")
        }
        val assets = mediaAssetRepository.findAllById(mediaIds)
        for (asset in assets) {
            if (asset.ownerUserId != userId) {
                throw ApiResultException(HttpStatus.FORBIDDEN.value(), "媒体 ${asset.id} 不属于当前用户")
            }
            if (spaceId != FeedbackSpaces.DEFAULT && asset.effectiveKind() == MediaKind.IMAGE && !asset.privateStorage) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "合作专区图片必须通过反馈附件入口上传")
            }
            if (asset.deletedAt != null) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "媒体 ${asset.id} 已被删除")
            }
        }
        // 确保所有请求的 mediaIds 都存在
        val assetsById = assets.associateBy { it.id }
        val missingIds = mediaIds.filterNot { assetsById.containsKey(it) }
        if (missingIds.isNotEmpty()) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "媒体不存在: $missingIds")
        }
        return mediaIds.map { mediaId -> assetsById.getValue(mediaId) }
    }

    /**
     * 统计最后一次管理员回复后, 提交人连续补充的消息数
     */
    private fun countPendingMessagesAfterLastAdminReply(ticket: FeedbackTicket): Int {
        val lastAdminIndex = ticket.messages.lastIndexOfLast { it.senderKind == "ADMIN" }
        if (lastAdminIndex < 0) {
            // 首条消息已包含在工单创建请求中, 只统计后续补充消息
            return (ticket.messages.count { it.senderKind == "REPORTER" } - 1).coerceAtLeast(0)
        }
        // 统计最后一条管理员回复之后的提交人消息数
        return ticket.messages.drop(lastAdminIndex + 1).count { it.senderKind == "REPORTER" }
    }

    /**
     * 构建客户端信息
     */
    private fun buildClientInfo(): FeedbackClientInfo {
        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request
        return FeedbackClientInfo(
            userAgent = request?.getHeader("User-Agent"),
            ip = request?.let { IpUtil.getIpAddr(it) },
            ipLocation = null, // 第一期暂不实现 IP 地理定位
        )
    }

    /**
     * 归一化前端上报的应用诊断信息。
     *
     * 旧客户端不带 diagnostics 字段,或三个字段都为空时返回 null,不写入空对象。
     */
    private fun buildDiagnostics(request: FeedbackReportCreateRequest): FeedbackDiagnostics? {
        val raw = request.diagnostics ?: return null
        val normalized = FeedbackDiagnostics(
            productVersion = raw.productVersion?.trim()?.takeIf(String::isNotEmpty),
            frontendCommit = raw.frontendCommit?.trim()?.takeIf(String::isNotEmpty),
            buildTime = raw.buildTime?.trim()?.takeIf(String::isNotEmpty),
        )
        if (
            normalized.productVersion == null &&
            normalized.frontendCommit == null &&
            normalized.buildTime == null
        ) {
            return null
        }
        return normalized
    }

    /**
     * 生成带前缀的唯一 id
     */
    private fun generateId(prefix: String): String {
        val bytes = ByteArray(8)
        random.nextBytes(bytes)
        val hex = bytes.joinToString("") { b ->
            val v = b.toInt() and 0xFF
            "${"0123456789abcdef"[v shr 4]}${"0123456789abcdef"[v and 0x0F]}"
        }
        return "$prefix$hex"
    }

    /**
     * 将实体转换为响应 DTO
     */
    private fun toResponse(ticket: FeedbackTicket, currentUserId: String, adminMode: Boolean = false): FeedbackReportResponse {
        val fields = normalizedTicketFields(ticket)
        val isReporter = ticket.reporterUserId == currentUserId
        val reporterInfo = hubUserInfoService.get(ticket.reporterUserId)

        // 计算配额
        val pendingCount = if (ticket.status == "OPEN" && isReporter) {
            countPendingMessagesAfterLastAdminReply(ticket)
        } else {
            0
        }
        val isManager = adminMode && (
            feedbackAccessService.canControlTicket(currentUserId, ticket) ||
                (
                    FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.UNASSIGNED &&
                        feedbackAccessService.canClaimTicket(currentUserId, ticket)
                    )
            )
        val canAppend = ticket.status == "OPEN" && ticket.mergedIntoId == null && isReporter && pendingCount < PENDING_LIMIT

        val messageResponses = ticket.messages.map { msg ->
            val authorInfo = hubUserInfoService.get(msg.authorUserId)
            FeedbackMessageResponse(
                id = msg.id,
                senderKind = msg.senderKind,
                author = FeedbackMessageResponse.AuthorInfo(
                    id = msg.authorUserId,
                    userName = authorInfo?.userName ?: "未知用户",
                ),
                content = msg.content,
                images = msg.images.map { img ->
                    FeedbackMessageResponse.ImageInfo(
                        id = img.id,
                        url = if (img.url.isBlank()) "" else toPublicMediaUrl(img.url),
                        privateStorage = img.url.isBlank(),
                    )
                },
                createdAt = msg.createdAt,
                files = msg.files.map { file ->
                    FeedbackMessageResponse.FileInfo(
                        id = file.id,
                        name = file.name,
                        mime = file.mime,
                        size = file.size,
                        downloadUrl = "/v1/reports/${checkNotNull(ticket.id)}/attachments/${file.id}",
                    )
                },
            )
        }

        return FeedbackReportResponse(
            id = ticket.id!!,
            spaceId = FeedbackSpaces.id(ticket),
            type = fields.type,
            category = fields.category,
            area = fields.category,
            status = ticket.status,
            workflowStage = if (adminMode) FeedbackWorkflow.stage(ticket) else "UNASSIGNED",
            workArea = if (adminMode) FeedbackWorkflow.area(ticket) else null,
            operatorAssigneeUserId = if (adminMode) ticket.operatorAssigneeUserId else null,
            operatorAssigneeName = if (adminMode) ticket.operatorAssigneeUserId?.let { hubUserInfoService.get(it)?.userName } else null,
            teamUnread =
            adminMode && FeedbackWorkflow.lastReporterIndex(ticket).let { it >= 0 && it > (ticket.teamReadReporterIndex ?: it) },
            needsReply = adminMode && FeedbackWorkflow.needsReply(ticket),
            content = ticket.content,
            title = ticket.title,
            publicConsent = ticket.publicConsent,
            visibility = FeedbackVisibility.normalize(ticket.visibility),
            publicTitle = ticket.publicTitle,
            publicSummary = ticket.publicSummary,
            publicStatus = ticket.publicStatus,
            supportCount = ticket.supportCount.coerceAtLeast(0),
            mergedIntoId = ticket.mergedIntoId,
            mergedCount = ticket.mergedCount,
            publishedAt = ticket.publishedAt,
            publicUpdatedAt = ticket.publicUpdatedAt,
            completedAt = ticket.completedAt,
            targetVersionId = ticket.targetVersionId,
            targetVersionLabel = ticket.targetVersionLabel,
            completedVersionId = ticket.completedVersionId,
            completedVersionLabel = ticket.completedVersionLabel,
            messages = messageResponses,
            hasAdminReply = ticket.hasAdminReply || ticket.messages.any { it.senderKind == "ADMIN" },
            quota = FeedbackReportResponse.QuotaInfo(
                pendingCount = pendingCount,
                pendingLimit = PENDING_LIMIT,
                canAppend = canAppend,
            ),
            viewerIsReporter = isReporter,
            viewerCanManage = isManager,
            viewerCanTakeOver = adminMode && ticket.status == "OPEN" && ticket.mergedIntoId == null &&
                FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.PROCESSING &&
                ticket.operatorAssigneeUserId != currentUserId && feedbackAccessService.canClaimTicket(currentUserId, ticket),
            viewerCanDevelop = adminMode && ticket.status == "OPEN" && ticket.mergedIntoId == null &&
                FeedbackWorkflow.stage(ticket) == FeedbackWorkflow.DEV_HANDOFF &&
                FeedbackWorkflow.area(ticket) in feedbackAccessService.developerAreas(currentUserId),
            clientInfo = ticket.clientInfo?.let {
                FeedbackReportResponse.ClientInfoResponse(
                    consent = ticket.clientInfoConsent,
                    userAgent = it.userAgent,
                    ip = it.ip,
                    ipLocation = it.ipLocation,
                )
            },
            diagnostics = ticket.diagnostics?.let {
                FeedbackReportResponse.DiagnosticsResponse(
                    productVersion = it.productVersion,
                    frontendCommit = it.frontendCommit,
                    buildTime = it.buildTime,
                )
            },
            reporter = FeedbackReportResponse.UserInfo(
                id = ticket.reporterUserId,
                userName = reporterInfo?.userName ?: "未知用户",
            ),
            handler = ticket.handlerUserId?.let { hid ->
                val hi = hubUserInfoService.get(hid)
                FeedbackReportResponse.UserInfo(
                    id = hid,
                    userName = hi?.userName ?: "未知用户",
                )
            },
            createdAt = ticket.createdAt,
            updatedAt = ticket.updatedAt,
        )
    }

    private fun toPublicMediaUrl(url: String): String {
        val normalized = url.trim()
        if (normalized.isEmpty()) return url
        if (normalized.startsWith("http://", ignoreCase = true) || normalized.startsWith("https://", ignoreCase = true)) {
            return url
        }
        if (!normalized.startsWith('/')) return url
        return properties.info.publicBaseUrl.trimEnd('/') + normalized
    }
}

/**
 * 查找列表中最后一个匹配条件的元素的索引
 */
private fun <T> List<T>.lastIndexOfLast(predicate: (T) -> Boolean): Int {
    for (i in indices.reversed()) {
        if (predicate(this[i])) return i
    }
    return -1
}
