package com.lhs.share.hub.service.recruitment

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.RecruitmentAccessConfigRepository
import com.lhs.share.hub.repository.RecruitmentAccessGrantRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.RecruitmentAccessConfig
import com.lhs.share.hub.repository.entity.RecruitmentAccessGrant
import com.lhs.share.hub.repository.entity.RecruitmentAccessMode
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.service.UserService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Optional

class RecruitmentAccessServiceTest {
    private val configs = mockk<RecruitmentAccessConfigRepository>()
    private val grants = mockk<RecruitmentAccessGrantRepository>()
    private val users = mockk<UserService>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val audit = mockk<AdminAuditService>()
    private var configState: RecruitmentAccessConfig? = null
    private val grantState = linkedMapOf<String, RecruitmentAccessGrant>()
    private val service = RecruitmentAccessService(configs, grants, users, authorization, audit)

    init {
        every { configs.findById("recruitment") } answers { Optional.ofNullable(configState) }
        every { configs.save(any()) } answers {
            val next = firstArg<RecruitmentAccessConfig>()
            val saved = next.copy(version = (configState?.version ?: -1L) + 1)
            configState = saved
            saved
        }
        every { grants.existsById(any()) } answers { grantState.containsKey(firstArg()) }
        every { grants.findById(any()) } answers { Optional.ofNullable(grantState[firstArg()]) }
        every { grants.findAll() } answers { grantState.values.toList() }
        every { grants.save(any()) } answers {
            firstArg<RecruitmentAccessGrant>().also { grantState[it.userId] = it }
        }
        every { grants.deleteById(any()) } answers {
            grantState.remove(firstArg())
            Unit
        }
        every { users.get("u") } returns MaaUserInfo("u", "测试用户", true)
        every { users.get("other") } returns MaaUserInfo("other", "公开用户", true)
        every { authorization.hasPermission("admin", AdminPermission.RECRUITMENT_ACCESS_MANAGE) } returns true
        every { authorization.hasPermission("viewer", AdminPermission.RECRUITMENT_ACCESS_MANAGE) } returns false
        every { audit.record(any()) } answers { firstArg() }
    }

    @Test
    fun defaultLimitedModeRequiresExplicitGrant() {
        val mine = service.me("u")
        assertEquals(RecruitmentAccessMode.LIMITED, mine.accessMode)
        assertFalse(mine.granted)
        assertFalse(mine.canAccess)
        assertEquals(
            "recruitment_access_required",
            assertThrows(RecruitmentApiException::class.java) { service.requireAccess("u") }.code,
        )

        val granted = service.grant("admin", "u")
        assertEquals("u", granted.userId)
        assertTrue(service.me("u").canAccess)
        service.requireAccess("u")
        verify { audit.record(match { it.action == AdminAuditAction.RECRUITMENT_ACCESS_GRANTED && it.targetUserId == "u" }) }

        service.revoke("admin", "u")
        assertFalse(service.me("u").canAccess)
        verify { audit.record(match { it.action == AdminAuditAction.RECRUITMENT_ACCESS_REVOKED && it.targetUserId == "u" }) }
    }

    @Test
    fun publicModeAllowsActiveUsersAndKeepsLimitedList() {
        service.grant("admin", "u")
        val result = service.setMode("admin", RecruitmentAccessMode.PUBLIC, 0)

        assertEquals(RecruitmentAccessMode.PUBLIC, result.accessMode)
        assertEquals(listOf("u"), result.grants.map { it.userId })
        assertTrue(service.me("other").canAccess)
        service.requireAccess("other")
        verify { audit.record(match { it.action == AdminAuditAction.RECRUITMENT_ACCESS_MODE_UPDATED }) }
    }

    @Test
    fun administrationRequiresPermissionAndModeUsesCas() {
        assertEquals(
            "forbidden",
            assertThrows(RecruitmentApiException::class.java) { service.admin("viewer") }.code,
        )
        service.setMode("admin", RecruitmentAccessMode.PUBLIC, 0)
        assertEquals(
            "recruitment_access_conflict",
            assertThrows(RecruitmentApiException::class.java) {
                service.setMode("admin", RecruitmentAccessMode.LIMITED, 0)
            }.code,
        )
    }
}
