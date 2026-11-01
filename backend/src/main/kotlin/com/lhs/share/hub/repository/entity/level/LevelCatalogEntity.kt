package com.lhs.share.hub.repository.entity.level

import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class LevelStatus {
    ACTIVE,
    ARCHIVED,
}

/** The authoritative public level catalog stored in HubBackend.level_catalog. */
@Document("level_catalog")
@CompoundIndexes(
    CompoundIndex(name = "idx_level_catalog_level_key_unique", def = "{'levelKey': 1}", unique = true),
    CompoundIndex(name = "idx_level_catalog_game_stage_unique", def = "{'game': 1, 'stageId': 1}", unique = true),
    CompoundIndex(name = "idx_level_catalog_game_level_unique", def = "{'game': 1, 'levelId': 1}", unique = true),
)
data class LevelCatalogEntity(
    @JsonIgnore @Id val id: String? = null,
    val levelKey: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: LevelStatus = LevelStatus.ACTIVE,
    val isOpen: Boolean = true,
    val endTime: Instant? = null,
    val sortOrder: Int = 0,
    val revision: Long = 0,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = createdAt,
    val createdBy: String,
    val updatedBy: String,
)
