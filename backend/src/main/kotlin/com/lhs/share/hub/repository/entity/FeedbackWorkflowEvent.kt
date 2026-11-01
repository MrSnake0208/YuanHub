package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("feedback_workflow_events")
data class FeedbackWorkflowEvent(
    @Id val id: String? = null,
    @Indexed val ticketId: String,
    val action: String,
    val actorUserId: String,
    val note: String,
    val createdAt: Instant = Instant.now(),
)
