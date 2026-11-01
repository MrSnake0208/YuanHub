package com.lhs.share.hub.controller.calendar.response

import com.lhs.share.hub.repository.entity.CalendarChecklistEntry

data class CalendarSubscriptionResponse(
    val eventId: String,
    val version: Long,
    val subscribed: Boolean,
    val completed: Boolean,
    val checklist: List<CalendarChecklistEntry>,
    val item: ActivityCalendarItem?,
    val memoTitle: String = "本期备忘",
    val memoNote: String = "",
    val manualCompleted: Boolean? = null,
    val legacyCompleted: Boolean = false,
)

data class CalendarSubscriptionsResponse(
    val items: List<CalendarSubscriptionResponse>,
    val unavailableItems: List<CalendarSubscriptionResponse>,
    val subscribedCount: Int,
)

data class CalendarSubscriptionSummaryResponse(
    val items: List<CalendarSubscriptionResponse>,
    val totalPending: Int,
    val subscribedCount: Int,
)
