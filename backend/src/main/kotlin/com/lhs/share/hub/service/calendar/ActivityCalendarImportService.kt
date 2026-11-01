package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarRequestDecoder
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.response.CalendarImportIssue
import com.lhs.share.hub.controller.calendar.response.CalendarImportReport
import com.lhs.share.hub.controller.calendar.response.CalendarImportRow
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import org.slf4j.LoggerFactory
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest

@Service
class ActivityCalendarImportService(
    private val calendar: ActivityCalendarService,
    private val repository: ActivityCalendarRepository,
    mapper: ObjectMapper,
) {
    companion object {
        const val MAX_BYTES = 1024 * 1024
        const val MAX_ITEMS = 200
        const val MAX_ENVELOPE_BYTES = MAX_BYTES * 6 + 4096
    }

    private val mapper = mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
    private val decoder = ActivityCalendarRequestDecoder(mapper)
    private val log = LoggerFactory.getLogger(javaClass)

    fun envelope(bytes: ByteArray): Pair<String, String?> {
        if (bytes.size > MAX_ENVELOPE_BYTES) throw calendarInvalid("请求过大，JSON原文最多1 MiB", "json")
        val node = parse(utf8(bytes))
        if (!node.isObject || !node.path("json").isTextual) throw calendarInvalid("json 必须是原始JSON文本", "json")
        node.fieldNames().forEachRemaining {
            if (it !in setOf("json", "preview_token")) throw calendarInvalid("不接受字段 $it", it)
        }
        if (node.has("preview_token") && !node["preview_token"].isTextual) {
            throw calendarInvalid("preview_token 必须是字符串", "preview_token")
        }
        return node["json"].textValue() to node.get("preview_token")?.textValue()
    }

    fun preview(json: String): CalendarImportReport {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_BYTES) throw calendarInvalid("JSON原文最多1 MiB", "json")
        val root = parse(json)
        val items = when {
            root.isArray -> root
            root.isObject -> {
                root.fieldNames().forEachRemaining {
                    if (it !in setOf("schema_version", "items")) throw calendarInvalid("不接受顶层字段 $it", it)
                }
                if (!root.path("schema_version").isIntegralNumber || root["schema_version"].bigIntegerValue() != java.math.BigInteger.ONE) {
                    throw calendarInvalid("只支持 schema_version=1", "schema_version")
                }
                root.path("items")
            }
            else -> throw calendarInvalid("JSON须为schema_version=1/items对象或活动数组", "items")
        }
        if (!items.isArray || items.size() !in 1..MAX_ITEMS) throw calendarInvalid("items 须为1至200条活动的数组", "items")
        val existing = repository.list(null, null, null, emptySet(), null)
            .filter { it.category != ActivityCalendarCategory.RECRUITMENT }
        val byKey = existing.groupBy { key(request(it)) }
        val byId = existing.associateBy { it.id }
        val seen = mutableMapOf<String, CalendarImportRow>()
        val rows = items.mapIndexed { index, node ->
            val base = CalendarImportRow(
                index + 1,
                "INVALID",
                node.path("title").takeIf { it.isTextual }?.asText().orEmpty(),
                node.path("game").takeIf { it.isTextual }?.asText().orEmpty(),
            )
            try {
                if (node.has("expected_version")) throw calendarInvalid("导入不接受服务器字段 expected_version", "expected_version")
                val data = calendar.validate(decoder.read(node))
                val key = key(data)
                val row = base.copy(title = data.title, game = data.game, data = data)
                val previous = seen[key]
                when {
                    previous != null -> {
                        val differences = differences(data, previous.data!!)
                        row.copy(
                            status = if (differences.isEmpty()) "DUPLICATE" else "CONFLICT",
                            issues = if (differences.isEmpty()) {
                                listOf(CalendarImportIssue("items", "与第${previous.row}条重复，将跳过"))
                            } else {
                                differences.map { CalendarImportIssue(it, "与第${previous.row}条同一活动的 $it 不一致，请修正") }
                            },
                        )
                    }
                    else -> {
                        val matches = byKey[key].orEmpty()
                        val occupied = byId[importId(key)]
                        val result = when {
                            matches.isNotEmpty() -> row.copy(
                                status = "EXISTS",
                                eventId = matches.first().id,
                                issues = matches.flatMap { differences(data, request(it)) }.distinct().map {
                                    CalendarImportIssue(it, "已存在活动的 $it 不一致；保留数据库内容，跳过导入")
                                },
                            )
                            occupied != null -> row.copy(
                                status = "CONFLICT",
                                issues = listOf(
                                    CalendarImportIssue("items", "原导入活动已被编辑，导入标识被占用；请人工检查目录"),
                                ),
                            )
                            else -> row.copy(status = "READY")
                        }
                        seen[key] = result
                        result
                    }
                }
            } catch (error: ActivityCalendarApiException) {
                base.copy(issues = listOf(CalendarImportIssue(error.field ?: "items", error.message)))
            }
        }
        // Bind only relevant records; unrelated calendar edits need not expire this preview.
        val relevantKeys = rows.mapNotNull { it.data?.let(::key) }.toSet()
        val relevantIds = relevantKeys.map(::importId).toSet()
        val snapshot = existing.filter { key(request(it)) in relevantKeys || it.id in relevantIds }.sortedBy { it.id }
        return report(rows).copy(previewToken = digest(mapper.writeValueAsBytes(listOf(json, rows, snapshot))))
    }

    fun commit(actor: String, json: String, token: String?): CalendarImportReport {
        val preview = preview(json)
        if (preview.invalid > 0 || preview.conflicts > 0) throw calendarInvalid("整批未写入：请修正无效或冲突条目后重新预览", "items")
        if (token.isNullOrBlank() || token != preview.previewToken) {
            throw ActivityCalendarApiException(HttpStatus.CONFLICT, "calendar_import_preview_expired", "JSON或活动目录已变化，整批未写入，请重新预览")
        }
        val rows = preview.rows.map { row ->
            if (row.status != "READY") return@map row
            val data = row.data!!
            val id = importId(key(data))
            try {
                val event = calendar.insertImported(actor, id, data)
                row.copy(status = "CREATED", eventId = event.id)
            } catch (_: DuplicateKeyException) {
                try {
                    val current = repository.find(id)
                    if (current != null && key(request(current)) == key(data) && differences(data, request(current)).isEmpty()) {
                        row.copy(status = "EXISTS", eventId = current.id, issues = listOf(CalendarImportIssue("items", "并发请求已创建，跳过")))
                    } else {
                        row.copy(status = "FAILED", issues = listOf(CalendarImportIssue("items", "并发内容发生冲突，请重新预览；未覆盖")))
                    }
                } catch (error: Exception) {
                    failed(row, error)
                }
            } catch (error: Exception) {
                failed(row, error)
            }
        }
        return report(rows)
    }

    private fun failed(row: CalendarImportRow, error: Exception): CalendarImportRow {
        log.warn("Calendar import row {} write not confirmed", row.row, error)
        return row.copy(status = "FAILED", issues = listOf(CalendarImportIssue("items", "写入未确认，请重新预览原JSON后安全重试")))
    }

    private fun report(rows: List<CalendarImportRow>) = CalendarImportReport(
        rows.size, rows.count { it.status == "READY" }, rows.count { it.status == "EXISTS" }, rows.count { it.status == "DUPLICATE" },
        rows.count { it.status == "INVALID" }, rows.count { it.status == "CONFLICT" },
        rows.count { it.status in setOf("READY", "CREATED") && it.data?.enabled == true },
        rows.count { it.status == "CREATED" }, rows.count { it.status == "FAILED" }, rows,
    )

    private fun request(event: ActivityCalendarEvent) = ActivityCalendarWriteRequest(
        event.game, event.title.trim(), event.category, event.startDate, event.endDate, event.startTime, event.endTime,
        event.timeZone, event.description, event.sourceUrl, event.sourceNote, event.enabled,
        subtype = event.subtype, subtypeDetail = event.subtypeDetail,
    )

    private fun key(data: ActivityCalendarWriteRequest): String = mapper.writeValueAsString(
        listOf(
            data.game,
            data.category.name,
            data.title.trim(),
            data.startDate.toString(),
            data.endDate.toString(),
            data.startTime,
            data.endTime,
            data.timeZone,
        ),
    )

    private fun differences(a: ActivityCalendarWriteRequest, b: ActivityCalendarWriteRequest): List<String> = listOf(
        "subtype" to (a.subtype != b.subtype),
        "subtype_detail" to (a.subtypeDetail != b.subtypeDetail),
        "description" to (a.description != b.description),
        "source_url" to (a.sourceUrl != b.sourceUrl),
        "source_note" to (a.sourceNote != b.sourceNote),
        "enabled" to (a.enabled != b.enabled),
    ).filter { it.second }.map { it.first }

    private fun importId(key: String) = "evt_import_" + digest(key.toByteArray(Charsets.UTF_8))
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun utf8(bytes: ByteArray): String = try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString()
    } catch (_: CharacterCodingException) {
        throw calendarInvalid("请使用UTF-8编码的JSON文件", "json")
    }

    private fun parse(json: String): JsonNode = try {
        mapper.readTree(json) ?: throw calendarInvalid("JSON不能为空", "json")
    } catch (error: JsonProcessingException) {
        val location = error.location
        throw calendarInvalid("JSON格式错误（文本第${location?.lineNr ?: 1}行，第${location?.columnNr ?: 1}列），请检查语法或重复字段", "json")
    }
}
