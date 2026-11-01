package com.lhs.share.openapi.integration

import com.lhs.share.hub.repository.IntegrationTokenRepository
import com.lhs.share.hub.repository.entity.IntegrationToken
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.report.FeedbackCategoryService
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class IntegrationTokenServiceTest {
    private val repository = mockk<IntegrationTokenRepository>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val categories = mockk<FeedbackCategoryService>()
    private val service = IntegrationTokenService(repository, authorization, categories)

    @Test
    fun `creation returns plaintext once and persists only its digest`() {
        every { authorization.hasAnyAdminCapability("admin") } returns true
        every { categories.keys() } returns setOf("UI", "STAR")
        val saved = slot<IntegrationToken>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val response = service.create(
            ownerUserId = "admin",
            name = "WebCodex Feedback",
            scopes = listOf("feedback:read", "feedback:analysis:write"),
            feedbackAreas = setOf("ui"),
            expiresAt = Instant.parse("2099-01-01T00:00:00Z"),
        )

        assertTrue(response.token.startsWith("yhi_"))
        assertNotEquals(response.token, saved.captured.tokenHash)
        assertEquals(64, saved.captured.tokenHash.length)
        assertEquals(setOf("feedback:read", "feedback:analysis:write"), saved.captured.scopes)
        assertEquals(setOf("UI"), saved.captured.feedbackAreas)
        assertFalse(saved.captured.toString().contains(response.token))
    }

    @Test
    fun `valid bearer requires scope and returns bounded principal`() {
        every { authorization.hasAnyAdminCapability("admin") } returns true
        val hash = slot<String>()
        every { repository.findByTokenHash(capture(hash)) } returns token(scopes = setOf("feedback:read"), feedbackAreas = setOf("UI"))

        val principal = service.validateAuthorization("Bearer yhi_secret", IntegrationScope.FEEDBACK_READ)

        assertEquals("int_test", principal.tokenId)
        assertEquals("admin", principal.ownerUserId)
        assertEquals(setOf("UI"), principal.feedbackAreas)
        assertNotEquals("yhi_secret", hash.captured)
        assertEquals(64, hash.captured.length)
        verify(exactly = 1) { repository.touchLastUsedAt("int_test", any()) }
    }

    @Test
    fun `missing malformed and unknown bearer credentials are rejected as unauthorized`() {
        for (authorizationHeader in listOf(null, "", "secret", "Basic secret", "Bearer ")) {
            val error = assertThrows(IntegrationApiException::class.java) {
                service.validateAuthorization(authorizationHeader, IntegrationScope.FEEDBACK_READ)
            }
            assertEquals(401, error.status.value())
            assertEquals("integration_token_missing", error.code)
        }

        every { repository.findByTokenHash(any()) } returns null
        val invalid = assertThrows(IntegrationApiException::class.java) {
            service.validateAuthorization("Bearer yhi_unknown", IntegrationScope.FEEDBACK_READ)
        }
        assertEquals(401, invalid.status.value())
        assertEquals("integration_token_invalid", invalid.code)
    }

    @Test
    fun `revoked expired and under scoped credentials are rejected`() {
        every { authorization.hasAnyAdminCapability("admin") } returns true

        every { repository.findByTokenHash(any()) } returns token(enabled = false, revokedAt = Instant.now())
        val revoked = assertThrows(IntegrationApiException::class.java) {
            service.validateAuthorization("Bearer revoked", IntegrationScope.FEEDBACK_READ)
        }
        assertEquals(401, revoked.status.value())
        assertEquals("integration_token_revoked", revoked.code)

        every { repository.findByTokenHash(any()) } returns token(expiresAt = Instant.parse("2000-01-01T00:00:00Z"))
        val expired = assertThrows(IntegrationApiException::class.java) {
            service.validateAuthorization("Bearer expired", IntegrationScope.FEEDBACK_READ)
        }
        assertEquals(401, expired.status.value())
        assertEquals("integration_token_expired", expired.code)

        every { repository.findByTokenHash(any()) } returns token(scopes = setOf("feedback:read"))
        val missingScope = assertThrows(IntegrationApiException::class.java) {
            service.validateAuthorization("Bearer read-only", IntegrationScope.FEEDBACK_ANALYSIS_WRITE)
        }
        assertEquals(403, missingScope.status.value())
        assertEquals("integration_scope_missing", missingScope.code)
    }

    @Test
    fun `owner permission revocation blocks an otherwise valid token immediately`() {
        every { repository.findByTokenHash(any()) } returns token(scopes = setOf("feedback:read"))
        every { authorization.hasAnyAdminCapability("admin") } returns false

        val error = assertThrows(IntegrationApiException::class.java) {
            service.validateAuthorization("Bearer valid", IntegrationScope.FEEDBACK_READ)
        }

        assertEquals(403, error.status.value())
        assertEquals("integration_owner_forbidden", error.code)
    }

    @Test
    fun `owner can revoke after admin permission was removed and record stays auditable`() {
        val current = token()
        every { authorization.hasAnyAdminCapability("admin") } returns false
        every { repository.findByIdAndOwnerUserId("int_test", "admin") } returns current
        val saved = slot<IntegrationToken>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val response = service.revoke("admin", "int_test")

        assertFalse(response.enabled)
        assertFalse(saved.captured.enabled)
        assertTrue(saved.captured.revokedAt != null)
        verify(exactly = 0) { repository.delete(any()) }
        verify(exactly = 0) { authorization.hasAnyAdminCapability(any()) }
    }

    @Test
    fun `user without admin capability cannot create integration token`() {
        every { authorization.hasAnyAdminCapability("user") } returns false

        val error = assertThrows(IntegrationApiException::class.java) {
            service.create("user", "agent", listOf("feedback:read"), null, null)
        }

        assertEquals(403, error.status.value())
        assertEquals("integration_admin_required", error.code)
        verify(exactly = 0) { repository.save(any()) }
    }

    private fun token(
        scopes: Set<String> = setOf("feedback:read", "feedback:analysis:write"),
        feedbackAreas: Set<String>? = null,
        enabled: Boolean = true,
        expiresAt: Instant? = null,
        revokedAt: Instant? = null,
    ) = IntegrationToken(
        id = "int_test",
        ownerUserId = "admin",
        name = "WebCodex",
        tokenHash = "a".repeat(64),
        scopes = scopes,
        feedbackAreas = feedbackAreas,
        enabled = enabled,
        createdAt = Instant.parse("2026-10-02T00:00:00Z"),
        expiresAt = expiresAt,
        revokedAt = revokedAt,
    )
}
