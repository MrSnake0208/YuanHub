package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackAccessGrant
import org.springframework.data.mongodb.repository.MongoRepository

interface FeedbackAccessGrantRepository : MongoRepository<FeedbackAccessGrant, String> {
    fun findByReceiveAreasContaining(area: String): List<FeedbackAccessGrant>

    fun findByManageAreasContaining(area: String): List<FeedbackAccessGrant>
    fun findByOperatorAreasContaining(area: String): List<FeedbackAccessGrant>
    fun findByDeveloperAreasContaining(area: String): List<FeedbackAccessGrant>
}
