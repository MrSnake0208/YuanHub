package com.lhs.share.hub.service.report

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.request.FeedbackMessageAppendRequest
import com.lhs.share.hub.controller.report.request.FeedbackStatusUpdateRequest
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.FeedbackAccessGrantRepository
import com.lhs.share.hub.repository.FeedbackCategoryCatalogRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.hub.repository.entity.FeedbackAccessGrant
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackCategoryCatalog
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.admin.AdminAuthorizationService
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

class FeedbackSpaceIsolationTest {
    private val catalogRepository = mockk<FeedbackCategoryCatalogRepository>()
    private val categories = FeedbackCategoryService(catalogRepository)
    private val grants = mockk<FeedbackAccessGrantRepository>()
    private val roles = mockk<AdminRoleBindingRepository>()
    private val users = mockk<UserService>()
    private val authorization = AdminAuthorizationService(roles, grants, users, categories)
    private val tickets = mockk<FeedbackTicketRepository>()
    private val queries = mockk<FeedbackTicketQueryRepository>(relaxed = true)
    private val access =
        FeedbackAccessService(
            grants, users, authorization,
            mockk(
                relaxed = true,
            ),
            tickets, queries, mockk(relaxed = true), mockk(relaxed = true), categories,
        )
    private val reports =
        FeedbackReportService(
            tickets, queries, access, mockk(),
            mockk(
                relaxed = true,
            ),
            mockk(relaxed = true), ShareProperties(), mockk(relaxed = true), categories,
        )
    private val workflow =
        FeedbackWorkflowService(tickets, queries, mockk(relaxed = true), access, mockk(relaxed = true), categories, mockk(relaxed = true))
    private val a =
        FeedbackTicket(
            id = "a",
            type = "BUG",
            category = "CUSTOM_A",
            area = "CUSTOM_A",
            workArea = "CUSTOM_A",
            spaceId = "partner-a",
            reporterUserId = "reporter",
            content = "private A",
        )
    private val b = a.copy(id = "b", spaceId = "partner-b", category = "CUSTOM_B", area = "CUSTOM_B", workArea = "CUSTOM_B")

    init {
        every { catalogRepository.findById("feedback") } returns Optional.of(
            FeedbackCategoryCatalog(
                categories = FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) } +
                    listOf(
                        FeedbackCategory("CUSTOM_A", "使用问题", spaceId = "partner-a"),
                        FeedbackCategory("CUSTOM_B", "使用问题", spaceId = "partner-b"),
                    ),
                spaces = listOf(
                    FeedbackSpace("yuanhub", "YuanHub"),
                    FeedbackSpace("partner-a", "平台 A"),
                    FeedbackSpace("partner-b", "平台 B"),
                ),
            ),
        )
        every { users.get(any()) } returns mockk { every { activated } returns true }
        every { roles.findById(any()) } returns Optional.empty()
        every { roles.findById("root") } returns
            Optional.of(
                AdminRoleBinding(
                    userId = "root",
                    roles = setOf(AdminRole.SUPER_ADMIN),
                    grantedBy = "root",
                    grantedAt = java.time.Instant.EPOCH,
                    updatedBy = "root",
                    updatedAt = java.time.Instant.EPOCH,
                ),
            )
        every { grants.findById(any()) } returns Optional.empty()
        every { grants.findById("a-admin") } returns
            Optional.of(
                FeedbackAccessGrant("a-admin", feedbackRoles = setOf("OPERATOR"), operatorAreas = setOf("CUSTOM_A"), updatedBy = "root"),
            )
        every { grants.findById("developer") } returns
            Optional.of(
                FeedbackAccessGrant(
                    "developer",
                    feedbackRoles = setOf("DEVELOPER"),
                    developerAreas = setOf("CUSTOM_A"),
                    updatedBy = "root",
                ),
            )
        every { tickets.findById("a") } returns Optional.of(a)
        every { tickets.findById("b") } returns Optional.of(b)
    }

    @Test
    fun `真实岗位授权隔离专区且不会从旧麻圆板块推断合作方`() {
        assertEquals(listOf("partner-a"), access.manageableSpaces("a-admin").map { it.id })
        assertTrue(access.canViewTicket("a-admin", a))
        assertTrue(access.canClaimTicket("a-admin", a))
        assertFalse(access.canViewTicket("a-admin", b))
        assertFalse(access.canClaimTicket("a-admin", b))
        assertFalse(access.canControlTicket("a-admin", b.copy(operatorAssigneeUserId = "a-admin")))
        assertFalse(access.canViewTicket("a-admin", a.copy(spaceId = null)))
        assertEquals("yuanhub", FeedbackSpaces.id(a.copy(spaceId = null, category = "MAAYUAN")))
        assertTrue(access.canViewTicket("root", b))
        assertEquals(setOf("yuanhub", "partner-a", "partner-b"), access.querySpaces("root", "all"))
        assertEquals(403, assertThrows(ApiResultException::class.java) { access.querySpaces("a-admin", "partner-b") }.statusCode)
    }

    @Test
    fun `改工单编号不能越权读取附件消息或写入状态及内部流转`() {
        val denied: List<() -> Any?> = listOf(
            { reports.getById("a-admin", "b", adminMode = true) },
            { reports.getAttachment("a-admin", "b", "media-b") },
            { reports.appendMessage("a-admin", "b", FeedbackMessageAppendRequest(content = "reply", actorMode = "ADMIN")) },
            {
                reports.updateStatus(
                    "a-admin",
                    "b",
                    FeedbackStatusUpdateRequest(status = "DISMISSED", actorMode = "ADMIN", reason = "test"),
                )
            },
            { workflow.claim("a-admin", "b") },
            { workflow.events("a-admin", "b") },
            { workflow.markRead("a-admin", "b", "message") },
        )
        denied.forEach { operation -> assertEquals(403, assertThrows(ApiResultException::class.java) { operation() }.statusCode) }
        verify(exactly = 0) { queries.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { queries.advanceTeamRead(any(), any()) }
    }

    @Test
    fun `专区不提升程序岗权限且板块不可跨专区调整`() {
        assertFalse(access.canViewTicket("developer", a))
        assertTrue(access.canViewTicket("developer", a.copy(workflowStage = FeedbackWorkflow.DEV_HANDOFF)))
        assertFalse(access.canControlTicket("developer", a.copy(operatorAssigneeUserId = "developer")))
        assertFalse(access.canClaimTicket("developer", a))
        every { tickets.findById("a") } returns
            Optional.of(a.copy(workflowStage = FeedbackWorkflow.PROCESSING, operatorAssigneeUserId = "root"))
        assertEquals(
            400,
            assertThrows(ApiResultException::class.java) {
                workflow.changeArea("root", "a", "CUSTOM_B", "wrong space")
            }.statusCode,
        )
        assertEquals(400, assertThrows(ApiResultException::class.java) { categories.requireInSpace("CUSTOM_A", "partner-b") }.statusCode)
        verify(exactly = 0) { queries.saveIfUnchanged(any(), any()) }
    }

    @Test
    fun `队列搜索和统计请求将授权专区传入数据库且拒绝其他专区筛选`() {
        every { queries.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            PageImpl(emptyList())
        reports.list("a-admin", 1, 1, null, null, null, null, false, null, "secret", "updatedAt", "desc", "ALL", "partner-a")
        val knownAreas = categories.keys()
        verify {
            queries.search(
                null, null, null, null, null, "secret", any(),
                setOf(
                    "CUSTOM_A",
                ),
                "ALL", "a-admin", emptySet(), knownAreas, setOf("partner-a"),
            )
        }
        assertEquals(
            403,
            assertThrows(ApiResultException::class.java) {
                reports.list("a-admin", 1, 1, null, null, null, null, false, null, null, "updatedAt", "desc", "ALL", "partner-b")
            }.statusCode,
        )
    }
}
