package com.lhs.share.hub.controller.calendar.request

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.service.calendar.calendarInvalid
import java.time.LocalDate
import java.time.format.DateTimeParseException

data class CalendarPrivateItemRequest(
    val accountId: String,
    val title: String,
    val date: LocalDate,
    val time: String?,
    val note: String,
    val expectedVersion: Long?,
    val endDate: LocalDate? = null,
    val timeProvided: Boolean = true,
    val noteProvided: Boolean = true,
    val reminderOn: String? = null,
    val reminderDaysBefore: Int = 0,
    val reminderOnProvided: Boolean = false,
    val reminderDaysBeforeProvided: Boolean = false,
    val recurrence: String = "NONE",
    val recurrenceProvided: Boolean = false,
)

object CalendarPrivateItemRequestDecoder {
    fun decode(node: JsonNode, update: Boolean): CalendarPrivateItemRequest {
        val required = setOf("account_id", "title") + if (update) setOf("expected_version") else emptySet()
        val allowed =
            required + setOf("date", "start_date", "end_date", "time", "note", "reminder_on", "reminder_days_before", "recurrence")
        if (!node.isObject || required.any { !node.has(it) } || node.fieldNames().asSequence().any { it !in allowed }) {
            throw calendarInvalid("私人事项请求字段不正确")
        }
        val range = node.has("start_date") || node.has("end_date")
        val parsedDate = date(node, if (range) "start_date" else "date")
        val endDate = if (range) date(node, "end_date") else null
        if (endDate != null && endDate < parsedDate) throw calendarInvalid("结束日期不能早于开始日期", "end_date")
        if (range && node.has("date") && date(node, "date") != parsedDate) {
            throw calendarInvalid("date须与start_date一致", "date")
        }
        val time = node.get("time")?.takeUnless { it.isNull }?.let {
            if (!it.isTextual || !it.asText().matches(Regex("([01][0-9]|2[0-3]):[0-5][0-9]"))) throw calendarInvalid("时间须为HH:mm", "time")
            it.asText()
        }
        val reminderOn = node.get("reminder_on")?.takeUnless { it.isNull }?.let {
            if (!it.isTextual || it.asText() !in setOf("START", "END")) throw calendarInvalid("提醒日期须为START或END，关闭请用null", "reminder_on")
            it.asText()
        }
        val reminderDaysBefore = node.get("reminder_days_before")?.let {
            if (!it.isIntegralNumber || !it.canConvertToInt() || it.intValue() !in 0..1) {
                throw calendarInvalid("仅支持当天或提前一天提醒", "reminder_days_before")
            }
            it.intValue()
        } ?: 0
        val recurrence = node.get("recurrence")?.let {
            if (!it.isTextual || it.asText() !in setOf("NONE", "MONTHLY")) throw calendarInvalid("仅支持不重复或每月固定", "recurrence")
            it.asText()
        } ?: "NONE"
        val version = if (update) {
            val value = node.get("expected_version")
            if (!value.isIntegralNumber || !value.canConvertToLong()) throw calendarInvalid("expected_version不正确")
            value.longValue().also(::requireVersion)
        } else {
            null
        }
        return CalendarPrivateItemRequest(
            text(node, "account_id", 128),
            text(node, "title", 100, trim = true),
            parsedDate,
            time,
            if (node.has("note")) text(node, "note", 1000, allowBlank = true) else "",
            version,
            endDate,
            node.has("time"),
            node.has("note"),
            reminderOn,
            reminderDaysBefore,
            node.has("reminder_on"),
            node.has("reminder_days_before"),
            recurrence,
            node.has("recurrence"),
        )
    }

    private fun date(node: JsonNode, key: String): LocalDate {
        val value = text(node, key, 10)
        if (!value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) || value.startsWith("0000")) throw calendarInvalid("日期不正确", key)
        return try {
            LocalDate.parse(value)
        } catch (_: DateTimeParseException) {
            throw calendarInvalid("日期不正确", key)
        }
    }

    fun requireVersion(value: Long) {
        if (value < 0 || value == Long.MAX_VALUE) throw calendarInvalid("expected_version不正确")
    }

    private fun text(node: JsonNode, key: String, limit: Int, allowBlank: Boolean = false, trim: Boolean = false): String {
        val raw = node.get(key)
        if (raw == null || !raw.isTextual) throw calendarInvalid("$key 必须为纯文本", key)
        val value = if (trim) raw.asText().trim() else raw.asText()
        if (value.length > limit || !allowBlank && value.isBlank()) throw calendarInvalid("$key 长度不正确", key)
        return value
    }
}
