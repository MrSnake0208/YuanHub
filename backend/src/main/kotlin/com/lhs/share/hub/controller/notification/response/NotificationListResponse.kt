package com.lhs.share.hub.controller.notification.response

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * 通知列表响应
 */
data class NotificationListResponse(
    val notifications: List<NotificationResponse>,
    val total: Long,
    @JsonProperty("unread_count")
    val unreadCount: Long,
)