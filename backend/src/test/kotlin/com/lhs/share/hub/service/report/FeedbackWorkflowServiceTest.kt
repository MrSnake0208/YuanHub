package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.FeedbackWorkflowEventRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackMessage
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.service.HubUserInfoService
import com.lhs.share.hub.service.notification.NotificationService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import java.util.Optional

class FeedbackWorkflowServiceTest {
    private val tickets = mockk<FeedbackTicketRepository>()
    private val query = mockk<FeedbackTicketQueryRepository>()
    private val events = mockk<FeedbackWorkflowEventRepository>(relaxed = true)
    private val access = mockk<FeedbackAccessService>(relaxed = true)
    private val notifications = mockk<NotificationService>(relaxed = true)
    private val categories = mockk<FeedbackCategoryService>()
    private val userInfo = mockk<HubUserInfoService>()
    private val service = FeedbackWorkflowService(tickets, query, events, access, notifications, categories, userInfo)

    init {
        every { categories.spaces() } returns listOf(FeedbackSpace("yuanhub", "YuanHub（主站）"))
        every { categories.requireSpace("yuanhub", any()) } returns FeedbackSpace("yuanhub", "YuanHub（主站）")
        every { categories.requireInSpace(any(), "yuanhub") } answers {
            val key = firstArg<String>()
            if (key.trim().uppercase() !in categories.keys()) throw ApiResultException(400, "无效的反馈板块")
            key.trim().uppercase()
        }
        every { categories.list() } returns FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) }
        every { access.canClaimTicket(any(), any()) } answers { FeedbackWorkflow.area(secondArg()) in access.operatorAreas(firstArg()) }
        every { access.canViewTicket(any(), any()) } answers { FeedbackWorkflow.area(secondArg()) in access.developerAreas(firstArg()) }
        every { events.save(any()) } answers { firstArg<FeedbackWorkflowEvent>() }
        every { categories.keys() } returns FeedbackArea.all
        every { categories.label(any()) } returns null
        every { userInfo.get(any()) } returns null
        every { userInfo.get("alice") } returns MaaUserInfo("alice", "小王")
        every { userInfo.get("bob") } returns MaaUserInfo("bob", "小李")
        every { userInfo.get("root") } returns MaaUserInfo("root", "管理员")
        every { userInfo.get("developer") } returns MaaUserInfo("developer", "小周")
    }

    private fun ticket(id: String = "rpt_1") = FeedbackTicket(
        id = id,
        type = "BUG",
        category = "OPERATOR",
        area = "OPERATOR",
        status = "OPEN",
        reporterUserId = "reporter",
        content = "反馈",
        messages = listOf(FeedbackMessage("rpm_1", "REPORTER", "reporter", "反馈")),
    )

    @Test
    fun `日历转程序要求负责人日历授权且流转保留归属消息和未读边界`() {
        val old = ticket().copy(
            type = FeedbackType.EXPERIENCE,
            category = FeedbackArea.CALENDAR,
            area = FeedbackArea.CALENDAR,
            workArea = FeedbackArea.CALENDAR,
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
            teamReadReporterIndex = 0,
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("alice", old) } returns true
        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.OPERATOR)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.handoff("alice", "rpt_1", "CALENDAR", "测试交接") }.statusCode)
        verify(exactly = 0) { query.saveIfUnchanged(any(), any()) }

        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.CALENDAR)
        every { access.developerUserIds(FeedbackArea.CALENDAR) } returns setOf("developer")
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }
        val updated = service.handoff("alice", "rpt_1", "CALENDAR", "测试交接")
        assertEquals(FeedbackWorkflow.DEV_HANDOFF, updated.workflowStage)
        assertEquals(FeedbackArea.CALENDAR, updated.category)
        assertEquals(old.reporterUserId, updated.reporterUserId)
        assertEquals(old.messages, updated.messages)
        assertEquals(old.teamReadReporterIndex, updated.teamReadReporterIndex)
        verify(exactly = 1) { events.save(match { it.action == "HANDOFF" }) }
    }

    @Test
    fun `旧开放工单未接单且历史消息不制造团队未读`() {
        val old = ticket()
        assertEquals(FeedbackWorkflow.UNASSIGNED, FeedbackWorkflow.stage(old))
        assertEquals(FeedbackArea.OPERATOR, FeedbackWorkflow.area(old))
        assertTrue(FeedbackWorkflow.needsReply(old))
        assertFalse(FeedbackWorkflow.needsReply(old.copy(messages = old.messages + FeedbackMessage("rpm_2", "ADMIN", "admin", "已回复"))))
    }

    @Test
    fun `接单使用快照比较且冲突返回 409`() {
        val old = ticket()
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canClaimTicket("alice", old) } returns true
        every { query.saveIfUnchanged(old, any()) } returns null

        val error = assertThrows(ApiResultException::class.java) { service.claim("alice", "rpt_1") }

        assertEquals(409, error.statusCode)
        verify(exactly = 0) { events.save(any()) }
        verify(exactly = 0) { notifications.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `接单保存处理中阶段并阻止重复接单`() {
        var stored = ticket()
        every { tickets.findById("rpt_1") } answers { Optional.of(stored) }
        every { access.canClaimTicket("alice", any()) } returns true
        every { query.saveIfUnchanged(any(), any()) } answers { secondArg<FeedbackTicket>().also { stored = it } }

        val claimed = service.claim("alice", "rpt_1")

        assertEquals(FeedbackWorkflow.PROCESSING, claimed.workflowStage)
        assertEquals("alice", claimed.operatorAssigneeUserId)
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.claim("alice", "rpt_1") }.statusCode)
        verify(exactly = 1) { query.saveIfUnchanged(any(), any()) }
    }

    @Test
    fun `管理员改类同步用户分类并保留旧工单的反馈类型`() {
        val old = ticket().copy(
            type = FeedbackType.LEGACY_FEEDBACK,
            category = FeedbackType.BUG,
            workArea = FeedbackArea.OPERATOR,
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("alice", old) } returns true
        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.STAR)
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        val updated = service.changeArea("alice", "rpt_1", FeedbackArea.STAR, "原板块填错")

        assertEquals(FeedbackType.BUG, updated.type)
        assertEquals(FeedbackArea.STAR, updated.category)
        assertEquals(FeedbackArea.STAR, updated.area)
        assertEquals(FeedbackArea.STAR, updated.workArea)
        verify(exactly = 1) { events.save(match { it.action == "CHANGE_AREA" }) }
    }

    @Test
    fun `转程序指定新板块时用户分类同步更新`() {
        val old = ticket().copy(
            workArea = FeedbackArea.OPERATOR,
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("alice", old) } returns true
        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.MAAYUAN)
        every { access.developerUserIds(FeedbackArea.MAAYUAN) } returns setOf("developer")
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        val updated = service.handoff("alice", "rpt_1", FeedbackArea.MAAYUAN, "交由麻圆处理")

        assertEquals(FeedbackArea.MAAYUAN, updated.category)
        assertEquals(FeedbackArea.MAAYUAN, updated.area)
        assertEquals(FeedbackArea.MAAYUAN, updated.workArea)
        assertEquals(FeedbackWorkflow.DEV_HANDOFF, updated.workflowStage)
    }

    @Test
    fun `自定义板块可被管理员用于改类`() {
        val old = ticket().copy(workArea = FeedbackArea.OPERATOR)
        every { categories.keys() } returns FeedbackArea.all + "CUSTOM_TEST"
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("root", old) } returns true
        every { access.operatorUserIds("CUSTOM_TEST") } returns emptySet()
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        val updated = service.changeArea("root", "rpt_1", "CUSTOM_TEST", "原板块填错")

        assertEquals("CUSTOM_TEST", FeedbackWorkflow.area(updated))
        assertEquals("CUSTOM_TEST", updated.category)
    }

    @Test
    fun `无程序板块权限不能读取内部处理记录`() {
        val old = ticket().copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF, workArea = "STAR")
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canViewTicket("outsider", old) } returns false

        assertEquals(403, assertThrows(ApiResultException::class.java) { service.events("outsider", "rpt_1") }.statusCode)
        verify(exactly = 0) { events.findByTicketIdOrderByCreatedAtAsc(any()) }
    }

    @Test
    fun `阅读仅推进请求对应的用户消息边界`() {
        val old = ticket().copy(
            messages = listOf(
                FeedbackMessage("rpm_old", "REPORTER", "reporter", "旧消息"),
                FeedbackMessage("rpm_new", "REPORTER", "reporter", "新消息"),
            ),
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canViewTicket("alice", old) } returns true
        every { query.advanceTeamRead("rpt_1", 0) } returns old.copy(teamReadReporterIndex = 0)

        service.markRead("alice", "rpt_1", "rpm_old")

        verify(exactly = 1) { query.advanceTeamRead("rpt_1", 0) }
        verify(exactly = 1) { notifications.clearFeedbackReminders("rpt_1", 0) }
    }

    @Test
    fun `无效阅读边界不推进团队游标`() {
        val old = ticket()
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canViewTicket("alice", old) } returns true

        assertEquals(
            400,
            assertThrows(ApiResultException::class.java) {
                service.markRead("alice", "rpt_1", "rpm_missing")
            }.statusCode,
        )
        verify(exactly = 0) { query.advanceTeamRead(any(), any()) }
    }

    @ParameterizedTest
    @CsvSource("alice,小王转交了,2", "bob,小李接手了,2", "root,管理员转交了,3")
    fun `转交和接手向交接双方及操作人发送当次关系和摘要`(actor: String, action: String, count: Int) {
        val old = ticket().copy(
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
            title = "签到问题",
            content = "奖励未到账",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.operatorAreas("bob") } returns setOf(FeedbackArea.OPERATOR)
        every { access.canControlTicket(actor, old) } returns (actor != "bob")
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        service.assign(actor, "rpt_1", "bob", "请核查奖励")

        val title = "$action「签到问题」（小王 → 小李）"
        val body = "反馈摘要：奖励未到账\n交接说明：请核查奖励"
        for (recipient in setOf("alice", "bob", actor)) {
            verify(exactly = 1) { notifications.create(recipient, "FEEDBACK_ASSIGNED", title, body, "FEEDBACK", "rpt_1") }
        }
        verify(exactly = count) { notifications.create(any(), any(), any(), any(), any(), any()) }
        verify { events.save(match { it.note == "$title\n请核查奖励" && it.actorUserId == actor }) }
    }

    @Test
    fun `旧反馈无标题和目标昵称时保留正文摘要及用户标识`() {
        val old = ticket().copy(
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
            content = "奖励未到账",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.operatorAreas("unknown") } returns setOf(FeedbackArea.OPERATOR)
        every { access.canControlTicket("alice", old) } returns true
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        service.assign("alice", "rpt_1", "unknown", "核查")

        verify {
            notifications.create(
                "unknown",
                "FEEDBACK_ASSIGNED",
                "小王转交了「奖励未到账」（小王 → unknown）",
                "反馈摘要：奖励未到账\n交接说明：核查",
                "FEEDBACK",
                "rpt_1",
            )
        }
    }

    @Test
    fun `转程序通知明确板块和人员并对操作人及双岗位负责人去重`() {
        val old = ticket().copy(
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "alice",
            title = "签到问题",
            content = "奖励未到账",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("root", old) } returns true
        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.MAAYUAN)
        every { access.developerUserIds(FeedbackArea.MAAYUAN) } returns linkedSetOf("developer", "alice")
        every { categories.label(FeedbackArea.MAAYUAN) } returns "麻圆"
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        service.handoff("root", "rpt_1", FeedbackArea.MAAYUAN, "核查程序")

        val title = "管理员将「签到问题」转交给麻圆程序（小周、小王）"
        for (recipient in setOf("developer", "alice", "root")) {
            verify(exactly = 1) {
                notifications.create(recipient, "FEEDBACK_DEV_HANDOFF", title, "反馈摘要：奖励未到账\n交接说明：核查程序", "FEEDBACK", "rpt_1")
            }
        }
        verify(exactly = 3) { notifications.create(any(), any(), any(), any(), any(), any()) }
        verify { events.save(match { it.note == "$title\n核查程序" }) }
    }

    @Test
    fun `无程序接收人时不保存交接或创建通知`() {
        val old = ticket().copy(workflowStage = FeedbackWorkflow.PROCESSING, operatorAssigneeUserId = "alice")
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.canControlTicket("alice", old) } returns true
        every { access.operatorAreas("alice") } returns setOf(FeedbackArea.OPERATOR)
        every { access.developerUserIds(FeedbackArea.OPERATOR) } returns emptySet()

        assertEquals(
            409,
            assertThrows(ApiResultException::class.java) {
                service.handoff("alice", "rpt_1", FeedbackArea.OPERATOR, "核查")
            }.statusCode,
        )
        verify(exactly = 0) { query.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { notifications.create(any(), any(), any(), any(), any(), any()) }
    }

    @ParameterizedTest
    @CsvSource(
        "RETURN,developer,小周将「签到问题」交回运营小王,2",
        "WITHDRAW,alice,小王撤回了「签到问题」的程序交接（运营小王）,1",
    )
    fun `交回和撤回使用不同文案并给交接双方发送摘要`(mode: String, actor: String, title: String, count: Int) {
        val old = ticket().copy(
            workflowStage = FeedbackWorkflow.DEV_HANDOFF,
            operatorAssigneeUserId = "alice",
            title = "签到问题",
            content = "奖励未到账",
        )
        every { tickets.findById("rpt_1") } returns Optional.of(old)
        every { access.developerAreas("developer") } returns setOf(FeedbackArea.OPERATOR)
        every { access.canControlTicket("alice", old) } returns true
        every { query.saveIfUnchanged(old, any()) } answers { secondArg<FeedbackTicket>() }

        service.returnToOperator(actor, "rpt_1", "处理说明", mode)

        for (recipient in setOf(actor, "alice")) {
            verify(exactly = 1) {
                notifications.create(recipient, "FEEDBACK_DEV_RETURN", title, "反馈摘要：奖励未到账\n交接说明：处理说明", "FEEDBACK", "rpt_1")
            }
        }
        verify(exactly = count) { notifications.create(any(), any(), any(), any(), any(), any()) }
        verify { notifications.clearFeedbackKinds("rpt_1", setOf("FEEDBACK_DEV_HANDOFF")) }
        verify { events.save(match { it.action == mode && it.note == "$title\n处理说明" }) }
    }
}
