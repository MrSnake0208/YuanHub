package com.lhs.share.hub.controller.calendar.response

import java.time.Instant

data class CalendarClassification(val level1: String, val level2: String)

data class CalendarClassificationExportRow(
    val id: String,
    val expectedVersion: Long,
    val original: ActivityCalendarAdminItem,
    val classification: CalendarClassification?,
)

data class CalendarClassificationExport(
    val documentType: String = "activity-calendar-classification",
    val schemaVersion: Int = 1,
    val exportedAt: Instant = Instant.now(),
    val classificationOptions: Map<String, List<String>>,
    val items: List<CalendarClassificationExportRow>,
    val referenceItems: List<ActivityCalendarAdminItem>,
)

data class CalendarClassificationRow(
    val row: Int,
    val id: String,
    val title: String,
    val status: String,
    val before: CalendarClassification?,
    val after: CalendarClassification?,
    val issue: String? = null,
)

data class CalendarClassificationReport(
    val total: Int,
    val ready: Int,
    val unchanged: Int,
    val skipped: Int,
    val invalid: Int,
    val conflicts: Int,
    val referenceCount: Int,
    val rows: List<CalendarClassificationRow>,
    val previewToken: String,
    val updated: Int = 0,
)
