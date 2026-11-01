package com.lhs.share.hub.controller.calendar.request

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonMappingException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.lhs.share.hub.service.calendar.calendarInvalid
import java.time.LocalDate

data class ActivityCalendarWriteRequest(
    val game: String,
    val title: String,
    val category: ActivityCalendarCategory,
    val startDate: LocalDate,
    val endDate: LocalDate? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val timeZone: String = "Asia/Shanghai",
    val description: String? = null,
    val sourceUrl: String? = null,
    val sourceNote: String? = null,
    val enabled: Boolean = true,
    val expectedVersion: Long? = null,
    val subtype: ActivityCalendarSubtype? = null,
    val subtypeDetail: ActivityCalendarSubtypeDetail? = null,
)

/** Use the same strict boundary as recruitment, without changing the shared mapper. */
class ActivityCalendarRequestDecoder(mapper: ObjectMapper) {
    private val reader = mapper.copy().enable(
        DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
        DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
    ).disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)

    fun read(node: JsonNode): ActivityCalendarWriteRequest {
        if (!node.isObject) throw calendarInvalid("请求必须是JSON对象")
        val fields = setOf(
            "game", "title", "category", "start_date", "end_date", "start_time", "end_time", "time_zone",
            "description", "source_url", "source_note", "enabled", "expected_version", "subtype", "subtype_detail",
        )
        node.fieldNames().forEachRemaining { field ->
            if (field !in fields) throw calendarInvalid("不接受字段 $field", field)
        }
        for (field in listOf("game", "title", "category", "start_date")) {
            if (!node.hasNonNull(field)) throw calendarInvalid("缺少必填字段 $field", field)
        }
        // Jackson still coerces numbers to strings and accepts ordinal enums despite ALLOW_COERCION_OF_SCALARS.
        for (field in listOf(
            "game", "title", "category", "start_time", "end_time", "time_zone", "description", "source_url", "source_note",
            "subtype", "subtype_detail",
        )) {
            val value = node.get(field)
            if (value != null && !value.isNull && !value.isTextual) throw calendarInvalid("$field 必须是字符串", field)
        }
        if (node.has("enabled") && !node["enabled"].isBoolean) throw calendarInvalid("enabled 必须是布尔值", "enabled")
        if (node.has("time_zone") && node["time_zone"].isNull) throw calendarInvalid("time_zone 必须是字符串", "time_zone")
        if (ActivityCalendarCategory.entries.none { it.name == node["category"].asText() }) {
            throw calendarInvalid("不支持的活动类别", "category")
        }
        for ((field, allowed) in listOf(
            "subtype" to ActivityCalendarSubtype.entries.map { it.name },
            "subtype_detail" to ActivityCalendarSubtypeDetail.entries.map { it.name },
        )) {
            if (node.hasNonNull(field) && node[field].asText() !in allowed) throw calendarInvalid("不支持的细分类别或细目", field)
        }
        for (field in listOf("start_date", "end_date")) {
            val value = node.get(field)
            if (field == "end_date" && (value == null || value.isNull)) continue
            if (value == null || !value.isTextual || !Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(value.asText())) {
                throw calendarInvalid("日期必须为YYYY-MM-DD字符串", field)
            }
        }
        return try {
            reader.treeToValue(node, ActivityCalendarWriteRequest::class.java)
        } catch (error: com.fasterxml.jackson.core.JsonProcessingException) {
            val field = (error as? JsonMappingException)?.path?.firstOrNull()?.fieldName
            throw calendarInvalid("${field ?: "请求"}字段或类型不符合活动日历要求", field)
        }
    }
}
