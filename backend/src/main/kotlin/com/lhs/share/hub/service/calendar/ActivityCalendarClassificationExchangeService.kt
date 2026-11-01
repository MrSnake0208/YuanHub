package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.core.StreamReadConstraints
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.calendar.response.CalendarClassification
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationExport
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationExportRow
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationReport
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationRow
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest

@Service
class ActivityCalendarClassificationExchangeService(
    private val calendar: ActivityCalendarService,
    private val repository: ActivityCalendarRepository,
    mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    companion object {
        const val MAX_BYTES = 20 * 1024 * 1024
        const val MAX_ITEMS = 10_000
        const val MAX_ENVELOPE_BYTES = MAX_BYTES * 6 + 4096
    }

    private val mapper = mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .also { it.factory.setStreamReadConstraints(StreamReadConstraints.builder().maxStringLength(MAX_BYTES + 4096).build()) }
    private val options = linkedMapOf(
        "活动" to listOf("活动/周年", "地宫/鸢会", "签到/查岗"),
        "常驻" to listOf("当季星图", "白鸽", "密探特训", "历练/洞窟"),
        "卡池" to listOf("限定", "复刻", "照影", "自选"),
        "其他" to listOf("其他"),
    )
    private val targets = mapOf(
        CalendarClassification("活动", "活动/周年") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.LARGE_EVENT),
        CalendarClassification("活动", "地宫/鸢会") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.UNDERGROUND),
        CalendarClassification("活动", "签到/查岗") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.SIGN_IN),
        CalendarClassification("常驻", "当季星图") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.SEASONAL_STAR_CHART),
        CalendarClassification("常驻", "白鸽") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.WHITE_PIGEON),
        CalendarClassification("常驻", "密探特训") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.AGENT_TRAINING),
        CalendarClassification("常驻", "历练/洞窟") to (ActivityCalendarCategory.ACTIVITY to ActivityCalendarSubtype.TRIAL_CAVE),
        CalendarClassification("其他", "其他") to (ActivityCalendarCategory.OTHER to ActivityCalendarSubtype.OTHER),
    )
    private val aliases = mapOf(
        CalendarClassification("活动", "大型/周年") to CalendarClassification("活动", "活动/周年"),
        CalendarClassification("活动", "地宫") to CalendarClassification("活动", "地宫/鸢会"),
        CalendarClassification("活动", "签到/楼主查岗") to CalendarClassification("活动", "签到/查岗"),
        CalendarClassification("家具", "历练") to CalendarClassification("常驻", "历练/洞窟"),
        CalendarClassification("家具", "神秘洞窟") to CalendarClassification("常驻", "历练/洞窟"),
    )

    fun classification(event: ActivityCalendarEvent): CalendarClassification? {
        if (event.subtypeDetail != null) {
            return if (event.category == ActivityCalendarCategory.ACTIVITY && event.subtype == ActivityCalendarSubtype.FURNITURE &&
                event.subtypeDetail == ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE
            ) {
                CalendarClassification("常驻", "历练/洞窟")
            } else {
                null
            }
        }
        if (event.category == ActivityCalendarCategory.ACTIVITY &&
            event.subtype in setOf(ActivityCalendarSubtype.FURNITURE_TRIAL, ActivityCalendarSubtype.MYSTERIOUS_CAVE)
        ) {
            return CalendarClassification("常驻", "历练/洞窟")
        }
        if (event.category == ActivityCalendarCategory.LOGIN && event.subtype in setOf(null, ActivityCalendarSubtype.SIGN_IN)) {
            return CalendarClassification("活动", "签到/查岗")
        }
        return targets.entries.find { it.value == (event.category to event.subtype) }?.key
    }

    // Old v1 labels can preserve their existing records, but cannot assign an unconfirmed meaning to another record.
    private fun legacyClassification(event: ActivityCalendarEvent): CalendarClassification? = when {
        event.subtypeDetail != null -> null
        event.category == ActivityCalendarCategory.ACTIVITY && event.subtype == ActivityCalendarSubtype.FIRST_MEETING_ROULETTE ->
            CalendarClassification("活动", "初见日/转盘")
        event.category == ActivityCalendarCategory.MAINTENANCE && event.subtype == null -> CalendarClassification("其他", "维护")
        event.subtype == ActivityCalendarSubtype.MAINTENANCE &&
            event.category in setOf(ActivityCalendarCategory.OTHER, ActivityCalendarCategory.MAINTENANCE) ->
            CalendarClassification("其他", "维护")
        event.category == ActivityCalendarCategory.SHOP &&
            event.subtype in setOf(null, ActivityCalendarSubtype.ACTIVITY_SHOP, ActivityCalendarSubtype.RECRUITMENT_SHOP) ->
            CalendarClassification("其他", "商店")
        event.category == ActivityCalendarCategory.OTHER && event.subtype == ActivityCalendarSubtype.STAR_POOL ->
            CalendarClassification("其他", "星池")
        else -> null
    }

    fun export(): CalendarClassificationExport {
        val entries = calendar.adminItems(null, null, null, null, null, null).items
        val events = repository.findAll(entries.filter { !it.readOnly }.map { it.item.id }).associateBy { it.id }
        val document = CalendarClassificationExport(
            classificationOptions = options,
            items = entries.filter { !it.readOnly }.map { entry ->
                val event = events[entry.item.id] ?: throw calendarConflict()
                CalendarClassificationExportRow(event.id, event.version ?: 0L, calendar.adminItem(event), classification(event))
            },
            referenceItems = entries.filter { it.readOnly },
        )
        if (entries.size > MAX_ITEMS ||
            mapper.writeValueAsBytes(document).size > MAX_BYTES
        ) {
            throw calendarInvalid("全量资料超过10000条或20 MiB，未导出；请先联系维护者调整容量")
        }
        return document
    }

    fun envelope(bytes: ByteArray): Pair<String, String?> {
        if (bytes.size > MAX_ENVELOPE_BYTES) throw calendarInvalid("分类文件最多20 MiB")
        val text = try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: java.nio.charset.CharacterCodingException) {
            throw calendarInvalid("请使用UTF-8 JSON")
        }
        val node = parse(text)
        fields(node, setOf("json", "preview_token"))
        if (!node.path("json").isTextual ||
            (node.has("preview_token") && !node["preview_token"].isTextual)
        ) {
            throw calendarInvalid("json或preview_token格式错误")
        }
        return node["json"].asText() to node.get("preview_token")?.asText()
    }

    private fun parse(text: String): JsonNode = try {
        mapper.readTree(text) ?: throw calendarInvalid("JSON不能为空")
    } catch (_: JsonProcessingException) {
        throw calendarInvalid("JSON格式错误，请检查重复字段、括号和引号")
    }

    private fun fields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject) throw calendarInvalid("须为JSON对象")
        node.fieldNames().forEachRemaining { if (it !in allowed) throw calendarInvalid("不接受字段 $it") }
    }

    private fun document(json: String): JsonNode {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_BYTES) throw calendarInvalid("分类文件最多20 MiB")
        val node = parse(json)
        fields(node, setOf("document_type", "schema_version", "exported_at", "classification_options", "items", "reference_items"))
        if (node.path("document_type").asText() != "activity-calendar-classification" || !node.path("schema_version").isIntegralNumber ||
            node["schema_version"].bigIntegerValue() != java.math.BigInteger.ONE
        ) {
            throw calendarInvalid("请选择导出全部生成的分类文件，不支持新增型JSON v1")
        }
        if (!node.path("items").isArray || !node.path("reference_items").isArray ||
            node["items"].size() + node["reference_items"].size() > MAX_ITEMS
        ) {
            throw calendarInvalid("items和reference_items须为数组，总计最多10000条")
        }
        return node
    }

    fun preview(json: String): CalendarClassificationReport {
        val root = document(json)
        val nodes = root["items"]
        val events = repository.findAll(
            nodes.mapNotNull {
                it.get("id")?.takeIf { value -> value.isTextual }?.asText()
            },
        ).associateBy { it.id }
        val seen = mutableSetOf<String>()
        val rows = nodes.mapIndexed { index, node ->
            val id = node.path("id").asText("")
            val event = events[id]
            val before = event?.let(::classification)
            var after: CalendarClassification? = null
            var preserveLegacy = false
            try {
                fields(node, setOf("id", "expected_version", "original", "classification"))
                if (!node.path("id").isTextual || id.isBlank() || !seen.add(id)) throw calendarInvalid("活动ID为空或重复")
                if (id.startsWith("recruitment:") || event == null ||
                    event.category == ActivityCalendarCategory.RECRUITMENT
                ) {
                    throw calendarInvalid("活动不存在或是只读卡池，不能更新")
                }
                val version = node.path("expected_version")
                if (!version.isIntegralNumber || !version.canConvertToLong() || version.asLong() < 0 ||
                    version.asLong() == Long.MAX_VALUE
                ) {
                    throw calendarInvalid("expected_version须为非负整数")
                }
                if (!node.has("classification")) throw calendarInvalid("缺少classification，保留null表示不更新")
                val target = node["classification"]
                if (!target.isNull) {
                    fields(target, setOf("level1", "level2"))
                    if (!target.path("level1").isTextual || !target.path("level2").isTextual) throw calendarInvalid("分类须填写完整中文一级和二级")
                    after = CalendarClassification(target["level1"].asText(), target["level2"].asText())
                    after = aliases[after] ?: after
                    if (after !in targets) {
                        preserveLegacy = after == legacyClassification(event)
                        if (!preserveLegacy) {
                            throw calendarInvalid("分类组合不合法或旧分类已停用，请按新版classification_options重新选择；卡池只能在招募目录维护")
                        }
                    }
                }
                val status = when {
                    after == null -> "SKIPPED"
                    preserveLegacy || before == after -> "UNCHANGED"
                    version.asLong() != (event.version ?: 0L) -> "CONFLICT"
                    else -> "READY"
                }
                CalendarClassificationRow(
                    index + 1,
                    id,
                    event.title,
                    status,
                    before,
                    after,
                    if (status ==
                        "CONFLICT"
                    ) {
                        "导出后活动已修改，请重新导出核对"
                    } else {
                        null
                    },
                )
            } catch (error: ActivityCalendarApiException) {
                CalendarClassificationRow(index + 1, id, event?.title ?: id, "INVALID", before, after, error.message)
            }
        }
        val snapshot = events.values.sortedBy { it.id }
        val token = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(listOf(json, rows, snapshot))).joinToString("") {
            "%02x".format(it)
        }
        return CalendarClassificationReport(
            total = nodes.size(),
            ready = rows.count { it.status == "READY" },
            unchanged = rows.count { it.status == "UNCHANGED" },
            skipped = rows.count { it.status == "SKIPPED" },
            invalid = rows.count { it.status == "INVALID" },
            conflicts = rows.count { it.status == "CONFLICT" },
            referenceCount = root["reference_items"].size(),
            rows = rows,
            previewToken = token,
        )
    }

    fun commit(actor: String, json: String, token: String?): CalendarClassificationReport {
        try {
            return transactions.execute {
                val report = preview(json)
                if (report.invalid > 0) throw calendarInvalid("整批未写入，请修正无效条目")
                if (report.conflicts > 0 || token.isNullOrBlank() || token != report.previewToken) throw calendarConflict()
                report.rows.filter { it.status == "READY" }.forEach { row ->
                    val event = repository.find(row.id) ?: throw calendarConflict()
                    val target = targets.getValue(row.after!!)
                    if (!repository.updateClassification(event, target.first, target.second, actor)) throw calendarConflict()
                }
                report.copy(
                    updated = report.ready,
                    ready = 0,
                    rows = report.rows.map {
                        if (it.status ==
                            "READY"
                        ) {
                            it.copy(status = "UPDATED")
                        } else {
                            it
                        }
                    },
                )
            } ?: error("Classification transaction returned no result")
        } catch (error: RuntimeException) {
            if (generateSequence<Throwable>(error) { it.cause }.any {
                    it is MongoException &&
                        (it.code in setOf(112, 251) || it.hasErrorLabel("TransientTransactionError"))
                }
            ) {
                throw calendarConflict()
            }
            throw error
        }
    }
}
