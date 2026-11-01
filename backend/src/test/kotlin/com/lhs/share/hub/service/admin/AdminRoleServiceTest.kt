package com.lhs.share.hub.service.admin

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.controller.admin.request.AdminRoleUpdateRequest
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.service.UserService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Optional

class AdminRoleServiceTest {
    private val repository = mockk<AdminRoleBindingRepository>()
    private val userService = mockk<UserService>()
    private val authorizationService = mockk<AdminAuthorizationService>()
    private val auditService = mockk<AdminAuditService>()
    private val service = AdminRoleService(repository, userService, authorizationService, auditService)

    @Test
    fun `超级管理员可以覆盖已激活用户角色并写审计`() {
        allowRoleManagement()
        every { userService.getRequired("target") } returns MaaUserInfo("target", "目标用户", activated = true)
        every { repository.findById("target") } returns Optional.empty()
        every { repository.save(any()) } answers { firstArg() }
        every { auditService.record(any()) } answers { firstArg() }

        val result = service.replaceRoles(
            "root",
            "target",
            AdminRoleUpdateRequest(setOf("PLATFORM_ADMIN")),
        )

        assertEquals(setOf("PLATFORM_ADMIN"), result.roles)
        verify { auditService.record(match<AdminAuditLog> { it.targetUserId == "target" }) }
    }

    @Test
    fun `不能降级最后一名可用超级管理员`() {
        allowRoleManagement()
        val rootBinding = binding("root", AdminRole.SUPER_ADMIN)
        every { userService.getRequired("root") } returns MaaUserInfo("root", "root", activated = true)
        every { repository.findById("root") } returns Optional.of(rootBinding)
        every { repository.findByRolesContaining(AdminRole.SUPER_ADMIN) } returns listOf(rootBinding)
        every { userService.get("root") } returns MaaUserInfo("root", "root", activated = true)

        val ex = assertThrows(ApiResultException::class.java) {
            service.replaceRoles("root", "root", AdminRoleUpdateRequest(emptySet()))
        }

        assertEquals(409, ex.statusCode)
        verify(exactly = 0) { repository.deleteById(any()) }
        verify(exactly = 0) { auditService.record(any()) }
    }

    @Test
    fun `不能为未激活用户授予角色`() {
        allowRoleManagement()
        every { userService.getRequired("disabled") } returns MaaUserInfo("disabled", "disabled", activated = false)

        val ex = assertThrows(ApiResultException::class.java) {
            service.replaceRoles("root", "disabled", AdminRoleUpdateRequest(setOf("PLATFORM_ADMIN")))
        }

        assertEquals(400, ex.statusCode)
    }

    @Test
    fun `可以清理未激活用户的旧角色绑定`() {
        allowRoleManagement()
        val oldBinding = binding("disabled", AdminRole.PLATFORM_ADMIN)
        every { userService.getRequired("disabled") } returns MaaUserInfo("disabled", "disabled", activated = false)
        every { repository.findById("disabled") } returns Optional.of(oldBinding)
        every { repository.deleteById("disabled") } returns Unit
        every { auditService.record(any()) } answers { firstArg() }

        val result = service.replaceRoles("root", "disabled", AdminRoleUpdateRequest(emptySet()))

        assertEquals(emptySet<String>(), result.roles)
        assertEquals(false, result.activated)
        verify { repository.deleteById("disabled") }
    }

    private fun allowRoleManagement() {
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_ROLE_MANAGE) } returns Unit
    }

    private fun binding(userId: String, role: AdminRole) = AdminRoleBinding(
        userId = userId,
        roles = setOf(role),
        grantedBy = "seed",
        grantedAt = Instant.EPOCH,
        updatedBy = "seed",
        updatedAt = Instant.EPOCH,
    )
}
