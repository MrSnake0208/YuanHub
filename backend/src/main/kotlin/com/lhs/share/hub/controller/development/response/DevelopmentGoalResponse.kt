package com.lhs.share.hub.controller.development.response

import com.fasterxml.jackson.annotation.JsonInclude
import com.lhs.share.hub.repository.entity.DevelopmentCriterion
import java.time.Instant

data class DevelopmentFeedbackLink(val id: String, val title: String)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class DevelopmentGoalResponse(
    val id: String,
    val title: String,
    val description: String,
    val stage: String,
    val criteria: List<DevelopmentCriterion>,
    val linkedFeedback: List<DevelopmentFeedbackLink>,
    val targetVersion: String?,
    val targetDate: String?,
    val updatedAt: Instant,
    val version: Long,
    val feedbackIds: List<String>? = null,
)
