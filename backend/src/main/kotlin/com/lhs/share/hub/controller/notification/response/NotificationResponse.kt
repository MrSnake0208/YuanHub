package com.lhs.share.hub.controller.notification.response

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

/**
 * 通知响应
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class NotificationResponse(
    val id: String,
    val kind: String,
    val title: String,
    val body: String,
    @JsonProperty("ref_type")
    val refType: String,
    @JsonProperty("ref_id")
    val refId: String,
    @JsonProperty("read_at")
    val readAt: Instant?,
    @JsonProperty("created_at")
    val createdAt: Instant,
)