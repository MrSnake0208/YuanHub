package com.lhs.share.hub.controller.calendar.request

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.service.calendar.calendarInvalid

data class ActivityCalendarSuggestionSubmitRequest(
    val event: ActivityCalendarWriteRequest,
    val submissionNote: String?,
    val clientRequestId: String,
)

data class ActivityCalendarSuggestionAcceptRequest(
    val expectedVersion: Long,
    val event: ActivityCalendarWriteRequest,
    val reviewNote: String?,
)

data class ActivityCalendarSuggestionRejectRequest(val expectedVersion: Long, val reviewNote: String)

/** The public boundary never accepts server-owned fields, including enabled and source_note. */
class ActivityCalendarSuggestionRequestDecoder(mapper: ObjectMapper) {
    private val calendar = ActivityCalendarRequestDecoder(mapper)
    private val originalFields = setOf(
        "game", "title", "category", "start_date", "end_date", "start_time", "end_time", "description", "source_url",
        "subtype", "subtype_detail",
    )

    fun submit(node: JsonNode): ActivityCalendarSuggestionSubmitRequest {
        fields(node, originalFields + setOf("submission_note", "client_request_id"))
        val original = (node as ObjectNode).deepCopy().apply { remove(listOf("submission_note", "client_request_id")) }
        return ActivityCalendarSuggestionSubmitRequest(
            calendar.read(original),
            text(node, "submission_note"),
            text(node, "client_request_id", true)!!,
        )
    }

    fun accept(node: JsonNode): ActivityCalendarSuggestionAcceptRequest {
        fields(node, setOf("expected_version", "event", "review_note"))
        val event = node.get("event") ?: throw calendarInvalid("必须提供活动资料")
        fields(event, originalFields + setOf("time_zone", "source_note", "enabled"))
        return ActivityCalendarSuggestionAcceptRequest(version(node), calendar.read(event), text(node, "review_note"))
    }

    fun reject(node: JsonNode): ActivityCalendarSuggestionRejectRequest {
        fields(node, setOf("expected_version", "review_note"))
        return ActivityCalendarSuggestionRejectRequest(version(node), text(node, "review_note", true)!!)
    }

    private fun fields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in allowed }) throw calendarInvalid("请求字段不符合建议要求")
    }

    private fun text(node: JsonNode, name: String, required: Boolean = false): String? {
        val value = node.get(name)
        if (value == null || value.isNull) {
            if (required) throw calendarInvalid("必须提供$name")
            return null
        }
        if (!value.isTextual) throw calendarInvalid("${name}必须是字符串")
        return value.asText()
    }

    private fun version(node: JsonNode): Long {
        val value = node.get("expected_version")
        if (value == null || !value.isIntegralNumber || !value.canConvertToLong() || value.asLong() < 0 ||
            value.asLong() == Long.MAX_VALUE
        ) {
            throw calendarInvalid("expected_version不正确")
        }
        return value.asLong()
    }
}
