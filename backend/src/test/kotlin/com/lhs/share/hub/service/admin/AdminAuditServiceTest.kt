package com.lhs.share.hub.service.admin

import com.lhs.share.hub.repository.AdminAuditLogRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import java.time.Instant

class AdminAuditServiceTest {
    private val repository = mockk<AdminAuditLogRepository>()
    private val authorizationService = mockk<AdminAuthorizationService>()
    private val service = AdminAuditService(repository, authorizationService)

    @Test
    fun `超级管理员可以分页读取审计记录`() {
        val occurredAt = Instant.parse("2026-08-30T00:00:00Z")
        every { authorizationService.requirePermission("root", AdminPermission.ADMIN_AUDIT_READ) } returns Unit
        every { repository.findAll(any<org.springframework.data.domain.Pageable>()) } returns PageImpl(
            listOf(
                AdminAuditLog(
                    id = "audit-1",
                    actorUserId = "root",
                    action = AdminAuditAction.ROLE_GRANTED,
                    targetUserId = "target",
                    occurredAt = occurredAt,
                ),
            ),
            PageRequest.of(0, 20),
            1,
        )

        val result = service.list("root", page = 1, size = 20)

        assertEquals(1, result.total)
        assertEquals("ROLE_GRANTED", result.data.single().action)
        verify { authorizationService.requirePermission("root", AdminPermission.ADMIN_AUDIT_READ) }
    }
}
