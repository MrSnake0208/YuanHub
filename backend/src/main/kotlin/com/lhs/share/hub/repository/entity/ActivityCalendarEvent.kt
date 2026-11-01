package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.convert.ValueConverter
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

enum class ActivityCalendarCategory {
    ACTIVITY,
    RECRUITMENT,
    LOGIN,
    SHOP,
    MAINTENANCE,
    OTHER,
}

enum class ActivityCalendarSubtype(val categories: Set<ActivityCalendarCategory>) {
    LARGE_EVENT(setOf(ActivityCalendarCategory.ACTIVITY)),
    SEASONAL_STAR_CHART(setOf(ActivityCalendarCategory.ACTIVITY)),
    WHITE_PIGEON(setOf(ActivityCalendarCategory.ACTIVITY)),
    AGENT_TRAINING(setOf(ActivityCalendarCategory.ACTIVITY)),
    TRIAL_CAVE(setOf(ActivityCalendarCategory.ACTIVITY)),
    OTHER(setOf(ActivityCalendarCategory.OTHER)),
    MEDIUM_EVENT(setOf(ActivityCalendarCategory.ACTIVITY)),
    UNDERGROUND(setOf(ActivityCalendarCategory.ACTIVITY)),
    TAISHAN_FU(setOf(ActivityCalendarCategory.ACTIVITY)),
    SIGN_IN(setOf(ActivityCalendarCategory.ACTIVITY, ActivityCalendarCategory.LOGIN)),
    FIRST_MEETING_ROULETTE(setOf(ActivityCalendarCategory.ACTIVITY)),
    FURNITURE_TRIAL(setOf(ActivityCalendarCategory.ACTIVITY)),
    MYSTERIOUS_CAVE(setOf(ActivityCalendarCategory.ACTIVITY)),
    FURNITURE(setOf(ActivityCalendarCategory.ACTIVITY)),
    RECRUITMENT_SHOP(setOf(ActivityCalendarCategory.SHOP)),
    ACTIVITY_SHOP(setOf(ActivityCalendarCategory.SHOP)),
    MAINTENANCE(setOf(ActivityCalendarCategory.OTHER, ActivityCalendarCategory.MAINTENANCE)),
    STAR_POOL(setOf(ActivityCalendarCategory.OTHER)),
}

enum class ActivityCalendarSubtypeDetail { MYSTERIOUS_CAVE }

@Document("activity_calendar_events")
data class ActivityCalendarEvent(
    @Id val id: String,
    val game: String,
    val title: String,
    val category: ActivityCalendarCategory,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val startDate: LocalDate,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val endDate: LocalDate? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val timeZone: String = "Asia/Shanghai",
    val description: String? = null,
    val sourceUrl: String? = null,
    val sourceNote: String? = null,
    val enabled: Boolean = true,
    val createdBy: String,
    val createdAt: Instant,
    val updatedBy: String,
    val updatedAt: Instant,
    @Version val version: Long? = null,
    val subtype: ActivityCalendarSubtype? = null,
    val subtypeDetail: ActivityCalendarSubtypeDetail? = null,
)
