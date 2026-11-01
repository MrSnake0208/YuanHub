package com.lhs.share.hub.controller.calendar.request

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.CalendarChecklistEntry
import com.lhs.share.hub.service.calendar.calendarInvalid

data class CalendarSubscribeRequest(val accountId: String, val expectedVersion: Long?, val subscribed: Boolean)
data class CalendarCompletionRequest(val accountId: String, val expectedVersion: Long, val completed: Boolean)
data class CalendarProgressRequest(
    val accountId: String,
    val expectedVersion: Long,
    val completed: Boolean,
    val checklist: List<CalendarChecklistEntry>,
    val memoTitle: String? = null,
    val memoNote: String? = null,
    val manualCompleted: Boolean? = null,
    val progressMode: String? = null,
)

object CalendarSubscriptionRequestDecoder {
    fun completion(node: JsonNode): CalendarCompletionRequest {
        fields(node, setOf("account_id", "expected_version", "completed"))
        return CalendarCompletionRequest(string(node, "account_id"), checkNotNull(version(node, false)), boolean(node, "completed"))
    }

    fun subscribe(node: JsonNode): CalendarSubscribeRequest {
        fields(node, setOf("account_id", "expected_version", "subscribed"))
        return CalendarSubscribeRequest(string(node, "account_id"), version(node, true), boolean(node, "subscribed"))
    }

    fun progress(node: JsonNode): CalendarProgressRequest {
        fields(
            node,
            setOf("account_id", "expected_version", "completed", "checklist"),
            setOf("memo_title", "memo_note", "manual_completed", "progress_mode"),
        )
        val mode = node.get("progress_mode")?.let {
            if (!it.isTextual || it.asText() != "checklist") throw calendarInvalid("不支持的待办保存协议")
            if (listOf("memo_title", "memo_note", "manual_completed").any(node::has) || boolean(node, "completed")) {
                throw calendarInvalid("待办保存不能同时修改历史备忘或整期完成状态")
            }
            it.asText()
        }
        val list = node.get("checklist") ?: throw calendarInvalid("请提供待办清单")
        if (!list.isArray || list.size() > 50) throw calendarInvalid("待办清单最多50项")
        val entries = list.map {
            fields(it, setOf("id", "title", "completed"))
            CalendarChecklistEntry(string(it, "id"), string(it, "title"), boolean(it, "completed"))
        }
        return CalendarProgressRequest(
            string(node, "account_id"),
            checkNotNull(version(node, false)),
            boolean(node, "completed"),
            entries,
            optionalText(node, "memo_title", 60, false),
            optionalText(node, "memo_note", 1000, true),
            if (node.has("manual_completed")) boolean(node, "manual_completed") else null,
            mode,
        )
    }

    private fun fields(node: JsonNode, required: Set<String>, optional: Set<String> = emptySet()) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in required && it !in optional } || required.any { !node.has(it) }) {
            throw calendarInvalid("请求字段不正确")
        }
    }

    private fun optionalText(node: JsonNode, key: String, limit: Int, allowBlank: Boolean): String? {
        val value = node.get(key) ?: return null
        if (!value.isTextual || value.asText().length > limit || (!allowBlank && value.asText().isBlank())) {
            throw calendarInvalid(if (key == "memo_title") "备忘标题须为1–60字，不能为空" else "文字备注须为纯文本，最多1000字")
        }
        return value.asText()
    }

    private fun string(node: JsonNode, key: String): String {
        val value = node.get(key)
        if (value == null || !value.isTextual || value.asText().isBlank() || value.asText().length > 128) {
            throw calendarInvalid("$key 不正确")
        }
        return value.asText()
    }

    private fun boolean(node: JsonNode, key: String): Boolean {
        val value = node.get(key)
        if (value == null || !value.isBoolean) throw calendarInvalid("$key 必须为布尔值")
        return value.booleanValue()
    }

    private fun version(node: JsonNode, nullable: Boolean): Long? {
        val value = node.get("expected_version") ?: throw calendarInvalid("请提供expected_version")
        if (nullable && value.isNull) return null
        if (!value.isIntegralNumber || !value.canConvertToLong() || value.longValue() < 0 || value.longValue() == Long.MAX_VALUE) {
            throw calendarInvalid("expected_version不正确")
        }
        return value.longValue()
    }
}
