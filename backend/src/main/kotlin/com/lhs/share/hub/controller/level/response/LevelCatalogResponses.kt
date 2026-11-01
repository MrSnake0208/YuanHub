package com.lhs.share.hub.controller.level.response

import com.fasterxml.jackson.annotation.JsonInclude
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.entity.level.LevelCatalogRevisionEntity
import com.lhs.share.hub.repository.entity.level.LevelCatalogSnapshot
import java.time.Instant

data class LevelCatalogResponse(
    val catalogVersion: String,
    val levels: List<LevelCatalogItemResponse>,
)

data class LevelCatalogItemResponse(
    val id: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: String,
    val isOpen: Boolean,
    val endTime: Instant?,
    val sortOrder: Int,
) {
    companion object {
        fun of(entity: LevelCatalogEntity) = LevelCatalogItemResponse(
            id = entity.levelKey,
            game = entity.game,
            catOne = entity.catOne,
            catTwo = entity.catTwo,
            catThree = entity.catThree,
            name = entity.name,
            levelId = entity.levelId,
            stageId = entity.stageId,
            status = entity.status.name,
            isOpen = entity.isOpen,
            endTime = entity.endTime,
            sortOrder = entity.sortOrder,
        )
    }
}

data class LevelCatalogAdminResponse(
    val id: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: String,
    val isOpen: Boolean,
    val endTime: Instant?,
    val sortOrder: Int,
    val revision: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val createdBy: String,
    val updatedBy: String,
) {
    companion object {
        fun of(entity: LevelCatalogEntity) = LevelCatalogAdminResponse(
            id = entity.levelKey,
            game = entity.game,
            catOne = entity.catOne,
            catTwo = entity.catTwo,
            catThree = entity.catThree,
            name = entity.name,
            levelId = entity.levelId,
            stageId = entity.stageId,
            status = entity.status.name,
            isOpen = entity.isOpen,
            endTime = entity.endTime,
            sortOrder = entity.sortOrder,
            revision = entity.revision,
            createdAt = entity.createdAt,
            updatedAt = entity.updatedAt,
            createdBy = entity.createdBy,
            updatedBy = entity.updatedBy,
        )
    }
}

data class LevelCatalogExportResponse(
    val format: String = "yuanhub-level-catalog",
    val version: Int = 1,
    val catalogVersion: String,
    val levels: List<LevelCatalogExportEntry>,
)

data class LevelCatalogExportEntry(
    val id: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: String,
    val isOpen: Boolean,
    val endTime: Instant?,
    val sortOrder: Int,
) {
    companion object {
        fun of(entity: LevelCatalogEntity) = LevelCatalogExportEntry(
            id = entity.levelKey,
            game = entity.game,
            catOne = entity.catOne,
            catTwo = entity.catTwo,
            catThree = entity.catThree,
            name = entity.name,
            levelId = entity.levelId,
            stageId = entity.stageId,
            status = entity.status.name,
            isOpen = entity.isOpen,
            endTime = entity.endTime,
            sortOrder = entity.sortOrder,
        )
    }
}

data class LevelCatalogHistoryResponse(
    val id: String?,
    val levelKey: String,
    val action: String,
    val revision: Long,
    val actorUserId: String,
    val before: LevelCatalogSnapshotResponse?,
    val after: LevelCatalogSnapshotResponse?,
    val occurredAt: Instant,
) {
    companion object {
        fun of(entity: LevelCatalogRevisionEntity) = LevelCatalogHistoryResponse(
            id = entity.id,
            levelKey = entity.levelKey,
            action = entity.action.name,
            revision = entity.revision,
            actorUserId = entity.actorUserId,
            before = entity.before?.let(LevelCatalogSnapshotResponse::of),
            after = entity.after?.let(LevelCatalogSnapshotResponse::of),
            occurredAt = entity.occurredAt,
        )
    }
}

data class LevelCatalogSnapshotResponse(
    val id: String,
    val game: String,
    val catOne: String,
    val catTwo: String,
    val catThree: String,
    val name: String,
    val levelId: String,
    val stageId: String,
    val status: String,
    val isOpen: Boolean,
    val endTime: Instant?,
    val sortOrder: Int,
) {
    companion object {
        fun of(snapshot: LevelCatalogSnapshot) = LevelCatalogSnapshotResponse(
            id = snapshot.levelKey,
            game = snapshot.game,
            catOne = snapshot.catOne,
            catTwo = snapshot.catTwo,
            catThree = snapshot.catThree,
            name = snapshot.name,
            levelId = snapshot.levelId,
            stageId = snapshot.stageId,
            status = snapshot.status.name,
            isOpen = snapshot.isOpen,
            endTime = snapshot.endTime,
            sortOrder = snapshot.sortOrder,
        )
    }
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LevelCatalogImportIssue(
    val index: Int,
    val levelKey: String? = null,
    val code: String,
    val message: String,
)

data class LevelCatalogImportResponse(
    val createdCount: Int,
    val updatedCount: Int,
    val unchangedCount: Int,
    val duplicateCount: Int,
    val errorCount: Int,
    val conflictCount: Int,
    val conflicts: List<LevelCatalogImportIssue> = emptyList(),
    val errors: List<LevelCatalogImportIssue> = emptyList(),
    val catalogVersion: String,
)
