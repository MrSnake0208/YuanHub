package com.lhs.share.hub.service.beta

import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import com.lhs.share.openapi.OpenApiPermission
import com.lhs.share.openapi.OpenApiTokenService
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant

class BetaOpenApiGateTest {
    private val tokens = mockk<OpenApiTokenRepository> { every { findByToken(any()) } returns null }
    private val accounts = mockk<SubAccountRepository>()
    private val beta = mockk<BetaService>()
    private val service = OpenApiTokenService(tokens, accounts, mockk(), beta)
    private fun deny() = BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join beta first")

    @Test
    fun `Persistent token and no-scope account lookup apply exactly the same gate`() {
        every { tokens.findFirstByTokenIn(any()) } returns OpenApiToken(
            id = "token",
            userId = "u",
            accountId = "a",
            token = "valid",
            scope = listOf(10001),
            remark = null,
            createTime = Instant.EPOCH,
        )
        every { beta.requireAccess("u") } throws deny()
        assertThrows(BetaApiException::class.java) { service.authenticateAuthorization("Bearer valid") }
        every { beta.requireAccess("u") } just runs
        assertEquals("u", service.authenticateAuthorization("Bearer valid").userId)
        verify(exactly = 2) { beta.requireAccess("u") }
    }

    @Test
    fun `beta does not replace token authentication or required scopes`() {
        assertThrows(InventoryApiException::class.java) { service.authenticateAuthorization(null) }
        every { tokens.findFirstByTokenIn(any()) } returns
            OpenApiToken(userId = "u", accountId = "a", token = "valid", scope = emptyList(), remark = null)
        assertThrows(InventoryApiException::class.java) { service.validateAuthorization("Bearer valid", OpenApiPermission.INVENTORY_READ) }
        verify(exactly = 0) { beta.requireAccess(any()) }
    }

    @Test
    fun `account SSE accepts beta or recruitment access and closes when both disappear`() {
        val recruitmentAccess = mockk<RecruitmentAccessService>()
        every { beta.requireAccess("u") } throws deny()
        every { recruitmentAccess.canAccess("u") } returns true
        val events = AccountEventService(beta, recruitmentAccess)
        val emitter = mockk<SseEmitter>(relaxed = true)
        events.register("u", "a", emitter)
        clearMocks(emitter, answers = false)

        events.publish("u", "a", "account-data", "id", mapOf("value" to 42))
        events.keepAlive()
        verify(exactly = 2) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 0) { emitter.complete() }

        clearMocks(emitter, answers = false)
        every { recruitmentAccess.canAccess("u") } returns false
        events.publish("u", "a", "blocked", "id-2", emptyMap<String, Any>())
        verify(exactly = 1) { emitter.complete() }
        verify(exactly = 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
    }
}
