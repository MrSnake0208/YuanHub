package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 反馈支持记录(HubBackend.feedback_supports)
 *
 * 关联表,不复制反馈数据。唯一联合索引 (feedbackId, userId) 保证同一账号对同一反馈只能支持一次。
 *
 * @property id 支持记录 id: sup_<hex>
 * @property feedbackId 反馈工单 id
 * @property userId 支持者用户 id
 * @property createdAt 支持时间
 */
@Document("feedback_supports")
@CompoundIndex(name = "idx_support_feedback_user", def = "{'feedbackId': 1, 'userId': 1}", unique = true)
@CompoundIndex(name = "idx_support_user_feedback", def = "{'userId': 1, 'feedbackId': 1}")
data class FeedbackSupport(
    @Id
    val id: String? = null,
    val feedbackId: String,
    val userId: String,
    val createdAt: Instant = Instant.now(),
) : Serializable
