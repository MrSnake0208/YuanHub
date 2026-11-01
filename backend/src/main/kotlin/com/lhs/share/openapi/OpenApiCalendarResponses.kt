package com.lhs.share.openapi

import com.lhs.share.hub.controller.calendar.response.ActivityCalendarItem
import java.time.Instant
import java.time.LocalDate

/**
 * 第三方 API:活动日历订阅只读响应
 *
 * 全局 Jackson 使用 SNAKE_CASE,字段名与网页端 /v1/activity-calendar 接口保持一致,不需要 @JsonProperty。
 */
data class OpenApiCalendarSubscriptionsResponse(
    val accountId: String,
    val generatedAt: Instant,
    val window: OpenApiCalendarWindow,
    val items: List<OpenApiCalendarEvent>,
)

/**
 * 本次实际生效的查询窗口(缺省为今天起 30 天)
 */
data class OpenApiCalendarWindow(
    val from: LocalDate,
    val to: LocalDate,
)

/**
 * 已订阅活动条目
 *
 * category 是 [com.lhs.share.hub.repository.entity.ActivityCalendarCategory] 的枚举名(如 RECRUITMENT),
 * 与 /v1/activity-calendar 接口一致;中文标签由调用方自行映射。
 */
data class OpenApiCalendarEvent(
    val eventId: String,
    val title: String,
    val category: String?,
    val game: String?,
    val startDate: LocalDate,
    val endDate: LocalDate?,
    val startTime: String?,
    val endTime: String?,
    val timeZone: String?,
    val subscribed: Boolean,
    val completed: Boolean,
)

/** 当前账号所属游戏的公开活动目录,不包含用户订阅记录。 */
data class OpenApiCalendarEventsResponse(
    val accountId: String,
    val game: String,
    val generatedAt: Instant,
    val items: List<ActivityCalendarItem>,
)
