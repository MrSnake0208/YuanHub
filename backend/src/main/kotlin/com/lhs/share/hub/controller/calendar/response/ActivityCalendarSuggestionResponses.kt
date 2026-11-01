package com.lhs.share.hub.controller.calendar.response

import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionOriginal
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import java.time.Instant

data class ActivityCalendarSuggestionResponse(
    val id: String,
    val submitterId: String,
    val createdAt: Instant,
    val original: ActivityCalendarSuggestionOriginal,
    val submissionNote: String?,
    val status: ActivityCalendarSuggestionStatus,
    val version: Long,
    val reviewedBy: String?,
    val reviewedAt: Instant?,
    val reviewNote: String?,
    val eventId: String?,
    val acceptedSnapshot: ActivityCalendarItem?,
    val currentEvent: ActivityCalendarSuggestionCurrentEvent?,
)

data class ActivityCalendarSuggestionPage(
    val items: List<ActivityCalendarSuggestionResponse>,
    val total: Long,
    val page: Int,
    val pageSize: Int,
)

data class ActivityCalendarSuggestionCurrentEvent(val item: ActivityCalendarItem, val enabled: Boolean)
