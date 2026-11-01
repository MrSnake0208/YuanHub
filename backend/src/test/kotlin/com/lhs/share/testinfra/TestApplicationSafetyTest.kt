package com.lhs.share.testinfra

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

class TestApplicationSafetyTest {
    private fun safeEnvironment() = MockEnvironment().apply {
        setActiveProfiles("test")
        setProperty("spring.data.mongodb.uri", "mongodb://127.0.0.1:1/yuanhub_test_unit")
        setProperty("share.mongo.hub-uri", "mongodb://127.0.0.1:1/yuanhub_test_hub")
        setProperty("spring.data.redis.url", "redis://127.0.0.1:1")
        setProperty("debug.email.no-send", "true")
        listOf("share.avatar.dir", "share.media.dir", "share.media.private-dir", "share.star-capture.dir").forEach {
            setProperty(it, "./build/test-data/fixture")
        }
    }

    @Test
    fun `safe dead-port configuration is accepted without starting Docker`() {
        assertDoesNotThrow { TestApplicationSafety.verify(safeEnvironment()) }
    }

    @Test
    fun `dev profile is rejected before any bean connects`() {
        assertThrows(IllegalArgumentException::class.java) {
            TestApplicationSafety.verify(safeEnvironment().apply { setActiveProfiles("dev") })
        }
    }

    @Test
    fun `test plus dev profile is also unsafe`() {
        assertThrows(IllegalArgumentException::class.java) {
            TestApplicationSafety.verify(safeEnvironment().apply { setActiveProfiles("test", "dev") })
        }
    }

    @Test
    fun `both databases and Redis require owned connections not merely local looking addresses`() {
        mapOf(
            "spring.data.mongodb.uri" to "mongodb://127.0.0.1:27017/MaaBackend",
            "share.mongo.hub-uri" to "mongodb://127.0.0.1:27017/HubBackend",
            "spring.data.redis.url" to "redis://127.0.0.1:6379",
        ).forEach { (key, value) ->
            assertThrows(IllegalArgumentException::class.java) {
                TestApplicationSafety.verify(safeEnvironment().withProperty(key, value))
            }
        }
    }

    @Test
    fun `sending mail and live storage paths are rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            TestApplicationSafety.verify(safeEnvironment().withProperty("debug.email.no-send", "false"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            TestApplicationSafety.verify(safeEnvironment().withProperty("share.star-capture.dir", "./data/star-captures"))
        }
    }
}
