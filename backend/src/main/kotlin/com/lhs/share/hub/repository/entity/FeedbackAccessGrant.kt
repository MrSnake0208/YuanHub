package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/** 按反馈模块授予用户接收通知和管理工单的权限。 */
@Document("feedback_access_grants")
data class FeedbackAccessGrant(
    @Id
    val userId: String,
    val receiveAreas: Set<String> = emptySet(),
    val manageAreas: Set<String> = emptySet(),
    val feedbackRoles: Set<String> = emptySet(),
    val operatorAreas: Set<String> = emptySet(),
    val developerAreas: Set<String> = emptySet(),
    val updatedBy: String,
    val updatedAt: Instant = Instant.now(),
) : Serializable
