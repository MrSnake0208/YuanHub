package com.lhs.share.hub.service.today

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.TodayPreferencesRepository
import com.lhs.share.hub.repository.entity.TodayPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class TodayPreferencesServiceTest {
    private val repository = mockk<TodayPreferencesRepository>()
    private val now = Instant.parse("2026-10-16T00:00:00Z")
    private val service = TodayPreferencesService(repository, Clock.fixed(now, ZoneOffset.UTC))
    private val mapper = jacksonObjectMapper()
    private fun body(hidden: String = "[]", version: Long = 0) =
        mapper.readTree("""{"schema_version":1,"expected_version":$version,"hidden_modules":$hidden}""")

    @Test
    fun `missing preferences read as default without creating records`() {
        every { repository.find("owner", any()) } returns null
        for (mode in listOf("desktop", "mobile")) {
            val result = service.get("owner", mode)
            assertEquals(mode, result.layoutMode)
            assertEquals(emptyList<String>(), result.hiddenModules)
            assertEquals(0L, result.version)
            service.get("owner", mode)
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `save is owner mode and expected revision scoped and supports hiding all or restoring defaults`() {
        val hidden = listOf("activities", "checklist", "highlights", "private_items", "training")
        every { repository.replace("owner", "desktop", 0, hidden, now) } returns
            TodayPreferences("one", "owner", "desktop", hidden, updatedAt = now)
        assertEquals(hidden, service.save("owner", "desktop", body(mapper.writeValueAsString(hidden))).hiddenModules)
        every { repository.replace("owner", "desktop", 1, emptyList(), now) } returns
            TodayPreferences("one", "owner", "desktop", emptyList(), version = 2, updatedAt = now)
        assertEquals(2L, service.save("owner", "desktop", body(version = 1)).version)
        verify(exactly = 0) { repository.replace(any(), "mobile", any(), any(), any()) }
        verify(exactly = 0) { repository.replace("other", any(), any(), any(), any()) }
    }

    @Test
    fun `invalid modes fields identities modules and versions never reach persistence`() {
        val invalid = listOf(
            "{}", "[]", "null",
            """{"schema_version":1,"expected_version":0,"hidden_modules":["unknown"]}""",
            """{"schema_version":1,"expected_version":0,"hidden_modules":["training","training"]}""",
            """{"schema_version":1,"expected_version":0,"hidden_modules":[1]}""",
            """{"schema_version":1,"expected_version":0,"hidden_modules":null}""",
            """{"schema_version":1,"expected_version":0,"hidden_modules":[],"user_id":"other"}""",
            """{"schema_version":1,"expected_version":0,"hidden_modules":[],"account_id":"a"}""",
            """{"schema_version":2,"expected_version":0,"hidden_modules":[]}""",
            """{"schema_version":"1","expected_version":0,"hidden_modules":[]}""",
            """{"schema_version":1,"expected_version":"0","hidden_modules":[]}""",
            """{"schema_version":1,"expected_version":-1,"hidden_modules":[]}""",
            """{"schema_version":1,"expected_version":0.5,"hidden_modules":[]}""",
            """{"schema_version":1,"expected_version":9007199254740991,"hidden_modules":[]}""",
        )
        invalid.forEach { json ->
            assertEquals(
                422,
                assertThrows(ResponseStatusException::class.java) {
                    service.save("owner", "desktop", mapper.readTree(json))
                }.statusCode.value(),
            )
        }
        assertThrows(ResponseStatusException::class.java) { service.save("owner", "tablet", body()) }
        assertThrows(ResponseStatusException::class.java) { service.get("owner", "Desktop") }
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `version conflicts and persistence failures never return success`() {
        every { repository.replace(any(), any(), any(), any(), any()) } returns null
        assertEquals(409, assertThrows(ResponseStatusException::class.java) { service.save("owner", "mobile", body()) }.statusCode.value())
        every { repository.replace(any(), any(), any(), any(), any()) } throws IllegalStateException("write unavailable")
        assertThrows(IllegalStateException::class.java) { service.save("owner", "mobile", body()) }
        every { repository.find(any(), any()) } throws IllegalStateException("read unavailable")
        assertThrows(IllegalStateException::class.java) { service.get("owner", "desktop") }
    }
}
