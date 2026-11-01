package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.entity.level.LevelStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.index.CompoundIndexes
import java.time.Instant

class LevelCatalogEntityContractTest {
    @Test
    fun `level catalog declares stable and business unique indexes`() {
        val indexes = LevelCatalogEntity::class.java.getAnnotation(CompoundIndexes::class.java).value
        assertEquals(3, indexes.size)
        assertTrue(indexes.all { it.unique })
        assertTrue(indexes.any { it.def.contains("levelKey") })
        assertTrue(indexes.any { it.def.contains("game") && it.def.contains("stageId") })
        assertTrue(indexes.any { it.def.contains("game") && it.def.contains("levelId") })
    }

    @Test
    fun `public serialization does not expose mongo id or operator fields`() {
        val json = ObjectMapper().findAndRegisterModules().writeValueAsString(
            LevelCatalogEntity(
                id = "mongo-id",
                levelKey = "lvl_abc123",
                game = "代号鸢",
                catOne = "主线",
                catTwo = "第一章",
                catThree = "",
                name = "第一关",
                levelId = "main/1",
                stageId = "stage_1",
                status = LevelStatus.ACTIVE,
                createdBy = "admin",
                updatedBy = "admin",
                createdAt = Instant.EPOCH,
                updatedAt = Instant.EPOCH,
            ),
        )
        assertFalse(json.contains("mongo-id"), json)
        assertTrue(json.contains("levelKey"), json)
    }
}
