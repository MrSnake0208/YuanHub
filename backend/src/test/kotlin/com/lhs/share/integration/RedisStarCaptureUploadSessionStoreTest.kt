package com.lhs.share.integration

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.service.star.RedisStarCaptureUploadSessionStore
import com.lhs.share.hub.service.star.StarCaptureImage
import com.lhs.share.hub.service.star.StarCaptureKey
import com.lhs.share.hub.service.star.StarCaptureManifest
import com.lhs.share.hub.service.star.StarCaptureUploadSession
import com.lhs.share.hub.service.star.StoredStarCaptureImage
import com.lhs.share.testinfra.TestRedis
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 上传会话存储的真实 Redis/Lua 语义: 原子抢占、单图不可变、TTL 镜像、到期索引与代际回收。
 *
 * 服务层测试注入的是内存 fake, 因此这一层是本次新增保证的唯一真实验证。
 */
@Tag("integration")
class RedisStarCaptureUploadSessionStoreTest {
    private val connectionFactory = TestRedis.connectionFactory()
    private val template = StringRedisTemplate(connectionFactory)
    private val mapper = jacksonObjectMapper()
        .registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val store = RedisStarCaptureUploadSessionStore(template, mapper)

    @AfterEach
    fun closeConnection() {
        template.keys("star-capture:upload*").orEmpty().forEach { template.delete(it) }
        connectionFactory.destroy()
    }

    @Test
    fun `session survives a JSON round trip and create is an atomic claim`() {
        val session = session(ttlSeconds = 600)
        assertTrue(store.create(session, 600))
        assertEquals(session, store.find(session.key))

        assertFalse(store.create(session.copy(directory = session.directory + "-loser"), 600))
        assertEquals(session, store.find(session.key))
        assertEquals(1L, expiryEntries(session.key))
    }

    @Test
    fun `concurrent create for one capture id has exactly one winner`() {
        val session = session(ttlSeconds = 600)
        val ready = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(8)
        try {
            val attempts = (1..8).map {
                Callable {
                    ready.await(10, TimeUnit.SECONDS)
                    store.create(session.copy(directory = session.directory + "-$it"), 600)
                }
            }.map(pool::submit)
            ready.countDown()
            val winners = attempts.count { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, winners, "exactly one concurrent create must win the capture id")
            assertNotNull(store.find(session.key))
            assertEquals(1L, expiryEntries(session.key))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `image write is a per-image SET NX whose TTL never outlives the session`() {
        val session = session(ttlSeconds = 600)
        assertTrue(store.create(session, 600))
        val image = StoredStarCaptureImage("c:main:000", 1, "main-000.png", "/tmp/main-000.png")

        assertEquals(1L, store.putImage(session.key, image))
        assertEquals(image, store.image(session.key, "c:main:000"))
        assertEquals(0L, store.putImage(session.key, image.copy(path = "/tmp/other.png")))
        assertEquals(image, store.image(session.key, "c:main:000"))

        val sessionTtl = template.getExpire(sessionKey(session.key), TimeUnit.MILLISECONDS)
        val imageTtl = template.getExpire("${sessionKey(session.key)}:image:c:main:000", TimeUnit.MILLISECONDS)
        assertTrue(imageTtl in 1..sessionTtl, "image ttl $imageTtl must not outlive session ttl $sessionTtl")
    }

    @Test
    fun `image write against a missing session is reported as expired`() {
        assertEquals(-1L, store.putImage(session().key, StoredStarCaptureImage("c:main:000", 1, "main-000.png", "/tmp/a.png")))
    }

    @Test
    fun `expiry index drives cleanup and the original member is removed`() {
        val session = session(ttlSeconds = 600)
        assertTrue(store.create(session, 600))
        assertEquals(0, store.dueCleanup(Instant.now()).size)

        val due = store.dueCleanup(session.expiresAt.plusSeconds(1))
        assertEquals(1, due.size)
        assertTrue(store.claimCleanup(due.single()))
        assertFalse(store.claimCleanup(due.single()))
        store.completeCleanup(due.single())

        assertNull(store.find(session.key))
        assertEquals(0L, expiryEntries(session.key))
        assertFalse(template.hasKey(cleanupLockKey(session.key)))
    }

    @Test
    fun `a stale expiry entry cannot delete a newer session for the same capture id`() {
        val first = session(ttlSeconds = 600)
        assertTrue(store.create(first, 600))
        val stale = store.dueCleanup(first.expiresAt.plusSeconds(1)).single()

        // The client retries the same capture id while the stale index entry is still in the reader's snapshot.
        template.delete(sessionKey(first.key))
        val second = first.copy(directory = first.directory + "-next", expiresAt = Instant.now().plusSeconds(600))
        assertTrue(store.create(second, 600))
        store.putImage(second.key, StoredStarCaptureImage("c:main:000", 1, "main-000.png", "/tmp/main-000.png"))

        assertTrue(store.claimCleanup(stale))
        store.completeCleanup(stale)

        assertEquals(second, store.find(second.key))
        assertNotNull(store.image(second.key, "c:main:000"))
        assertEquals(1L, expiryEntries(second.key))
    }

    private fun session(ttlSeconds: Long = 600) = StarCaptureUploadSession(
        key = StarCaptureKey("u1", "acc1", "capture-${System.nanoTime()}"),
        rawManifest = "{}",
        manifest = StarCaptureManifest(
            schemaVersion = 1,
            captureId = "capture",
            gameVersion = "如鸢",
            section = "full",
            stopReason = "full_capture",
            images = listOf(StarCaptureImage("c:main:000", 1, "main-000.png")),
            adjacentRelations = emptyList(),
        ),
        directory = "/tmp/upload-$ttlSeconds",
        expiresAt = Instant.now().plusSeconds(ttlSeconds),
    )

    private fun sessionKey(key: StarCaptureKey) = "star-capture:upload:v1:${key.userId}:${key.accountId}:${key.captureId}"
    private fun cleanupLockKey(key: StarCaptureKey) = "star-capture:upload-cleanup-lock:v1:${key.userId}:${key.accountId}:${key.captureId}"
    private fun expiryEntries(key: StarCaptureKey): Long = template.opsForZSet()
        .range("star-capture:upload-expiry:v1", 0, -1)
        .orEmpty()
        .count { it.contains("\"capture_id\":\"${key.captureId}\"") }
        .toLong()
}
