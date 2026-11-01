package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.controller.report.request.FeedbackAccessUpdateRequest
import com.lhs.share.hub.repository.FeedbackAccessGrantRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.FeedbackWorkflowEventRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.FeedbackAccessGrant
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.UserService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageImpl
import java.util.Optional

class FeedbackAccessServiceTest {
    private val repository = mockk<FeedbackAccessGrantRepository>()
    private val userService = mockk<UserService>()
    private val authorizationService = mockk<AdminAuthorizationService>()
    private val auditService = mockk<AdminAuditService>(relaxed = true)
    private val tickets = mockk<FeedbackTicketRepository>()
    private val ticketQueries = mockk<FeedbackTicketQueryRepository>()
    private val events = mockk<FeedbackWorkflowEventRepository>(relaxed = true)
    private val notifications = mockk<NotificationService>(relaxed = true)
    private val categories = mockk<FeedbackCategoryService>()
    private val service =
        FeedbackAccessService(
            repository,
            userService,
            authorizationService,
            auditService,
            tickets,
            ticketQueries,
            events,
            notifications,
            categories,
        )

    init {
        every { categories.spaces() } returns listOf(FeedbackSpace("yuanhub", "YuanHub（主站）"))
        every { categories.requireSpace("yuanhub", any()) } returns FeedbackSpace("yuanhub", "YuanHub（主站）")
        every { categories.requireInSpace(any(), "yuanhub") } answers { FeedbackArea.requireValid(firstArg()) }
        every { tickets.findByOperatorAssigneeUserIdAndStatusAndMergedIntoIdIsNull(any(), any()) } returns emptyList()
        every { authorizationService.operatorAreasFor(any()) } returns emptySet()
        every { events.save(any()) } answers { firstArg<FeedbackWorkflowEvent>() }
        every { categories.list() } returns FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) }
        every { categories.keys() } returns FeedbackArea.all
        every { categories.requireValid(any()) } answers { FeedbackArea.requireValid(firstArg()) }
    }

    @Test
    fun `没有配置权限不能创建或修改专区且不会写库或审计`() {
        every { authorizationService.requirePermission("partner", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } throws
            ApiResultException(403, "无权配置")
        for (create in listOf(true, false)) {
            assertEquals(
                403,
                assertThrows(ApiResultException::class.java) {
                    service.saveSpace("partner", "partner-a", "改名", false, create)
                }.statusCode,
            )
        }
        verify(exactly = 0) { categories.createSpace(any(), any()) }
        verify(exactly = 0) { categories.updateSpace(any(), any(), any()) }
        verify(exactly = 0) { auditService.record(any()) }
    }

    @Test
    fun `用户与管理员获取同一反馈板块目录`() {
        every { authorizationService.hasRole("user", AdminRole.SUPER_ADMIN) } returns false
        every { repository.findById("user") } returns Optional.empty()
        every { authorizationService.manageableAreasFor("user") } returns emptySet()
        every { authorizationService.feedbackRolesFor("user") } returns emptySet()
        every { authorizationService.operatorAreasFor("user") } returns emptySet()
        every { authorizationService.developerAreasFor("user") } returns emptySet()

        val current = service.current("user")
        assertEquals(current.availableAreas, current.availableWorkAreas)
        assertTrue(current.availableAreas.any { it.key == FeedbackArea.STAR && it.label == "星石" })
        assertTrue(current.availableAreas.any { it.key == FeedbackArea.MAAYUAN && it.label == "麻圆" })
        assertEquals(1, current.availableAreas.count { it.key == FeedbackArea.CALENDAR && it.label == "活动日历" })
        assertTrue(current.operatorAreas.isEmpty())
        assertTrue(current.developerAreas.isEmpty())
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `排序必须有配置权限且只审计实际顺序变更`() {
        val before = listOf(FeedbackCategory("CALENDAR", "日历", hidden = true), FeedbackCategory("OTHER", "其他"))
        val after = before.reversed()
        val expectedKeys = before.map { it.key }
        val keys = after.map { it.key }
        every { authorizationService.requirePermission("manager", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } throws
            ApiResultException(403, "权限不足")
        assertEquals(
            403,
            assertThrows(ApiResultException::class.java) {
                service.reorderCategories("manager", keys, expectedKeys)
            }.statusCode,
        )
        verify(exactly = 0) { categories.reorder(any(), any()) }
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { categories.reorder(keys, expectedKeys) } returns (before to after)
        val response = service.reorderCategories("root", keys, expectedKeys)
        assertEquals(keys, response.map { it.key })
        assertTrue(response.last().hidden)
        verify(exactly = 1) {
            auditService.record(
                match<AdminAuditLog> {
                    it.action == AdminAuditAction.FEEDBACK_CATEGORY_REORDERED && it.actorUserId == "root" &&
                        it.before?.feedbackCategoryOrder == listOf("日历", "其他") &&
                        it.after?.feedbackCategoryOrder == listOf("其他", "日历")
                },
            )
        }
        every { categories.reorder(keys, keys) } returns (after to after)
        service.reorderCategories("root", keys, keys)
        every { categories.reorder(keys, expectedKeys) } throws ApiResultException(409, "目录已更新")
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.reorderCategories("root", keys, expectedKeys) }.statusCode)
        verify(exactly = 1) { auditService.record(any()) }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `目录排序在用户与工作台选项中保留且隐藏项仅留完整目录`() {
        val ordered = listOf(
            FeedbackCategory("OTHER", "其他"),
            FeedbackCategory("CALENDAR", "日历", hidden = true),
            FeedbackCategory("STAR", "星石"),
        )
        every { categories.list() } returns ordered
        every { authorizationService.hasRole("user", AdminRole.SUPER_ADMIN) } returns false
        every { repository.findById("user") } returns Optional.empty()
        every { authorizationService.manageableAreasFor("user") } returns emptySet()
        every { authorizationService.feedbackRolesFor("user") } returns emptySet()
        every { authorizationService.developerAreasFor("user") } returns emptySet()
        val current = service.current("user")
        assertEquals(ordered.map { it.key }, current.categoryCatalog.map { it.key })
        assertEquals(listOf("OTHER", "STAR"), current.availableCategories.map { it.key })
        assertEquals(current.availableCategories, current.availableWorkAreas)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `隐藏目录只影响可选项不移除既有授权或历史目录`() {
        val hidden = FeedbackCategory("CUSTOM_HIDDEN", "历史板块", hidden = true)
        every { categories.list() } returns listOf(hidden)
        every { authorizationService.hasRole("user", AdminRole.SUPER_ADMIN) } returns false
        every { repository.findById("user") } returns
            Optional.of(FeedbackAccessGrant(userId = "user", receiveAreas = setOf(hidden.key), updatedBy = "root"))
        every { authorizationService.manageableAreasFor("user") } returns setOf(hidden.key)
        every { authorizationService.feedbackRolesFor("user") } returns setOf("OPERATOR")
        every { authorizationService.operatorAreasFor("user") } returns setOf(hidden.key)
        every { authorizationService.developerAreasFor("user") } returns emptySet()

        val current = service.current("user")
        assertTrue(current.availableCategories.isEmpty())
        assertTrue(current.availableAreas.isEmpty())
        assertTrue(current.availableWorkAreas.isEmpty())
        assertEquals(hidden.key, current.categoryCatalog.single().key)
        assertTrue(current.categoryCatalog.single().hidden)
        assertEquals(setOf(hidden.key), current.operatorAreas)
        assertEquals(setOf(hidden.key), current.receiveAreas)
        assertEquals(setOf(hidden.key), current.manageAreas)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `隐藏和恢复沿用板块管理权限并审计前后状态`() {
        every { authorizationService.requirePermission("manager", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } throws
            ApiResultException(403, "权限不足")
        assertEquals(403, assertThrows(ApiResultException::class.java) { service.setCategoryHidden("manager", "STAR", true) }.statusCode)
        verify(exactly = 0) { categories.setHidden(any(), any()) }
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        for (hidden in listOf(true, false)) {
            val before = FeedbackCategory("STAR", "星石", hidden = !hidden)
            val after = before.copy(hidden = hidden)
            every { categories.setHidden("STAR", hidden) } returns (before to after)
            assertEquals(hidden, service.setCategoryHidden("root", "STAR", hidden).hidden)
            verify {
                auditService.record(
                    match<AdminAuditLog> {
                        it.action == AdminAuditAction.FEEDBACK_CATEGORY_VISIBILITY_UPDATED &&
                            it.before?.feedbackCategoryHidden == !hidden && it.after?.feedbackCategoryHidden == hidden
                    },
                )
            }
        }
        val unchanged = FeedbackCategory("STAR", "星石")
        every { categories.setHidden("STAR", false) } returns (unchanged to unchanged)
        service.setCategoryHidden("root", "STAR", false)
        verify(exactly = 2) { auditService.record(any()) }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `日历工单仅日历运营可接单程序仅在交接后可看且不能控制`() {
        val ticket = FeedbackTicket(id = "rpt_cal", type = "EXPERIENCE", category = "CALENDAR", reporterUserId = "reporter", content = "测试")
        every { authorizationService.operatorAreasFor("operator") } returns setOf(FeedbackArea.CALENDAR)
        every { authorizationService.operatorAreasFor("other") } returns setOf(FeedbackArea.OPERATOR)
        every { authorizationService.operatorAreasFor("developer") } returns emptySet()
        every { authorizationService.developerAreasFor("developer") } returns setOf(FeedbackArea.CALENDAR)
        every { authorizationService.developerAreasFor("other") } returns emptySet()
        every { authorizationService.hasRole(any(), AdminRole.SUPER_ADMIN) } returns false

        assertEquals(FeedbackArea.CALENDAR, FeedbackWorkflow.area(ticket))
        assertTrue(service.canClaimTicket("operator", ticket))
        assertTrue(service.canViewTicket("operator", ticket))
        assertFalse(service.canClaimTicket("other", ticket))
        assertFalse(service.canViewTicket("other", ticket))
        assertFalse(service.canViewTicket("developer", ticket))
        assertTrue(service.canViewTicket("developer", ticket.copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF)))
        assertFalse(service.canControlTicket("developer", ticket.copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF)))
        assertFalse(service.canControlTicket("other", ticket.copy(operatorAssigneeUserId = "other")))
        assertTrue(service.canControlTicket("operator", ticket.copy(operatorAssigneeUserId = "operator")))
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `新增板块只允许超级管理员且写入审计`() {
        every { authorizationService.requirePermission("manager", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } throws
            ApiResultException(403, "权限不足")
        assertEquals(
            403,
            assertThrows(ApiResultException::class.java) {
                service.createCategory("manager", "新板块")
            }.statusCode,
        )
        assertEquals(
            403,
            assertThrows(ApiResultException::class.java) {
                service.renameCategory("manager", "CUSTOM_TEST", "新名称")
            }.statusCode,
        )
        verify(exactly = 0) { categories.create(any()) }
        verify(exactly = 0) { categories.rename(any(), any()) }

        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { categories.create("新板块") } returns FeedbackCategory("CUSTOM_TEST", "新板块")
        assertEquals("CUSTOM_TEST", service.createCategory("root", "新板块").key)
        verify {
            auditService.record(
                match {
                    it.action == AdminAuditAction.FEEDBACK_CATEGORY_CREATED &&
                        it.after?.feedbackCategoryLabel == "新板块"
                },
            )
        }

        every { categories.rename("CUSTOM_TEST", "新名称") } returns
            (FeedbackCategory("CUSTOM_TEST", "新板块") to FeedbackCategory("CUSTOM_TEST", "新名称"))
        assertEquals("新名称", service.renameCategory("root", "CUSTOM_TEST", "新名称").label)
        verify {
            auditService.record(
                match {
                    it.action == AdminAuditAction.FEEDBACK_CATEGORY_RENAMED &&
                        it.before?.feedbackCategoryLabel == "新板块" && it.after?.feedbackCategoryLabel == "新名称"
                },
            )
        }
    }

    @Test
    fun `程序岗只可查看转交至本人板块的工单且不能执行运营控制`() {
        val ticket =
            FeedbackTicket(
                id = "rpt_1",
                type = "BUG",
                category = "OPERATOR",
                workArea = "STAR",
                reporterUserId = "reporter",
                content = "反馈",
            )
        every { authorizationService.operatorAreasFor("dev") } returns emptySet()
        every { authorizationService.developerAreasFor("dev") } returns setOf("STAR")
        every { authorizationService.hasRole("dev", AdminRole.SUPER_ADMIN) } returns false

        assertFalse(service.canViewTicket("dev", ticket))
        assertTrue(service.canViewTicket("dev", ticket.copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF)))
        assertFalse(service.canControlTicket("dev", ticket.copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF)))
    }

    @Test
    fun `旧管理授权不自动授予新岗位`() {
        every { authorizationService.operatorAreasFor("legacy") } returns emptySet()
        every { authorizationService.developerAreasFor("legacy") } returns emptySet()
        val ticket = FeedbackTicket(id = "rpt_1", type = "BUG", category = "OPERATOR", reporterUserId = "reporter", content = "反馈")

        assertFalse(service.canViewTicket("legacy", ticket))
        assertFalse(service.canClaimTicket("legacy", ticket))
    }

    @Test
    fun `反馈模块管理员只能查看和管理 manageAreas`() {
        every { authorizationService.canReadFeedback("manager", FeedbackArea.INVENTORY) } returns false
        every { authorizationService.canReadFeedback("manager", FeedbackArea.OPERATOR) } returns true
        every { authorizationService.canManageFeedback("manager", FeedbackArea.OPERATOR) } returns true
        every { authorizationService.canManageFeedback("manager", FeedbackArea.INVENTORY) } returns false
        every { authorizationService.manageableAreasFor("manager") } returns setOf(FeedbackArea.OPERATOR)

        assertFalse(service.canView("manager", FeedbackArea.INVENTORY))
        assertTrue(service.canView("manager", FeedbackArea.OPERATOR))
        assertTrue(service.canManage("manager", FeedbackArea.OPERATOR))
        assertFalse(service.canManage("manager", FeedbackArea.INVENTORY))
        assertEquals(setOf(FeedbackArea.OPERATOR), service.manageableAreas("manager"))
    }

    @Test
    fun `超级管理员可以管理全部模块`() {
        every { authorizationService.canManageFeedback("root", FeedbackArea.LEDGER) } returns true
        every { authorizationService.manageableAreasFor("root") } returns FeedbackArea.all

        assertTrue(service.canManage("root", FeedbackArea.LEDGER))
        assertEquals(FeedbackArea.all, service.manageableAreas("root"))
    }

    @Test
    fun `用户反馈通知接收者使用 manageAreas 管理者集合`() {
        every { authorizationService.managerUserIdsFor(FeedbackArea.OPERATOR) } returns setOf("manager", "root")

        assertEquals(
            setOf("manager", "root"),
            service.managerUserIds(FeedbackArea.OPERATOR),
        )
        verify { authorizationService.managerUserIdsFor(FeedbackArea.OPERATOR) }
    }

    @Test
    fun `新反馈通知排除未激活和不存在用户且保留独立接收授权`() {
        every { repository.findByReceiveAreasContaining(FeedbackArea.OPERATOR) } returns listOf(
            FeedbackAccessGrant(userId = "receiver", receiveAreas = setOf(FeedbackArea.OPERATOR), updatedBy = "root"),
            FeedbackAccessGrant(userId = "disabled", receiveAreas = setOf(FeedbackArea.OPERATOR), updatedBy = "root"),
            FeedbackAccessGrant(userId = "missing", receiveAreas = setOf(FeedbackArea.OPERATOR), updatedBy = "root"),
        )
        every { userService.get("receiver") } returns MaaUserInfo("receiver", "接收者", activated = true)
        every { userService.get("disabled") } returns MaaUserInfo("disabled", "未激活", activated = false)
        every { userService.get("missing") } returns null

        assertEquals(setOf("receiver"), service.receiverUserIds(FeedbackArea.OPERATOR))
        verify(exactly = 0) { authorizationService.canManageFeedback(any(), any()) }
    }

    @Test
    fun `转交候选人只包含当前板块已激活的其他运营`() {
        val ticket =
            FeedbackTicket(
                id = "rpt_1",
                type = "BUG",
                category = "OPERATOR",
                workArea = "STAR",
                workflowStage = FeedbackWorkflow.PROCESSING,
                operatorAssigneeUserId = "owner",
                reporterUserId = "reporter",
                content = "反馈",
            )
        every { tickets.findById("rpt_1") } returns Optional.of(ticket)
        every { authorizationService.hasRole("owner", AdminRole.SUPER_ADMIN) } returns false
        every { authorizationService.operatorAreasFor("owner") } returns setOf("STAR")
        every { authorizationService.superAdminUserIds() } returns setOf("root")
        every { repository.findByOperatorAreasContaining("STAR") } returns listOf(
            FeedbackAccessGrant(userId = "owner", feedbackRoles = setOf("OPERATOR"), operatorAreas = setOf("STAR"), updatedBy = "root"),
            FeedbackAccessGrant(userId = "active", feedbackRoles = setOf("OPERATOR"), operatorAreas = setOf("STAR"), updatedBy = "root"),
            FeedbackAccessGrant(userId = "disabled", feedbackRoles = setOf("OPERATOR"), operatorAreas = setOf("STAR"), updatedBy = "root"),
            FeedbackAccessGrant(
                userId = "developer",
                feedbackRoles = setOf("DEVELOPER"),
                operatorAreas = setOf("STAR"),
                updatedBy = "root",
            ),
        )
        every { userService.get("owner") } returns MaaUserInfo("owner", "原负责人", activated = true)
        every { userService.get("active") } returns MaaUserInfo("active", "新负责人", activated = true)
        every { userService.get("disabled") } returns MaaUserInfo("disabled", "已停用", activated = false)
        every { userService.get("root") } returns MaaUserInfo("root", "超级管理员", activated = true)

        assertEquals(setOf("active", "root"), service.assignees("owner", "rpt_1").map { it.id }.toSet())
        verify(exactly = 0) { ticketQueries.saveIfUnchanged(any(), any()) }
    }

    @Test
    fun `转交候选人拒绝非负责人和已结束工单`() {
        val ticket =
            FeedbackTicket(
                id = "rpt_1",
                type = "BUG",
                category = "OPERATOR",
                workArea = "STAR",
                workflowStage = FeedbackWorkflow.PROCESSING,
                operatorAssigneeUserId = "owner",
                reporterUserId = "reporter",
                content = "反馈",
            )
        every { tickets.findById("rpt_1") } returns Optional.of(ticket)
        every { authorizationService.hasRole("other", AdminRole.SUPER_ADMIN) } returns false

        assertEquals(403, assertThrows(ApiResultException::class.java) { service.assignees("other", "rpt_1") }.statusCode)

        every { tickets.findById("rpt_1") } returns Optional.of(ticket.copy(status = "RESOLVED"))
        every { authorizationService.hasRole("owner", AdminRole.SUPER_ADMIN) } returns true
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.assignees("owner", "rpt_1") }.statusCode)
    }

    @Test
    fun `更新授权分别保存接收与管理模块`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.getRequired("manager") } returns MaaUserInfo("manager", "处理人", activated = true)
        every { userService.get("manager") } returns MaaUserInfo("manager", "处理人", activated = true)
        every { repository.findById("manager") } returns Optional.empty()
        every { repository.save(any()) } answers { firstArg() }

        val response = service.updateGrant(
            "root",
            "manager",
            FeedbackAccessUpdateRequest(
                receiveAreas = setOf(FeedbackArea.INVENTORY),
                manageAreas = setOf(FeedbackArea.OPERATOR),
            ),
        )

        assertEquals(setOf(FeedbackArea.INVENTORY), response.receiveAreas)
        assertEquals(setOf(FeedbackArea.OPERATOR), response.manageAreas)
        verify {
            auditService.record(
                match<AdminAuditLog> {
                    it.action == AdminAuditAction.FEEDBACK_ACCESS_UPDATED &&
                        it.targetUserId == "manager" &&
                        it.before == null &&
                        it.after?.manageAreas == setOf(FeedbackArea.OPERATOR)
                },
            )
        }
    }

    @Test
    fun `撤销运营板块时活动工单返回待接单池`() {
        val oldGrant = FeedbackAccessGrant(
            userId = "manager",
            feedbackRoles = setOf("OPERATOR"),
            operatorAreas = setOf("STAR"),
            updatedBy = "root",
        )
        val assigned = FeedbackTicket(
            id = "rpt_1",
            type = "BUG",
            category = "OPERATOR",
            workArea = "STAR",
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "manager",
            reporterUserId = "reporter",
            content = "反馈",
        )
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.getRequired("manager") } returns MaaUserInfo("manager", "处理人", activated = true)
        every { userService.get("manager") } returns MaaUserInfo("manager", "处理人", activated = true)
        every { repository.findById("manager") } returns Optional.of(oldGrant)
        every { repository.save(any()) } answers { firstArg() }
        every { tickets.findByOperatorAssigneeUserIdAndStatusAndMergedIntoIdIsNull("manager", "OPEN") } returns listOf(assigned)
        every { ticketQueries.saveIfUnchanged(assigned, any()) } answers { secondArg() }

        service.updateGrant("root", "manager", FeedbackAccessUpdateRequest(feedbackRoles = emptySet(), operatorAreas = emptySet()))

        verify {
            ticketQueries.saveIfUnchanged(
                assigned,
                match {
                    it.workflowStage == FeedbackWorkflow.UNASSIGNED && it.operatorAssigneeUserId == null
                },
            )
        }
    }

    @Test
    fun `超级管理员修改程序板块或删除显式授权不退回已接单工单`() {
        val grant = FeedbackAccessGrant(userId = "root", updatedBy = "root")
        val assigned = FeedbackTicket(
            id = "rpt_1",
            type = "BUG",
            workArea = "STAR",
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "root",
            reporterUserId = "reporter",
            content = "反馈",
        )
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { authorizationService.operatorAreasFor("root") } returns FeedbackArea.all
        every { userService.getRequired("root") } returns MaaUserInfo("root", "超级管理员", activated = true)
        every { userService.get("root") } returns MaaUserInfo("root", "超级管理员", activated = true)
        every { repository.findById("root") } returns Optional.of(grant)
        every { repository.save(any()) } answers { firstArg() }
        every { repository.deleteById("root") } returns Unit
        every { tickets.findByOperatorAssigneeUserIdAndStatusAndMergedIntoIdIsNull("root", "OPEN") } returns listOf(assigned)

        service.updateGrant(
            "root",
            "root",
            FeedbackAccessUpdateRequest(
                feedbackRoles = setOf("DEVELOPER"),
                developerAreas = setOf("STAR"),
                operatorAreas = emptySet(),
            ),
        )
        service.deleteGrant("root", "root")

        verify(exactly = 0) { ticketQueries.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { events.save(any()) }
    }

    @Test
    fun `更新授权拒绝未知模块`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.getRequired("manager") } returns MaaUserInfo("manager", "处理人", activated = true)
        every { repository.findById("manager") } returns Optional.empty()

        assertThrows(ApiResultException::class.java) {
            service.updateGrant(
                "root",
                "manager",
                FeedbackAccessUpdateRequest(receiveAreas = setOf("UNKNOWN")),
            )
        }
    }

    @Test
    fun `超级管理员可按用户名或邮箱搜索已激活候选`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.findFeedbackAccessUserByEmail("alice+@example.com") } returns null
        every { userService.searchFeedbackAccessUsers(any(), any()) } returns PageImpl(
            listOf(
                MaaUser(
                    userId = "user-1",
                    userName = "alice",
                    email = "alice@example.com",
                    password = "unused",
                    status = 1,
                ),
            ),
        )

        val candidates = service.searchUserCandidates("root", "alice+@example.com", 1, 10)

        assertEquals(1, candidates.size)
        assertEquals("alice@example.com", candidates.single().email)
        assertTrue(candidates.single().activated)
    }

    @Test
    fun `完整邮箱优先精确匹配并忽略大小写且支持管理员账号`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.findFeedbackAccessUserByEmail("YANGPEIDE0208@GMAIL.COM") } returns MaaUser(
            userId = "user-1",
            userName = "yangpeide",
            email = "yangpeide0208@gmail.com",
            password = "unused",
            status = 2,
        )

        val candidates = service.searchUserCandidates("root", " YANGPEIDE0208@GMAIL.COM ", 1, 10)

        assertEquals("yangpeide", candidates.single().userName)
        assertTrue(candidates.single().activated)
        verify(exactly = 0) { userService.searchFeedbackAccessUsers(any(), any()) }
    }

    @Test
    fun `候选搜索拒绝空关键词和非法分页`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit

        assertThrows(ApiResultException::class.java) {
            service.searchUserCandidates("root", "   ", 1, 10)
        }
        assertThrows(ApiResultException::class.java) {
            service.searchUserCandidates("root", "alice", 0, 10)
        }
        assertThrows(ApiResultException::class.java) {
            service.searchUserCandidates("root", "alice", 1, 11)
        }
    }

    @Test
    fun `更新授权拒绝未激活用户`() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { userService.getRequired("disabled") } returns MaaUserInfo("disabled", "已禁用")

        assertThrows(ApiResultException::class.java) {
            service.updateGrant(
                "root",
                "disabled",
                FeedbackAccessUpdateRequest(receiveAreas = setOf(FeedbackArea.OPERATOR)),
            )
        }
    }

    @Test
    fun `删除反馈授权记录删除前快照审计`() {
        val grant = FeedbackAccessGrant(
            userId = "manager",
            receiveAreas = setOf(FeedbackArea.INVENTORY),
            manageAreas = setOf(FeedbackArea.OPERATOR),
            updatedBy = "root",
        )
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE) } returns Unit
        every { repository.findById("manager") } returns Optional.of(grant)
        every { repository.deleteById("manager") } returns Unit

        service.deleteGrant("root", "manager")

        verify { repository.deleteById("manager") }
        verify {
            auditService.record(
                match<AdminAuditLog> {
                    it.action == AdminAuditAction.FEEDBACK_ACCESS_DELETED &&
                        it.before?.receiveAreas == setOf(FeedbackArea.INVENTORY) &&
                        it.after == null
                },
            )
        }
    }
}
