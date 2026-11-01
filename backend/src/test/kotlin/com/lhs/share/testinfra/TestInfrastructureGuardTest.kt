package com.lhs.share.testinfra

import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TestInfrastructureGuardTest {
    @Test
    fun `production names and URI-shaped input are rejected before starting any container`() {
        listOf("MaaBackend", "HubBackend", "admin", "test", "yuanhub_test_../MaaBackend", "mongodb://production/MaaBackend").forEach {
            assertThrows(IllegalArgumentException::class.java) { TestMongo.requireTestDatabase(it) }
        }
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
