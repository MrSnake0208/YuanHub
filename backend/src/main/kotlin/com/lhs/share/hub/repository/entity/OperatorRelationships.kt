package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_relationships")
data class OperatorRelationships(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val entriesJson: String,
    val revision: Long,
    val updatedAt: Instant,
)
