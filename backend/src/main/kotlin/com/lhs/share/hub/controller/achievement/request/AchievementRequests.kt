package com.lhs.share.hub.controller.achievement.request

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import java.time.LocalDate

data class AchievementPatch(
    val achievementId: String,
    val fields: Set<String>,
    val status: String = "pending",
    val favorite: Boolean = false,
    val note: String = "",
    val progress: Double? = null,
    val completedOn: LocalDate? = null,
)
data class AchievementWriteRequest(val accountId: String, val expectedRevision: Long, val records: List<AchievementPatch>)
data class AchievementImportRequest(
    val accountId: String,
    val document: JsonNode,
    val strategy: String,
    val skipUnknown: Boolean,
    val expectedRevision: Long? = null,
    val catalogVersion: String? = null,
    val previewToken: String? = null,
)

object AchievementRequestDecoder {
    const val MAX_BYTES = 16 * 1024 * 1024
    const val MAX_IMPORT = 5000
    val CONTENT_FIELDS = setOf("achievement_id", "status", "favorite", "note", "progress", "completed_on")
    private val metadata =
        setOf("updated_at", "revision", "source", "state_source", "state_updated_at", "progress_source", "progress_updated_at")

    fun invalid(message: String): Nothing = throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "achievement_invalid", message)

    fun objectFields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in allowed }) invalid("JSON 包含未知字段或不是对象")
    }

    fun text(node: JsonNode, name: String): String = node[name]?.takeIf { it.isTextual }?.textValue()
        ?: invalid("$name 必须是文本")

    fun revision(node: JsonNode): Long =
        node["expected_revision"]?.takeIf { it.isIntegralNumber && it.canConvertToLong() && it.longValue() >= 0 }
            ?.longValue() ?: invalid("请提供非负整数 expected_revision")

    fun patch(node: JsonNode, importing: Boolean = false): AchievementPatch {
        objectFields(node, if (importing) CONTENT_FIELDS + metadata else CONTENT_FIELDS)
        val id = text(node, "achievement_id")
        if (!id.matches(Regex("[A-Za-z0-9_-]{1,100}"))) invalid("achievement_id 无效")
        val fields = node.fieldNames().asSequence().filter { it in CONTENT_FIELDS }.toSet() - "achievement_id"
        if (fields.isEmpty()) invalid("未提供个人记录字段")
        val status = if ("status" in fields) text(node, "status") else "pending"
        if (status !in setOf("pending", "incomplete", "completed")) invalid("status 只支持 pending/incomplete/completed")
        val favorite = if ("favorite" in
            fields
        ) {
            node["favorite"].takeIf { it.isBoolean }?.booleanValue() ?: invalid("favorite 必须是布尔值")
        } else {
            false
        }
        val note = if ("note" in fields) text(node, "note") else ""
        if (note.length > 500) invalid("备注最多500字")
        val progress = node["progress"]?.takeUnless { it.isNull }?.let {
            if (!it.isNumber || !it.doubleValue().isFinite() || it.doubleValue() < 0 || it.doubleValue() > 9007199254740991.0 ||
                it.decimalValue().stripTrailingZeros().scale() > 0
            ) {
                invalid("进度必须是非负安全整数；旧小数备份请先核对，不能自动截断")
            }
            it.doubleValue()
        }
        val date = node["completed_on"]?.takeUnless { it.isNull }?.let {
            if (!it.isTextual || !it.textValue().matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) invalid("完成日期须为 YYYY-MM-DD 或 null")
            try {
                LocalDate.parse(it.textValue()).also { value -> if (value.year !in 1..9999) invalid("完成日期无效") }
            } catch (_: java.time.DateTimeException) {
                invalid("完成日期无效")
            }
        }
        return AchievementPatch(id, fields, status, favorite, note, progress, date)
    }

    fun write(node: JsonNode, id: String? = null): AchievementWriteRequest {
        objectFields(
            node,
            if (id ==
                null
            ) {
                setOf("account_id", "expected_revision", "records")
            } else {
                setOf("account_id", "expected_revision") + CONTENT_FIELDS -
                    "achievement_id"
            },
        )
        val rows = if (id != null) {
            val record = node.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            record.remove(listOf("account_id", "expected_revision"))
            record.put("achievement_id", id)
            listOf(patch(record))
        } else {
            val records = node["records"]?.takeIf { it.isArray && it.size() in 1..50 } ?: invalid("批量须选中1–50条")
            records.map { patch(it) }
        }
        if (rows.map { it.achievementId }.distinct().size != rows.size) invalid("批量中存在重复 ID")
        return AchievementWriteRequest(text(node, "account_id"), revision(node), rows)
    }

    fun exchange(node: JsonNode, confirm: Boolean): AchievementImportRequest {
        objectFields(
            node,
            setOf("account_id", "document", "strategy", "skip_unknown") +
                if (confirm) setOf("expected_revision", "catalog_version", "preview_token") else emptySet(),
        )
        val document = node["document"] ?: invalid("缺少 document")
        if (document.toString().toByteArray(Charsets.UTF_8).size > MAX_BYTES) {
            throw InventoryApiException(HttpStatus.PAYLOAD_TOO_LARGE, "achievement_import_too_large", "成就文件最多16MiB")
        }
        val strategy = node["strategy"]?.let { text(node, "strategy") } ?: "keep_current"
        if (strategy !in setOf("keep_current", "use_file")) invalid("导入策略无效")
        val skip = node["skip_unknown"]?.let {
            if (!it.isBoolean) invalid("skip_unknown 必须是布尔值")
            it.booleanValue()
        } ?: false
        return AchievementImportRequest(
            text(node, "account_id"),
            document,
            strategy,
            skip,
            if (confirm) revision(node) else null,
            if (confirm) text(node, "catalog_version") else null,
            if (confirm) text(node, "preview_token") else null,
        )
    }
}
