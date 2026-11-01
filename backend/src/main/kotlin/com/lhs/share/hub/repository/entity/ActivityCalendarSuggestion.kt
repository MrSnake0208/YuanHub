package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.convert.ValueConverter
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

enum class ActivityCalendarSuggestionStatus { PENDING, ACCEPTED, REJECTED }

data class ActivityCalendarSuggestionOriginal(
    val game: String,
    val title: String,
    val category: ActivityCalendarCategory,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val startDate: LocalDate,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val endDate: LocalDate? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val description: String? = null,
    val sourceUrl: String,
    val subtype: ActivityCalendarSubtype? = null,
    val subtypeDetail: ActivityCalendarSubtypeDetail? = null,
)

@Document("activity_calendar_suggestions")
@CompoundIndexes(
    CompoundIndex(name = "suggestion_request_unique", def = "{'submitterId':1,'clientRequestId':1}", unique = true),
    CompoundIndex(name = "suggestion_mine", def = "{'submitterId':1,'createdAt':-1,'_id':-1}"),
    CompoundIndex(name = "suggestion_mine_status", def = "{'submitterId':1,'status':1,'createdAt':-1,'_id':-1}"),
    CompoundIndex(name = "suggestion_queue", def = "{'createdAt':1,'_id':1}"),
    CompoundIndex(name = "suggestion_queue_status", def = "{'status':1,'createdAt':1,'_id':1}"),
    CompoundIndex(name = "suggestion_queue_game", def = "{'original.game':1,'createdAt':1,'_id':1}"),
    CompoundIndex(name = "suggestion_queue_status_game", def = "{'status':1,'original.game':1,'createdAt':1,'_id':1}"),
)
data class ActivityCalendarSuggestion(
    @Id val id: String,
    val submitterId: String,
    val clientRequestId: String,
    val createdAt: Instant,
    val original: ActivityCalendarSuggestionOriginal,
    val submissionNote: String? = null,
    val status: ActivityCalendarSuggestionStatus = ActivityCalendarSuggestionStatus.PENDING,
    val version: Long = 0,
    val reviewedBy: String? = null,
    val reviewedAt: Instant? = null,
    val reviewNote: String? = null,
    val eventId: String? = null,
    val acceptedSnapshot: ActivityCalendarEvent? = null,
)
