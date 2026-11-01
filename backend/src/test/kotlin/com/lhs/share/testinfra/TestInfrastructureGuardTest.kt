package com.lhs.share.testinfra

import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TestInfrastructureGuardTest {
    @Test
    fun `Spring templates receive the same isolated serializer before initialization`() {
        val template = org.springframework.data.redis.core.StringRedisTemplate()
        TestApplicationSafety.isolateRedisKeys().postProcessBeforeInitialization(template, "stringRedisTemplate")
        assertTrue(template.keySerializer === TestRedis.keySerializer)
    }

    @Test
    fun `production names and URI-shaped input are rejected before connecting to any service`() {
        listOf("MaaBackend", "HubBackend", "admin", "test", "yuanhub_test_../MaaBackend", "mongodb://production/MaaBackend").forEach {
            assertThrows(IllegalArgumentException::class.java) { TestMongo.requireTestDatabase(it) }
        }
    }

    @Test
    fun `Redis serializer isolates wildcard and Lua key arguments`() {
        val serializer = TestRedis.keySerializer
        val pattern = serializer.serialize("*")!!.toString(Charsets.UTF_8)
        val key = serializer.serialize("star-capture:upload-expiry:v1")!!
        assertTrue(pattern.startsWith("yuanhub_test:"))
        assertTrue(key.toString(Charsets.UTF_8).startsWith(pattern.removeSuffix("*")))
        org.junit.jupiter.api.Assertions.assertEquals("star-capture:upload-expiry:v1", serializer.deserialize(key))
        assertThrows(IllegalArgumentException::class.java) { serializer.deserialize("developer-key".toByteArray()) }
    }

    @Test
    fun `database names are unique bounded and process owned`() {
        val first = TestMongo.database("account")
        val second = TestMongo.database("account")
        assertNotEquals(first, second)
        assertTrue(first.length < 64)
        TestMongo.requireTestDatabase(first)
        assertThrows(IllegalArgumentException::class.java) { TestMongo.uri("yuanhub_test_not_allocated_here") }
    }
}
