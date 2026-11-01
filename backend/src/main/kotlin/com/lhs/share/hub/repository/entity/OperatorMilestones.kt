package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document

@Document("operator_milestones")
data class OperatorMilestones(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val operatorId: String,
    val dates: Map<String, String>,
    val revision: Long,
)
