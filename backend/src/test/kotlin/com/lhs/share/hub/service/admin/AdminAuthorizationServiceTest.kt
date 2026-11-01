package com.lhs.share.hub.service.admin

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.FeedbackAccessGrantRepository
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.hub.repository.entity.FeedbackAccessGrant
import com.lhs.share.hub.service.report.FeedbackArea
import com.lhs.share.hub.service.report.FeedbackCategoryService
import com.lhs.share.service.UserService
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Optional

class AdminAuthorizationServiceTest {
    private val roleRepository = mockk<AdminRoleBindingRepository>()
    private val feedbackRepository = mockk<FeedbackAccessGrantRepository>()
    private val userService = mockk<UserService>()
    private val categories = mockk<FeedbackCategoryService>()
    private val service = AdminAuthorizationService(roleRepository, feedbackRepository, userService, categories, "platform")

    init {
        every { categories.keys() } returns FeedbackArea.all
    }

    @Test
    fun `roadmap features require platform or super admin even with historical usage roles`() {
        for (role in AdminRole.entries) {
            val userId = role.name
            activeUser(userId)
            every { roleRepository.findById(userId) } returns Optional.of(binding(userId, role))
            every { feedbackRepository.findById(userId) } returns Optional.empty()
            assertEquals(
                role in setOf(AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN),
                service.hasPermission(userId, AdminPermission.ARCHIVE_ACCESS),
            )
            assertEquals(
                role in setOf(AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN),
                service.hasPermission(userId, AdminPermission.OPERATOR_PANEL_USE),
            )
            assertEquals(
                role in setOf(AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN),
                service.hasPermission(userId, AdminPermission.OPERATOR_RELATIONSHIP_USE),
            )
            for (permission in listOf(AdminPermission.OPERATOR_RESERVE_USE, AdminPermission.STAR_SCAN_REVIEW)) {
                assertEquals(role in setOf(AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN), service.hasPermission(userId, permission))
            }
            if (role in setOf(AdminRole.ARCHIVE_USER, AdminRole.OPERATOR_PANEL_USER)) {
                assertFalse(service.hasAnyAdminCapability(userId))
                assertFalse(service.hasPermission(userId, AdminPermission.ADMIN_ROLE_MANAGE))
                assertFalse(service.hasPermission(userId, AdminPermission.ACHIEVEMENT_CATALOG_WRITE))
                every { userService.get(userId) } returns MaaUserInfo(userId, "disabled", activated = false)
                assertFalse(service.hasPermission(userId, AdminPermission.ARCHIVE_ACCESS))
                assertFalse(service.hasPermission(userId, AdminPermission.OPERATOR_PANEL_USE))
            }
        }
        activeUser("ordinary")
        every { roleRepository.findById("ordinary") } returns Optional.empty()
        assertFalse(service.hasPermission("ordinary", AdminPermission.ARCHIVE_ACCESS))
        assertFalse(service.hasPermission("ordinary", AdminPermission.OPERATOR_PANEL_USE))
        assertFalse(service.hasPermission("ordinary", AdminPermission.OPERATOR_RELATIONSHIP_USE))
        assertFalse(service.hasPermission("ordinary", AdminPermission.OPERATOR_RESERVE_USE))
        assertFalse(service.hasPermission("ordinary", AdminPermission.STAR_SCAN_REVIEW))
        for (role in listOf(AdminRole.PLATFORM_ADMIN, AdminRole.SUPER_ADMIN)) {
            every { userService.get(role.name) } returns MaaUserInfo(role.name, "disabled", activated = false)
            assertFalse(service.hasPermission(role.name, AdminPermission.ARCHIVE_ACCESS))
            assertFalse(service.hasPermission(role.name, AdminPermission.OPERATOR_PANEL_USE))
            assertFalse(service.hasPermission(role.name, AdminPermission.OPERATOR_RELATIONSHIP_USE))
            assertFalse(service.hasPermission(role.name, AdminPermission.OPERATOR_RESERVE_USE))
            assertFalse(service.hasPermission(role.name, AdminPermission.STAR_SCAN_REVIEW))
        }
    }

    @Test
    fun `平台管理员可维护公共图鉴和开发目标但不能治理角色或审核日志`() {
        activeUser("platform")
        every { roleRepository.findById("platform") } returns Optional.of(binding("platform", AdminRole.PLATFORM_ADMIN))

        assertTrue(service.hasPermission("platform", AdminPermission.LEDGER_CATALOG_WRITE))
        assertTrue(service.hasPermission("platform", AdminPermission.OPERATOR_CATALOG_WRITE))
        assertTrue(service.hasPermission("platform", AdminPermission.RECRUITMENT_CATALOG_WRITE))
        assertTrue(service.hasPermission("platform", AdminPermission.ACHIEVEMENT_CATALOG_WRITE))
        assertTrue(service.hasPermission("platform", AdminPermission.RECRUITMENT_ACCESS_MANAGE))
        assertTrue(service.hasPermission("platform", AdminPermission.LEVEL_CATALOG_WRITE))
        assertTrue(service.hasPermission("platform", AdminPermission.DEVELOPMENT_GOAL_MANAGE))
        assertTrue(service.hasPermission("platform", AdminPermission.ACTIVITY_CALENDAR_WRITE))
        assertFalse(service.hasPermission("platform", AdminPermission.ADMIN_ROLE_MANAGE))
        assertFalse(service.hasPermission("platform", AdminPermission.ADMIN_FEEDBACK_ACCESS_MANAGE))
        assertFalse(service.hasPermission("platform", AdminPermission.CHANGELOG_WRITE))
        assertFalse(service.hasPermission("platform", AdminPermission.CHANGELOG_REVIEW))
    }

    @Test
    fun `超级管理员继承平台和全部反馈权限`() {
        activeUser("root")
        every { roleRepository.findById("root") } returns Optional.of(binding("root", AdminRole.SUPER_ADMIN))

        assertTrue(service.hasPermission("root", AdminPermission.LEDGER_CATALOG_WRITE))
        assertTrue(service.hasPermission("root", AdminPermission.OPERATOR_CATALOG_WRITE))
        assertTrue(service.hasPermission("root", AdminPermission.RECRUITMENT_CATALOG_WRITE))
        assertFalse(service.hasPermission("root", AdminPermission.ACHIEVEMENT_CATALOG_WRITE))
        assertTrue(service.hasPermission("root", AdminPermission.RECRUITMENT_ACCESS_MANAGE))
        assertTrue(service.hasPermission("root", AdminPermission.ADMIN_ROLE_MANAGE))
        assertTrue(service.hasPermission("root", AdminPermission.CHANGELOG_WRITE))
        assertTrue(service.hasPermission("root", AdminPermission.CHANGELOG_REVIEW))
        assertTrue(service.hasPermission("root", AdminPermission.DEVELOPMENT_GOAL_MANAGE))
        assertTrue(service.hasPermission("root", AdminPermission.ACTIVITY_CALENDAR_WRITE))
        assertEquals(FeedbackArea.all, service.manageableAreasFor("root"))
    }

    @Test
    fun `超级管理员自动获得新板块的管理和岗位权限`() {
        activeUser("root")
        every { roleRepository.findById("root") } returns Optional.of(binding("root", AdminRole.SUPER_ADMIN))
        every { categories.keys() } returns FeedbackArea.all + "CUSTOM_TEST"

        assertTrue("CUSTOM_TEST" in service.manageableAreasFor("root"))
        assertTrue("CUSTOM_TEST" in service.operatorAreasFor("root"))
        assertTrue("CUSTOM_TEST" in service.developerAreasFor("root"))
    }

    @Test
    fun `新增日历不扩大普通管理员范围日历维护角色不授予反馈权限`() {
        for (userId in listOf("user", "operator", "platform", "calendar")) {
            activeUser(userId)
            every { roleRepository.findById(userId) } returns
                if (userId == "platform") Optional.of(binding(userId, AdminRole.PLATFORM_ADMIN)) else Optional.empty()
            val areas = if (userId ==
                "calendar"
            ) {
                setOf(FeedbackArea.CALENDAR)
            } else if (userId == "operator") {
                setOf(FeedbackArea.OPERATOR)
            } else {
                emptySet()
            }
            every { feedbackRepository.findById(userId) } returns Optional.of(
                FeedbackAccessGrant(
                    userId,
                    manageAreas = areas,
                    feedbackRoles = setOf("OPERATOR"),
                    operatorAreas = areas,
                    updatedBy = "root",
                ),
            )
            assertEquals(userId == "calendar", service.canReadFeedback(userId, FeedbackArea.CALENDAR))
            assertEquals(userId == "calendar", service.canManageFeedback(userId, FeedbackArea.CALENDAR))
            assertEquals(areas, service.operatorAreasFor(userId))
            assertTrue(service.developerAreasFor(userId).isEmpty())
        }
    }

    @Test
    fun `更新日志编辑和审核角色彼此隔离`() {
        activeUser("editor")
        activeUser("reviewer")
        every { roleRepository.findById("editor") } returns Optional.of(binding("editor", AdminRole.CHANGELOG_EDITOR))
        every { roleRepository.findById("reviewer") } returns Optional.of(binding("reviewer", AdminRole.CHANGELOG_REVIEWER))

        assertTrue(service.hasPermission("editor", AdminPermission.CHANGELOG_WRITE))
        assertFalse(service.hasPermission("editor", AdminPermission.LEDGER_CATALOG_WRITE))
        assertFalse(service.hasPermission("editor", AdminPermission.CHANGELOG_REVIEW))
        assertFalse(service.hasPermission("editor", AdminPermission.DEVELOPMENT_GOAL_MANAGE))
        assertTrue(service.hasPermission("reviewer", AdminPermission.CHANGELOG_REVIEW))
        assertFalse(service.hasPermission("reviewer", AdminPermission.CHANGELOG_WRITE))
    }

    @Test
    fun `反馈消息通知只发送给对应 manageAreas 的激活管理员`() {
        activeUser("manager")
        activeUser("root")
        every { userService.get("disabled") } returns MaaUserInfo("disabled", "禁用用户", activated = false)
        every { userService.get("disabled-root") } returns MaaUserInfo("disabled-root", "禁用超级管理员", activated = false)
        every { feedbackRepository.findByManageAreasContaining(FeedbackArea.OPERATOR) } returns listOf(
            FeedbackAccessGrant("manager", manageAreas = setOf(FeedbackArea.OPERATOR), updatedBy = "root"),
            FeedbackAccessGrant("disabled", manageAreas = setOf(FeedbackArea.OPERATOR), updatedBy = "root"),
        )
        every { roleRepository.findByRolesContaining(AdminRole.SUPER_ADMIN) } returns listOf(
            binding("root", AdminRole.SUPER_ADMIN),
            binding("disabled-root", AdminRole.SUPER_ADMIN),
        )

        assertEquals(
            setOf("manager", "root"),
            service.managerUserIdsFor(FeedbackArea.OPERATOR),
        )
        assertEquals(setOf("root"), service.superAdminUserIds())
    }

    @Test
    fun `任何管理角色或反馈管理授权都视为管理员能力`() {
        activeUser("platform")
        activeUser("feedback-manager")
        activeUser("receiver")
        every { roleRepository.findById("platform") } returns Optional.of(binding("platform", AdminRole.PLATFORM_ADMIN))
        every { roleRepository.findById("feedback-manager") } returns Optional.empty()
        every { roleRepository.findById("receiver") } returns Optional.empty()
        every { feedbackRepository.findById("feedback-manager") } returns Optional.of(
            FeedbackAccessGrant(
                userId = "feedback-manager",
                manageAreas = setOf(FeedbackArea.INVENTORY),
                updatedBy = "root",
            ),
        )
        every { feedbackRepository.findById("receiver") } returns Optional.of(
            FeedbackAccessGrant(
                userId = "receiver",
                receiveAreas = setOf(FeedbackArea.INVENTORY),
                updatedBy = "root",
            ),
        )

        assertTrue(service.hasAnyAdminCapability("platform"))
        assertTrue(service.hasAnyAdminCapability("feedback-manager"))
        assertFalse(service.hasAnyAdminCapability("receiver"))
    }

    @Test
    fun `receiveAreas 只接收通知不能读取工单`() {
        activeUser("receiver")
        every { roleRepository.findById("receiver") } returns Optional.empty()
        every { feedbackRepository.findById("receiver") } returns Optional.of(
            FeedbackAccessGrant(
                userId = "receiver",
                receiveAreas = setOf(FeedbackArea.INVENTORY),
                updatedBy = "root",
            ),
        )

        assertFalse(service.canReadFeedback("receiver", FeedbackArea.INVENTORY))
    }

    @Test
    fun `禁用账号的角色绑定立即失效`() {
        every { userService.get("disabled") } returns MaaUserInfo("disabled", "禁用用户", activated = false)

        assertFalse(service.hasPermission("disabled", AdminPermission.OPERATOR_CATALOG_WRITE))
        assertEquals(emptySet<String>(), service.manageableAreasFor("disabled"))
    }

    @Test
    fun `活动日历编辑员仅拥有日历写权限且停用后失效`() {
        activeUser("calendar")
        every { roleRepository.findById("calendar") } returns Optional.of(binding("calendar", AdminRole.ACTIVITY_CALENDAR_EDITOR))
        every { feedbackRepository.findById("calendar") } returns Optional.empty()

        assertTrue(service.hasAnyAdminCapability("calendar"))
        AdminPermission.entries.forEach { permission ->
            assertEquals(permission == AdminPermission.ACTIVITY_CALENDAR_WRITE, service.hasPermission("calendar", permission))
        }
        assertEquals(setOf("activity_calendar:write"), service.permissionsFor("calendar"))
        assertEquals(emptySet<String>(), service.manageableAreasFor("calendar"))
        every { userService.get("calendar") } returns MaaUserInfo("calendar", "calendar", activated = false)
        assertFalse(service.hasPermission("calendar", AdminPermission.ACTIVITY_CALENDAR_WRITE))
        assertFalse(service.hasAnyAdminCapability("calendar"))
    }

    private fun activeUser(userId: String) {
        every { userService.get(userId) } returns MaaUserInfo(userId, userId, activated = true)
    }

    private fun binding(userId: String, role: AdminRole) = AdminRoleBinding(
        userId = userId,
        roles = setOf(role),
        grantedBy = "seed",
        grantedAt = Instant.EPOCH,
        updatedBy = "seed",
        updatedAt = Instant.EPOCH,
    )

    @Test
    fun `archive catalog owner must be configured activated and an administrator`() {
        activeUser("platform")
        every { roleRepository.findById("platform") } returns Optional.of(binding("platform", AdminRole.PLATFORM_ADMIN))
        val missingOwner = AdminAuthorizationService(roleRepository, feedbackRepository, userService, categories)
        for (permission in listOf(AdminPermission.ACHIEVEMENT_CATALOG_WRITE, AdminPermission.BOND_CATALOG_WRITE)) {
            assertFalse(missingOwner.hasPermission("platform", permission))
            assertTrue(service.hasPermission("platform", permission))
            activeUser("root")
            every { roleRepository.findById("root") } returns Optional.of(binding("root", AdminRole.SUPER_ADMIN))
            assertFalse(service.hasPermission("root", permission))
        }
        every { userService.get("platform") } returns MaaUserInfo("platform", "disabled", activated = false)
        assertFalse(service.hasPermission("platform", AdminPermission.ACHIEVEMENT_CATALOG_WRITE))
    }
}
