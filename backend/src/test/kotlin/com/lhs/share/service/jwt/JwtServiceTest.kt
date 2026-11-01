package com.lhs.share.service.jwt

import com.lhs.share.config.external.ShareProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class JwtServiceTest {
    private val properties = ShareProperties().apply {
        jwt.secret = "test-secret-test-secret-test-secret-test-secret"
    }
    private val jwtService = JwtService(properties)

    @Test
    fun `auth token 签发与验证`() {
        val token = jwtService.issueAuthToken("user-1", null, emptyList())

        val parsed = jwtService.verifyAndParseAuthToken(token.value)

        assertEquals("user-1", parsed.subject)
        assertEquals(true, parsed.isAuthenticated)
    }

    @Test
    fun `refresh token 签发与验证`() {
        val token = jwtService.issueRefreshToken("user-1", null)

        val parsed = jwtService.verifyAndParseRefreshToken(token.value)

        assertEquals("user-1", parsed.subject)
    }

    @Test
    fun `格式错误的 refresh token 抛出 JwtInvalidException`() {
        assertThrows(JwtInvalidException::class.java) {
            jwtService.verifyAndParseRefreshToken("invalid")
        }
    }

    @Test
    fun `伪造 token 抛出 JwtInvalidException`() {
        val token = jwtService.issueAuthToken("user-1", null, emptyList())
        val tampered = token.value.dropLast(4) + "xxxx"

        assertThrows(JwtInvalidException::class.java) {
            jwtService.verifyAndParseAuthToken(tampered)
        }
    }

    @Test
    fun `过期 token 抛出 JwtExpiredException`() {
        val now = Instant.now().minusSeconds(7200)
        val expired = JwtAuthToken(
            "user-1",
            null,
            now,
            now.plusSeconds(1),
            now,
            emptyList(),
            properties.jwt.secret.toByteArray(),
        )

        assertThrows(JwtExpiredException::class.java) {
            jwtService.verifyAndParseAuthToken(expired.value)
        }
    }
}
