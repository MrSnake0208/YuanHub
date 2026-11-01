package com.lhs.share.hub.controller.calendar.response

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest

data class CalendarImportIssue(val field: String, val message: String)

data class CalendarImportRow(
    val row: Int,
    val status: String,
    val title: String,
    val game: String,
    val data: ActivityCalendarWriteRequest? = null,
    val issues: List<CalendarImportIssue> = emptyList(),
    val eventId: String? = null,
)

data class CalendarImportReport(
    val total: Int,
    val ready: Int,
    val existing: Int,
    val duplicates: Int,
    val invalid: Int,
    val conflicts: Int,
    val publicCount: Int,
    val created: Int,
    val failed: Int,
    val rows: List<CalendarImportRow>,
    val previewToken: String? = null,
)
