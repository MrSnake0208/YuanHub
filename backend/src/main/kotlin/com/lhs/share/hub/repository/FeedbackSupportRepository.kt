package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackSupport
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * Hub 库反馈支持仓储(HubBackend.feedback_supports)
 *
 * (feedbackId, userId) 唯一索引由实体注解建立;写路径必须依赖数据库约束做最终去重。
 */
interface FeedbackSupportRepository : MongoRepository<FeedbackSupport, String> {
    fun existsByFeedbackIdAndUserId(feedbackId: String, userId: String): Boolean

    fun deleteByFeedbackIdAndUserId(feedbackId: String, userId: String): Long

    fun findByUserIdAndFeedbackIdIn(userId: String, feedbackIds: Collection<String>): List<FeedbackSupport>
}
