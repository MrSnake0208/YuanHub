package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("activity_calendar_subscriptions")
@CompoundIndex(name = "calendar_subscription_owner_event", def = "{'userId': 1, 'accountId': 1, 'eventId': 1}", unique = true)
data class ActivityCalendarSubscription(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val eventId: String,
    val game: String,
    val subscribed: Boolean = true,
    val completed: Boolean = false,
    val checklist: List<CalendarChecklistEntry> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
    @Version val version: Long? = null,
    val memoTitle: String = "本期备忘",
    val memoNote: String = "",
    val manualCompleted: Boolean? = null,
) {
    fun isCompleted(): Boolean = manualCompleted == true
}

data class CalendarChecklistEntry(val id: String, val title: String, val completed: Boolean)
