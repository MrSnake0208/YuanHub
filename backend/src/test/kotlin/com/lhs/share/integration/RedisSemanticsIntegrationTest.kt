package com.lhs.share.integration

import com.lhs.share.config.accesslimit.AccessLimitInterceptor
import com.lhs.share.controller.UserController
import com.lhs.share.controller.request.user.LoginDTO
import com.lhs.share.repository.RedisCache
import com.lhs.share.service.AuthAttempts
import com.lhs.share.service.AuthRateLimit
import com.lhs.share.service.EmailCodePurpose
import com.lhs.share.service.EmailCodes
import com.lhs.share.testinfra.TestRedis
import io.mockk.mockk
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.web.method.HandlerMethod
import java.time.Duration
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class RedisSemanticsIntegrationTest {
    private val connectionFactory = TestRedis.connectionFactory()
    private val template = TestRedis.template(connectionFactory)
    private val cache = RedisCache(60, template)
    private val key = "yuanhub_test:${UUID.randomUUID()}"

    @AfterEach
    fun closeConnection() {
        template.delete(key)
        connectionFactory.destroy()
    }

    @Test
    fun `login IP budget ignores untrusted HTTP headers and is independent of the email counter`() {
        val handler = HandlerMethod(mockk<UserController>(), UserController::class.java.getMethod("login", LoginDTO::class.java))
        val limiter = AccessLimitInterceptor(template, mockk(relaxed = true), mockk())
        val request = MockHttpServletRequest("POST", "/user/login").apply {
            remoteAddr = "192.0.2.10"
            addHeader("X-Forwarded-For", "192.0.2.99")
        }
        val response = MockHttpServletResponse()
        template.opsForValue().set("access-limit:ip:192.0.2.10:POST:/user/login", "240", Duration.ofMinutes(1))
        assertFalse(limiter.preHandle(request, response, handler))
        assertEquals("60", response.getHeader("Retry-After"))
        request.remoteAddr = "192.0.2.11"
        assertTrue(limiter.preHandle(request, response, handler))
    }

    @Test
    fun `account budget allows retries shares spelling variants and keeps delivery idempotent`() {
        val attempts = AuthAttempts(template)
        val email = "${UUID.randomUUID()}@example.invalid"
        repeat(16) { attempts.check("login", email) }
        assertTrue(assertThrows(AuthRateLimit::class.java) { attempts.check("login", email.uppercase()) }.seconds in 1..120)
        attempts.check("code", email)
        attempts.clearLogin(email)
        attempts.check("login", email)
        assertTrue(attempts.reserveDelivery(email, EmailCodePurpose.REGISTER))
        assertFalse(attempts.reserveDelivery(email.uppercase(), EmailCodePurpose.REGISTER))
    }

    @Test
    fun `namespace cleanup removes process-owned keys`() {
        template.opsForValue().set(key, "owned")
        TestRedis.clearOwnedKeys(template)
        assertNull(template.opsForValue().get(key))
    }

    @Test
    fun `real TTL expires a value and non-expiring writes have Redis TTL minus one`() {
        cache.setCache(key, "payload", 300, TimeUnit.MILLISECONDS)
        val ttl = template.getExpire(key, TimeUnit.MILLISECONDS)
        assertTrue(ttl in 1..300)
        assertEquals("payload", cache.getCache(key, String::class.java))
        await().atMost(Duration.ofSeconds(4)).untilAsserted { assertNull(cache.getCache(key, String::class.java)) }
        cache.setCache(key, "persistent", 0)
        assertEquals(-1L, template.getExpire(key))
    }

    @Test
    fun `set-if-absent never replaces the first value or its expiration`() {
        assertTrue(cache.setCacheIfAbsent(key, "first", 60))
        assertFalse(cache.setCacheIfAbsent(key, "second", 600))
        assertEquals("first", cache.getCache(key, String::class.java))
        assertTrue(template.getExpire(key) in 1..60)
    }

    @Test
    fun `application Lua script keeps mismatches and atomically consumes matching JSON values`() {
        cache.setCache(key, "ABC123")
        assertFalse(cache.removeKVIfEquals(key, "wrong"))
        assertEquals("ABC123", cache.getCache(key, String::class.java))
        assertTrue(cache.removeKVIfEquals(key, "ABC123"))
        assertFalse(cache.removeKVIfEquals(key, "ABC123"))
        assertNull(cache.getCache(key, String::class.java))
    }

    @Test
    fun `concurrent Lua consumers have exactly one winner`() {
        cache.setCache(key, "once")
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        try {
            val attempts = (1..32).map {
                pool.submit(
                    Callable {
                        start.await()
                        cache.removeKVIfEquals(key, "once")
                    },
                )
            }
            start.countDown()
            assertEquals(1, attempts.count { it.get(10, TimeUnit.SECONDS) })
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `email verification allows four typos consumes once and invalidates on the fifth failure`() {
        val email = "${UUID.randomUUID()}@example.invalid"
        val codes = EmailCodes(template)
        val purpose = EmailCodePurpose.RESET_PASSWORD
        codes.issue(email, purpose, "ABC123", 60)
        assertFalse(codes.verify(email, EmailCodePurpose.REGISTER, "ABC123"))
        assertFalse(codes.verify(email.uppercase(), purpose, "ABC123"))
        repeat(4) { assertFalse(codes.verify(email, purpose, "WRONG")) }
        assertTrue(codes.verify(email, purpose, "abc123"))
        assertFalse(codes.verify(email, purpose, "ABC123"))
        codes.issue(email, purpose, "DEF123", 60)
        repeat(5) { assertFalse(codes.verify(email, purpose, "WRONG")) }
        assertFalse(codes.verify(email, purpose, "DEF123"))
    }
}
