package com.lhs.share.hub.repository.entity

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document

class StarStateLoadoutContractTest {
    @Test
    fun `state recovery and loadout use account owner collections`() {
        listOf(
            StarStateCurrent::class.java to "star_state_current",
            StarRecoveryPoint::class.java to "star_recovery_points",
            StarLoadoutCurrent::class.java to "star_loadout_current",
        ).forEach { (type, collection) ->
            val document = type.getAnnotation(Document::class.java)
            val indexes = type.getAnnotation(CompoundIndexes::class.java)?.value?.toList()
                ?: listOf(type.getAnnotation(org.springframework.data.mongodb.core.index.CompoundIndex::class.java)!!)
            assertTrue(document.value == collection)
            assertTrue(indexes.any { it.def.contains("userId") && it.def.contains("accountId") })
        }
    }

    @Test
    fun `loadout presets are user-global canonical-name values`() {
        assertEquals(
            "star_loadout_preset_current",
            StarLoadoutPresetCurrent::class.java.getAnnotation(Document::class.java).value,
        )
        assertFalse(StarLoadoutPresetCurrent::class.java.declaredFields.any { it.name == "accountId" })
        assertTrue(
            StarLoadoutPresetCurrent::class.java.getDeclaredField("userId").getAnnotation(Indexed::class.java).unique,
        )
        assertEquals(List::class.java, StarLoadoutPresetCurrent::class.java.getDeclaredField("mainPresets").type)
        assertEquals(List::class.java, StarLoadoutPreset::class.java.getDeclaredField("starNames").type)
        assertFalse(StarLoadoutPreset::class.java.declaredFields.any { it.name == "instanceId" })
    }

    @Test
    fun `persistence payloads use typed values instead of dynamic BSON map keys`() {
        assertFalse(StarStateCurrent::class.java.getDeclaredField("planTargets").type == Map::class.java)
        assertFalse(StarRecoveryPoint::class.java.getDeclaredField("loadouts").type == Map::class.java)
        assertFalse(StarLoadoutCurrent::class.java.getDeclaredField("loadouts").type == Map::class.java)
    }
}
