package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

data class DevelopmentCriterion(val title: String, val completed: Boolean = false)

@Document("development_goals")
data class DevelopmentGoal(
    @Id val id: String,
    val title: String,
    val description: String,
    val stage: String,
    val criteria: List<DevelopmentCriterion>,
    val feedbackIds: List<String> = emptyList(),
    val targetVersion: String? = null,
    val targetDate: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    @Version val version: Long? = null,
)
