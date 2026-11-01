package com.lhs.share.hub.controller.achievement.response

import com.lhs.share.hub.repository.entity.AchievementSuggestion

data class AchievementSuggestionResponse(val suggestion: AchievementSuggestion, val currentlyPublished: Boolean?)
data class AchievementSuggestionPage(val items: List<AchievementSuggestionResponse>, val total: Long, val page: Int, val pageSize: Int)
data class AchievementSuggestionOptions(val catalog: AchievementCatalogResponse, val rewardItems: List<AchievementRewardItem>)
