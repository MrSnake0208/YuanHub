package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import com.lhs.share.hub.controller.achievement.response.AchievementCatalogResponse
import com.lhs.share.hub.controller.achievement.response.AchievementCategory
import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.controller.achievement.response.AchievementPointTrack
import com.lhs.share.hub.controller.achievement.response.AchievementPublicPointTrack
import com.lhs.share.hub.controller.achievement.response.AchievementRewardItem
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Transient
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

data class CatalogCategory(val categoryId: String, val name: String, val sort: Int = 0, val enabled: Boolean = true)

data class CatalogContent(
    val game: String,
    val dataStatus: String = "empty",
    val coverage: String = "",
    val categories: List<CatalogCategory> = emptyList(),
    val entries: List<AchievementEntry> = emptyList(),
    val retiredIds: Set<String> = emptySet(),
    val catalogVersion: String = "",
    val rewardItems: List<AchievementRewardItem> = emptyList(),
    val pointTracks: List<AchievementPointTrack> = emptyList(),
    val rewardFilterKeys: List<String> = emptyList(),
) {
    @get:JsonIgnore
    @field:Transient
    var legacyRewards: Map<String, String> = emptyMap()

    fun publicCatalog(version: String) = AchievementCatalogResponse(
        version,
        game,
        dataStatus,
        coverage,
        categories.filter { it.enabled }.sortedBy { it.sort }.map { AchievementCategory(it.categoryId, it.name) },
        entries.filter { it.achievementId !in retiredIds }.sortedWith(
            compareBy<AchievementEntry> { id -> categories.firstOrNull { it.categoryId == id.categoryId }?.sort ?: Int.MAX_VALUE }
                .thenBy { it.sort }.thenBy { it.achievementId },
        ),
        legacyRewards.filterKeys { id -> entries.any { it.achievementId == id && id !in retiredIds } },
        pointTracks.filter { track -> categories.any { it.categoryId == track.categoryId && it.enabled } }.mapNotNull { track ->
            rewardItems.find { it.itemKey == track.itemKey && game in it.games }?.let {
                AchievementPublicPointTrack(track.categoryId, track.itemKey, it.name, track.tiers)
            }
        },
        rewardFilterKeys.mapNotNull { key -> rewardItems.find { it.itemKey == key && game in it.games }?.name },
    )
}

data class CatalogPublication(
    val version: String,
    val content: CatalogContent,
    val publishedAt: Instant,
    val publishedBy: String,
    val restoredFrom: String? = null,
)

@Document("achievement_catalogs")
data class AchievementCatalog(
    @Id val game: String,
    val revision: Long = 0,
    val published: CatalogPublication,
    val draft: CatalogContent,
    val history: List<CatalogPublication> = emptyList(),
    val identities: Map<String, AchievementEntry> = emptyMap(),
    val issuedIds: Set<String> = emptySet(),
    val categoryIds: Set<String> = emptySet(),
) {
    @get:JsonIgnore
    @field:Transient
    var compatibilityIssues: List<String> = emptyList()
}
