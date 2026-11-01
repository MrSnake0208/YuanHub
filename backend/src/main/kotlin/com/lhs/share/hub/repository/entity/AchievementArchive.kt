package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

@Document("achievement_archives")
@CompoundIndex(name = "achievement_owner", def = "{'userId': 1, 'accountId': 1}", unique = true)
data class AchievementArchive(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val records: List<AchievementRecord> = emptyList(),
    @Version val version: Long? = null,
)

data class AchievementRecord(
    val achievementId: String,
    val status: String = "pending",
    val favorite: Boolean = false,
    val note: String = "",
    val progress: Double? = null,
    val completedOn: LocalDate? = null,
    val updatedAt: Instant,
    val revision: Long,
    val source: String,
    val stateSource: String? = null,
    val stateUpdatedAt: Instant? = null,
    val progressSource: String? = null,
    val progressUpdatedAt: Instant? = null,
) {
    fun substantive() = status != "pending" || favorite || note.isNotEmpty() || progress != null || completedOn != null
}
