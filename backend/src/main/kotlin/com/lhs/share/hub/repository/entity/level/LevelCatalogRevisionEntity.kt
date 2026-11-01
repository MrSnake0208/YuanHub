package com.lhs.share.hub.repository.entity.level

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class LevelCatalogRevisionAction {
    CREATE,
    UPDATE,
    ARCHIVE,
    RESTORE,
    IMPORT,
}

data class LevelCatalogSnapshot(
    val levelKey: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: LevelStatus,
    val isOpen: Boolean,
    val endTime: Instant?,
    val sortOrder: Int,
)

@Document("level_catalog_revisions")
@CompoundIndex(name = "idx_level_catalog_revision_key_time", def = "{'levelKey': 1, 'occurredAt': -1}")
data class LevelCatalogRevisionEntity(
    @Id val id: String? = null,
    val levelKey: String,
    val action: LevelCatalogRevisionAction,
    val revision: Long,
    val actorUserId: String,
    val before: LevelCatalogSnapshot? = null,
    val after: LevelCatalogSnapshot? = null,
    val occurredAt: Instant = Instant.now(),
)

fun LevelCatalogEntity.snapshot() = LevelCatalogSnapshot(
    levelKey = levelKey,
    game = game,
    catOne = catOne,
    catTwo = catTwo,
    catThree = catThree,
    name = name,
    levelId = levelId,
    stageId = stageId,
    status = status,
    isOpen = isOpen,
    endTime = endTime,
    sortOrder = sortOrder,
)
