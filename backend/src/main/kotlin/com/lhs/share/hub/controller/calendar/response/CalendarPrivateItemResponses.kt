package com.lhs.share.hub.controller.calendar.response

import java.time.Instant
import java.time.LocalDate

data class CalendarPrivateItemResponse(
    val id: String,
    val accountId: String,
    val game: String,
    val title: String,
    val date: LocalDate,
    val time: String?,
    val note: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val timeZone: String = "Asia/Shanghai",
    val startDate: LocalDate = date,
    val endDate: LocalDate = date,
    val reminderOn: String? = null,
    val reminderDaysBefore: Int = 0,
    val recurrence: String = "NONE",
    val occurrenceDate: LocalDate? = null,
    val seriesStartDate: LocalDate = startDate,
    val seriesEndDate: LocalDate = endDate,
)

data class CalendarPrivateItemsResponse(val items: List<CalendarPrivateItemResponse>)
