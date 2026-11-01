package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarLoadoutPresetCurrentRequest
import com.lhs.share.hub.controller.star.request.StarLoadoutPresetRequest
import com.lhs.share.hub.repository.StarLoadoutPresetCurrentRepository
import com.lhs.share.hub.repository.entity.StarLoadoutPreset
import com.lhs.share.hub.repository.entity.StarLoadoutPresetCurrent
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import java.time.Instant

class StarLoadoutPresetServiceTest {
    private val repository = mockk<StarLoadoutPresetCurrentRepository>()
    private val stored = mutableMapOf<String, StarLoadoutPresetCurrent>()
    private val service = StarLoadoutPresetService(repository)

    @BeforeEach
    fun setUp() {
        stored.clear()
        every { repository.findByUserId(any()) } answers { stored[firstArg()] }
        every { repository.replace(any(), any(), any(), any(), any()) } answers {
            val userId = firstArg<String>()
            val expected = secondArg<Long>()
            val current = stored[userId]
            if ((current?.revision ?: 0) != expected) {
                null
            } else {
                StarLoadoutPresetCurrent(
                    id = userId,
                    userId = userId,
                    mainPresets = args[2] as List<StarLoadoutPreset>,
                    supportPresets = args[3] as List<StarLoadoutPreset>,
                    revision = expected + 1,
                    updatedAt = args[4] as Instant,
                ).also { stored[userId] = it }
            }
        }
    }

    @Test
    fun `empty GET and first PUT use user-global CAS without account`() {
        val empty = service.current("user-a")
        val saved = service.putCurrent(
            "user-a",
            request(0, listOf(preset("main-1", " 预设1 ", " 天府 ", "武曲")), listOf(preset("support-1", "预设1", "文曲"))),
        )

        assertEquals(0, empty.revision)
        assertEquals(emptyList<StarLoadoutPreset>(), empty.mainPresets)
        assertNull(empty.updatedAt)
        assertEquals(1, saved.revision)
        assertEquals("预设1", saved.mainPresets.single().name)
        assertEquals(listOf("天府", "武曲"), saved.mainPresets.single().starNames)
    }

    @Test
    fun `stale expected revision returns stable conflict and preserves snapshot`() {
        service.putCurrent("user-a", request(0, listOf(preset("m1", "A", "天府"))))

        val error = assertThrows(InventoryApiException::class.java) {
            service.putCurrent("user-a", request(0, listOf(preset("m2", "B", "武曲"))))
        }

        assertEquals("star_loadout_preset_revision_conflict", error.code)
        assertEquals("m1", service.current("user-a").mainPresets.single().id)
    }

    @Test
    fun `twenty presets per group are accepted and twenty-one are invalid`() {
        val twenty = (1..20).map { preset("p$it", "预设$it", "天府") }
        assertEquals(20, service.putCurrent("user-a", request(0, twenty, twenty)).mainPresets.size)

        val error = assertThrows(InventoryApiException::class.java) {
            service.putCurrent("user-b", request(0, twenty + preset("p21", "预设21", "天府")))
        }
        assertEquals("star_loadout_preset_invalid_snapshot", error.code)
    }

    @Test
    fun `empty names invalid star counts duplicates and duplicate ids are rejected`() {
        val invalid = listOf(
            request(0, listOf(preset("m1", " ", "天府"))),
            request(0, listOf(StarLoadoutPresetRequest("m1", "A", emptyList()))),
            request(0, listOf(preset("m1", "A", "天府", "武曲", "天机", "七杀"))),
            request(0, listOf(preset("m1", "A", "天府", "天府"))),
            request(0, listOf(preset("m1", "A", "天府"), preset("m1", "B", "武曲"))),
        )

        invalid.forEach { candidate ->
            val error = assertThrows(InventoryApiException::class.java) {
                service.putCurrent("user-a", candidate)
            }
            assertEquals("star_loadout_preset_invalid_snapshot", error.code)
        }
    }

    @Test
    fun `different users are completely isolated`() {
        service.putCurrent("user-a", request(0, listOf(preset("a", "用户A", "天府"))))
        service.putCurrent("user-b", request(0, listOf(preset("b", "用户B", "武曲"))))

        assertEquals("a", service.current("user-a").mainPresets.single().id)
        assertEquals("b", service.current("user-b").mainPresets.single().id)
    }

    @Test
    fun `duplicate key on first create is a stable revision conflict`() {
        every { repository.replace(any(), any(), any(), any(), any()) } throws DuplicateKeyException("race")

        val error = assertThrows(InventoryApiException::class.java) {
            service.putCurrent("user-a", request(0, emptyList()))
        }

        assertEquals("star_loadout_preset_revision_conflict", error.code)
    }

    private fun request(
        revision: Long,
        main: List<StarLoadoutPresetRequest> = emptyList(),
        support: List<StarLoadoutPresetRequest> = emptyList(),
    ) = StarLoadoutPresetCurrentRequest(revision, main, support)

    private fun preset(id: String, name: String, vararg starNames: String) = StarLoadoutPresetRequest(id, name, starNames.toList())
}
