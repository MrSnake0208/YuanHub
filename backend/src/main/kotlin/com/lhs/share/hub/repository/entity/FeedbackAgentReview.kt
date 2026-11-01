package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

@Document("feedback_agent_reviews")
@CompoundIndex(name = "idx_feedback_agent_review_ticket_updated", def = "{'ticketId': 1, 'updatedAt': -1}")
data class FeedbackAgentReview(
    @Id
    val id: String,
    @Indexed
    val ticketId: String,
    val ticketUpdatedAt: Instant,
    val integrationTokenId: String,
    val actorUserId: String,
    val source: String,
    val model: String? = null,
    val summary: String,
    val classification: FeedbackAgentClassification = FeedbackAgentClassification(),
    val suspectedModules: List<String> = emptyList(),
    val suspectedFiles: List<String> = emptyList(),
    val suggestedAction: String,
    val confidence: Double? = null,
    val evidence: List<String> = emptyList(),
    val implementationResult: FeedbackAgentImplementationResult? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
) : Serializable

data class FeedbackAgentClassification(
    val suggestedType: String? = null,
    val suggestedArea: String? = null,
    val severity: String = "UNKNOWN",
) : Serializable

data class FeedbackAgentImplementationResult(
    val status: String? = null,
    val commit: String? = null,
    val files: List<String> = emptyList(),
    val validation: List<String> = emptyList(),
) : Serializable
