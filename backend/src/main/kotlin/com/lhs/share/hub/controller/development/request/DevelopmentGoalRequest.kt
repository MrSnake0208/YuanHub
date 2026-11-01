package com.lhs.share.hub.controller.development.request

import com.lhs.share.hub.repository.entity.DevelopmentCriterion

data class DevelopmentGoalRequest(
    val title: String,
    val description: String,
    val stage: String,
    val criteria: List<DevelopmentCriterion>,
    val feedbackIds: List<String> = emptyList(),
    val targetVersion: String? = null,
    val targetDate: String? = null,
    val expectedVersion: Long? = null,
)
