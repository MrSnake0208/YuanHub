package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackAgentReview
import org.springframework.data.mongodb.repository.MongoRepository

interface FeedbackAgentReviewRepository : MongoRepository<FeedbackAgentReview, String> {
    fun findFirstByTicketIdOrderByUpdatedAtDesc(ticketId: String): FeedbackAgentReview?
}
