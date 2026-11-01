package com.lhs.share.integration

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.repository.RedisCache
import com.lhs.share.service.EmailService
import com.lhs.share.testinfra.TestRedis
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class RedisSemanticsIntegrationTest {
    private val connectionFactory = TestRedis.connectionFactory()
    private val template = StringRedisTemplate(connectionFactory)
    private val cache = RedisCache(60, template)
    private val key = "yuanhub_test:${UUID.randomUUID()}"

    @AfterEach
    fun closeConnection() {
        template.delete(key)
        connectionFactory.destroy()
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
    fun `email verification keeps an incorrect code then allows one case-insensitive consumption`() {
        val email = "${UUID.randomUUID()}@example.invalid"
        val codeKey = "vCodeEmail:$email"
        val service = EmailService(ShareProperties(), cache, true)
        try {
            cache.setCache(codeKey, "ABC123", 60)
            assertThrows(ApiResultException::class.java) { service.verifyVCode(email, "WRONG") }
            assertEquals("ABC123", cache.getCache(codeKey, String::class.java))
            service.verifyVCode(email, "abc123")
            assertThrows(ApiResultException::class.java) { service.verifyVCode(email, "ABC123") }
            assertNull(cache.getCache(codeKey, String::class.java))
        } finally {
            template.delete(codeKey)
        }
    }
}
