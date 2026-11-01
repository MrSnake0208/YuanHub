package com.lhs.share.hub.repository.entity

import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.controller.achievement.response.AchievementReward
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class AchievementSuggestionStatus { PENDING, ACCEPTED, REJECTED }

data class AchievementCandidate(
    val game: String,
    val categoryId: String,
    val name: String,
    val condition: String,
    val isHidden: Boolean? = null,
    val rewards: List<AchievementReward>? = null,
    val target: Long? = null,
    val linkedMetric: String? = null,
) {
    fun entry(id: String, sort: Int) =
        AchievementEntry(id, game, categoryId, name, condition, sort, isHidden, rewards, target, linkedMetric)
}

@Document("achievement_suggestions")
@CompoundIndexes(
    CompoundIndex(name = "achievement_suggestion_request", def = "{'submitterId':1,'clientRequestId':1}", unique = true),
    CompoundIndex(name = "achievement_suggestion_mine", def = "{'submitterId':1,'createdAt':-1,'_id':-1}"),
    CompoundIndex(name = "achievement_suggestion_mine_status", def = "{'submitterId':1,'status':1,'createdAt':-1,'_id':-1}"),
    CompoundIndex(name = "achievement_suggestion_queue", def = "{'createdAt':1,'_id':1}"),
    CompoundIndex(name = "achievement_suggestion_queue_status", def = "{'status':1,'createdAt':1,'_id':1}"),
    CompoundIndex(name = "achievement_suggestion_queue_game", def = "{'original.game':1,'createdAt':1,'_id':1}"),
    CompoundIndex(name = "achievement_suggestion_queue_status_game", def = "{'status':1,'original.game':1,'createdAt':1,'_id':1}"),
)
data class AchievementSuggestion(
    @Id val id: String,
    val submitterId: String,
    val clientRequestId: String,
    val createdAt: Instant,
    val original: AchievementCandidate,
    val sourceUrl: String,
    val submissionNote: String? = null,
    val status: AchievementSuggestionStatus = AchievementSuggestionStatus.PENDING,
    val version: Long = 0,
    val reviewedBy: String? = null,
    val reviewedAt: Instant? = null,
    val reviewNote: String? = null,
    val achievementId: String? = null,
    val acceptedSnapshot: AchievementEntry? = null,
)
