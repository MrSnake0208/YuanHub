package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

@Document("activity_calendar_private_items")
@CompoundIndex(name = "calendar_private_owner_date", def = "{'userId': 1, 'accountId': 1, 'game': 1, 'date': 1, '_id': 1}")
data class CalendarPrivateItem(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val title: String,
    val date: LocalDate,
    val time: String?,
    val note: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    @Version val version: Long? = null,
    val endDate: LocalDate? = null,
    val reminderOn: String? = null,
    val reminderDaysBefore: Int = 0,
    val recurrence: String = "NONE",
    val excludedDates: Set<LocalDate> = emptySet(),
)
