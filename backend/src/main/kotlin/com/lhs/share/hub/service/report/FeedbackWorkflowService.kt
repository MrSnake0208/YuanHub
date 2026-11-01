package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.FeedbackWorkflowEventRepository
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.service.HubUserInfoService
import com.lhs.share.hub.service.notification.NotificationService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class FeedbackWorkflowService(
    private val tickets: FeedbackTicketRepository,
    private val query: FeedbackTicketQueryRepository,
    private val events: FeedbackWorkflowEventRepository,
    private val access: FeedbackAccessService,
    private val notifications: NotificationService,
    private val categories: FeedbackCategoryService,
    private val userInfo: HubUserInfoService,
) {
    private fun userName(userId: String): String = userInfo.get(userId)?.userName?.takeIf { it.isNotBlank() } ?: userId

    private fun feedbackSubject(ticket: FeedbackTicket): String =
        (ticket.title?.trim()?.takeIf { it.isNotEmpty() } ?: ticket.content.trim()).take(40)

    private fun notificationBody(ticket: FeedbackTicket, note: String): String = "反馈摘要：${ticket.content.take(100)}\n交接说明：${note.take(100)}"

    private fun ticket(id: String): FeedbackTicket = tickets.findById(id).orElseThrow {
        ApiResultException(HttpStatus.NOT_FOUND.value(), "工单不存在: $id")
    }

    private fun active(ticket: FeedbackTicket) {
        if (!FeedbackWorkflow.isActive(ticket)) throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已结束或合并")
    }

    private fun save(previous: FeedbackTicket, updated: FeedbackTicket): FeedbackTicket = query.saveIfUnchanged(previous, updated)
        ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已被其他管理员更新，请刷新后重试")

    private fun reclassified(ticket: FeedbackTicket, area: String, now: Instant): FeedbackTicket = ticket.copy(
        type = if (ticket.type.equals(FeedbackType.LEGACY_FEEDBACK, ignoreCase = true)) {
            ticket.category?.trim()?.uppercase()?.takeIf { it in FeedbackType.all } ?: ticket.type
        } else {
            ticket.type
        },
        category = area,
        area = area,
        workArea = area,
        updatedAt = now,
    )

    @Transactional(transactionManager = "hubTransactionManager")
    fun claim(actor: String, id: String): FeedbackTicket {
        val previous = ticket(id)
        active(previous)
        if (!access.canClaimTicket(actor, previous)) throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该板块运营权限")
        if (FeedbackWorkflow.stage(previous) != FeedbackWorkflow.UNASSIGNED || previous.operatorAssigneeUserId != null) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已被接单，请刷新")
        }
        val now = Instant.now()
        val updated =
            save(
                previous,
                previous.copy(
                    workflowStage = FeedbackWorkflow.PROCESSING,
                    operatorAssigneeUserId = actor,
                    operatorAssignedAt = now,
                    updatedAt = now,
                ),
            )
        events.save(FeedbackWorkflowEvent(ticketId = id, action = "CLAIM", actorUserId = actor, note = "接单"))
        notifications.clearFeedbackKinds(id, setOf("FEEDBACK_ASSIGNED"))
        return updated
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun assign(actor: String, id: String, targetUserId: String, reason: String): FeedbackTicket {
        val previous = ticket(id)
        active(previous)
        if (FeedbackWorkflow.stage(previous) != FeedbackWorkflow.PROCESSING || previous.operatorAssigneeUserId == null) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "只有处理中工单可转交或接手")
        }
        val area = FeedbackWorkflow.area(previous)
        categories.requireInSpace(area, FeedbackSpaces.id(previous))
        if (area !in access.operatorAreas(targetUserId)) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "新负责人没有该板块运营权限")
        if (!access.canControlTicket(actor, previous) && !(actor == targetUserId && access.canClaimTicket(actor, previous))) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "无权转交或接手")
        }
        val note = reason.trim().takeIf { it.isNotEmpty() }
            ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "请填写转交或接手原因")
        val old = checkNotNull(previous.operatorAssigneeUserId)
        if (old == targetUserId) return previous
        val now = Instant.now()
        val updated = save(previous, previous.copy(operatorAssigneeUserId = targetUserId, operatorAssignedAt = now, updatedAt = now))
        val relationship = "${userName(old)} → ${userName(targetUserId)}"
        val action = if (actor == targetUserId) "接手了" else "转交了"
        val title = "${userName(actor)}$action「${feedbackSubject(previous)}」（$relationship）"
        events.save(FeedbackWorkflowEvent(ticketId = id, action = "ASSIGN", actorUserId = actor, note = "$title\n$note"))
        notifications.clearFeedbackKinds(id, setOf("FEEDBACK_ASSIGNED", "FEEDBACK_MESSAGE_FROM_REPORTER"))
        setOf(old, targetUserId, actor).forEach { userId ->
            notifications.create(userId, "FEEDBACK_ASSIGNED", title, notificationBody(previous, note), "FEEDBACK", id)
        }
        return updated
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun handoff(actor: String, id: String, workArea: String, note: String): FeedbackTicket {
        val previous = ticket(id)
        active(previous)
        if (!access.canControlTicket(actor, previous)) throw ApiResultException(HttpStatus.FORBIDDEN.value(), "只有当前运营负责人可转程序")
        if (FeedbackWorkflow.stage(previous) !=
            FeedbackWorkflow.PROCESSING
        ) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "工单当前不可转程序")
        }
        val area = categories.requireInSpace(workArea, FeedbackSpaces.id(previous))
        if (area !in categories.keys() || area !in access.operatorAreas(checkNotNull(previous.operatorAssigneeUserId))) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "负责人没有目标板块运营权限")
        }
        val developers = access.developerUserIds(area)
        if (developers.isEmpty()) throw ApiResultException(HttpStatus.CONFLICT.value(), "目标板块尚无程序负责人")
        val reason = note.trim().takeIf { it.isNotEmpty() }
            ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "请填写交接说明")
        val updated =
            save(
                previous,
                reclassified(previous, area, Instant.now()).copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF, developerReturnedAt = null),
            )
        val target = "${categories.label(area) ?: area}程序（${developers.joinToString("、") { userName(it) }}）"
        val title = "${userName(actor)}将「${feedbackSubject(previous)}」转交给$target"
        events.save(FeedbackWorkflowEvent(ticketId = id, action = "HANDOFF", actorUserId = actor, note = "$title\n$reason"))
        (developers + setOfNotNull(actor, previous.operatorAssigneeUserId)).forEach {
            notifications.create(it, "FEEDBACK_DEV_HANDOFF", title, notificationBody(previous, reason), "FEEDBACK", id)
        }
        return updated
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun changeArea(actor: String, id: String, workArea: String, note: String): FeedbackTicket {
        val previous = ticket(id)
        active(previous)
        if (!access.canControlTicket(actor, previous)) throw ApiResultException(HttpStatus.FORBIDDEN.value(), "只有当前运营负责人可调整板块")
        if (FeedbackWorkflow.stage(previous) ==
            FeedbackWorkflow.DEV_HANDOFF
        ) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "请先撤回程序交接")
        }
        val area = categories.requireInSpace(workArea, FeedbackSpaces.id(previous))
        if (area !in categories.keys()) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的反馈板块")
        if (previous.operatorAssigneeUserId != null && area !in access.operatorAreas(previous.operatorAssigneeUserId)) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "当前负责人没有目标板块权限，请先转交")
        }
        val reason = note.trim().takeIf { it.isNotEmpty() }
            ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "请填写调整原因")
        if (FeedbackWorkflow.area(previous) == area && previous.category == area && previous.area == area) return previous
        val updated = save(previous, reclassified(previous, area, Instant.now()))
        events.save(FeedbackWorkflowEvent(ticketId = id, action = "CHANGE_AREA", actorUserId = actor, note = reason))
        if (FeedbackWorkflow.stage(updated) == FeedbackWorkflow.UNASSIGNED) {
            notifications.clearFeedbackTasks(id)
            access.operatorUserIds(area).forEach {
                notifications.create(it, "FEEDBACK_ASSIGNED", "反馈板块已调整", notificationBody(previous, reason), "FEEDBACK", id)
            }
        }
        return updated
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun returnToOperator(actor: String, id: String, note: String, mode: String): FeedbackTicket {
        val previous = ticket(id)
        active(previous)
        if (FeedbackWorkflow.stage(previous) !=
            FeedbackWorkflow.DEV_HANDOFF
        ) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "工单未转程序")
        }
        val isDeveloper = access.canViewTicket(actor, previous) && FeedbackWorkflow.area(previous) in access.developerAreas(actor)
        val isOperator = access.canControlTicket(actor, previous)
        if ((mode != "RETURN" || !isDeveloper) && (mode != "WITHDRAW" || !isOperator)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "无权交回或撤回")
        }
        val reason = note.trim().takeIf { it.isNotEmpty() }
            ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "请填写处理结果或撤回原因")
        val updated = save(
            previous,
            previous.copy(
                workflowStage = FeedbackWorkflow.PROCESSING,
                developerReturnedAt = if (mode == "RETURN") Instant.now() else null,
                updatedAt = Instant.now(),
            ),
        )
        val operator = previous.operatorAssigneeUserId?.let { userName(it) }.orEmpty()
        val title = if (mode == "RETURN") {
            "${userName(actor)}将「${feedbackSubject(previous)}」交回运营$operator"
        } else {
            "${userName(actor)}撤回了「${feedbackSubject(previous)}」的程序交接（运营$operator）"
        }
        events.save(FeedbackWorkflowEvent(ticketId = id, action = mode, actorUserId = actor, note = "$title\n$reason"))
        notifications.clearFeedbackKinds(id, setOf("FEEDBACK_DEV_HANDOFF"))
        setOfNotNull(actor, previous.operatorAssigneeUserId).forEach {
            notifications.create(it, "FEEDBACK_DEV_RETURN", title, notificationBody(previous, reason), "FEEDBACK", id)
        }
        return updated
    }

    fun events(actor: String, id: String): List<FeedbackWorkflowEvent> {
        val ticket = ticket(id)
        if (!access.canViewTicket(actor, ticket)) throw ApiResultException(HttpStatus.FORBIDDEN.value(), "无权查看内部记录")
        return events.findByTicketIdOrderByCreatedAtAsc(id)
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun markRead(actor: String, id: String, messageId: String): FeedbackTicket {
        val ticket = ticket(id)
        if (!access.canViewTicket(actor, ticket)) throw ApiResultException(HttpStatus.FORBIDDEN.value(), "无权标记已读")
        val boundary = ticket.messages.indexOfLast { it.id == messageId && it.senderKind == "REPORTER" }
        if (boundary < 0) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "用户消息不存在")
        val updated = query.advanceTeamRead(id, boundary)
            ?: throw ApiResultException(HttpStatus.CONFLICT.value(), "工单已变化")
        notifications.clearFeedbackReminders(id, boundary)
        return updated
    }
}
