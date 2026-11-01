package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import org.springframework.data.mongodb.repository.MongoRepository

interface FeedbackWorkflowEventRepository : MongoRepository<FeedbackWorkflowEvent, String> {
    fun findByTicketIdOrderByCreatedAtAsc(ticketId: String): List<FeedbackWorkflowEvent>
}
