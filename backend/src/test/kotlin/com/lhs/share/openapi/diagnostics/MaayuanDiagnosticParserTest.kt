package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class MaayuanDiagnosticParserTest {
    private val mapper = jacksonObjectMapper()
    private val parser = MaayuanDiagnosticParser(mapper)

    @Test
    fun `log declarations are optional and enforce size MD5 and strict JSON fields`() {
        val intent = mapper.createObjectNode().apply {
            set<ObjectNode>("manifest", mapper.readTree(diagnosticManifest(withImage = false)))
            putArray("uploads")
        }
        assertNull(parser.parseIntent(mapper.writeValueAsBytes(intent)).log)
        val log = intent.putObject("log").put("size", 1).put("content_md5", "AAAAAAAAAAAAAAAAAAAAAA==")
        for (size in listOf(1, 262144)) {
            log.put("size", size)
            assertEquals(size.toLong(), parser.parseIntent(mapper.writeValueAsBytes(intent)).log?.size)
        }
        for (size in listOf(0, -1, 262145, Long.MAX_VALUE)) {
            log.put("size", size)
            assertStatus(422) { parser.parseIntent(mapper.writeValueAsBytes(intent)) }
        }
        log.put("size", 1)
        for (md5 in listOf("", "invalid", "AAAAAAAAAAAAAAAAAAAAAB==")) {
            log.put("content_md5", md5)
            assertStatus(422) { parser.parseIntent(mapper.writeValueAsBytes(intent)) }
        }
        log.put("content_md5", "AAAAAAAAAAAAAAAAAAAAAA==").put("extra", "field")
        assertStatus(400) { parser.parseIntent(mapper.writeValueAsBytes(intent)) }
        intent.putNull("log")
        assertStatus(400) { parser.parseIntent(mapper.writeValueAsBytes(intent)) }
    }

    @Test
    fun `optional log receipt fields are omitted and signatures never appear in toString`() {
        assertFalse(mapper.readTree(mapper.writeValueAsBytes(DiagnosticIntentReceipt("accepted", "event"))).has("log_upload"))
        assertFalse(mapper.readTree(mapper.writeValueAsBytes(DiagnosticCompleteReceipt(images = emptyList()))).has("log"))
        val upload = DiagnosticLogUploadIntent("PUT", "https://secret-signature", emptyMap(), 600)
        assertFalse(DiagnosticIntentReceipt("accepted", "event", logUpload = upload).toString().contains("secret-signature"))
        val json = mapper.readTree(mapper.writeValueAsBytes(DiagnosticIntentReceipt("accepted", "event", logUpload = upload)))
        assertEquals(600, json.at("/log_upload/expires_in").asInt())
    }

    @Test
    fun `optional UI script accepts known enums and rejects invalid or null values`() {
        assertNull(parser.parse(diagnosticManifest()).client.uiScript)
        val value = mapper.readTree(diagnosticManifest())
        val client = value.at("/client") as ObjectNode
        listOf("simplified", "traditional", "mixed", "unknown").forEach { script ->
            client.put("ui_script", script)
            assertEquals(script, parser.parse(mapper.writeValueAsBytes(value)).client.uiScript)
        }
        client.put("ui_script", "invalid")
        assertStatus(422) { parser.parse(mapper.writeValueAsBytes(value)) }
        client.putNull("ui_script")
        assertStatus(400) { parser.parse(mapper.writeValueAsBytes(value)) }
    }

    @Test
    fun `candidate IDs are optional bounded unique and validated with name area images accepted`() {
        assertEquals(emptyList<String>(), parser.parse(diagnosticManifest()).issues.single().candidateOperatorIds)
        val value = mapper.readTree(diagnosticManifest())
        val issue = value.at("/issues/0") as ObjectNode
        (value.at("/images/0") as ObjectNode).put("role", "name_area")
        listOf(emptyList(), (1..5).map { "char_candidate_$it" }).forEach { ids ->
            val candidates = issue.putArray("candidate_operator_ids")
            ids.forEach { candidates.add(it) }
            val parsed = parser.parse(mapper.writeValueAsBytes(value))
            assertEquals(ids, parsed.issues.single().candidateOperatorIds)
            assertEquals("name_area", parsed.images.single().role)
        }
        listOf((1..6).map { "char_candidate_$it" }, listOf("invalid"), listOf("char_a", "char_a")).forEach { ids ->
            val candidates = issue.putArray("candidate_operator_ids")
            ids.forEach { candidates.add(it) }
            assertStatus(422) { parser.parse(mapper.writeValueAsBytes(value)) }
        }
        issue.putNull("candidate_operator_ids")
        assertStatus(400) { parser.parse(mapper.writeValueAsBytes(value)) }
    }

    @Test
    fun `optional reasons accept valid and future codes while old clients remain supported`() {
        assertNull(parser.parse(diagnosticManifest()).issues.single().reason)
        listOf("page_timeout", "future_reason_2", "a".repeat(64)).forEach { reason ->
            val value = mapper.readTree(diagnosticManifest())
            (value.at("/issues/0") as ObjectNode).put("reason", reason)
            assertEquals(reason, parser.parse(mapper.writeValueAsBytes(value)).issues.single().reason)
        }
    }

    @Test
    fun `invalid reason formats return 422 and explicit null returns 400`() {
        val value = mapper.readTree(diagnosticManifest())
        val issue = value.at("/issues/0") as ObjectNode
        listOf("", "Page_timeout", "page-timeout", "1reason", "page timeout", "原因", "a".repeat(65)).forEach { reason ->
            issue.put("reason", reason)
            assertStatus(422) { parser.parse(mapper.writeValueAsBytes(value)) }
        }
        issue.putNull("reason")
        assertStatus(400) { parser.parse(mapper.writeValueAsBytes(value)) }
    }

    @Test
    fun `unknown fields at every nesting level and duplicate JSON keys are rejected`() {
        val paths = listOf("", "/client", "/catalog", "/issues/0", "/issues/0/blocking_errors/0", "/images/0")
        paths.forEach { path ->
            val value = mapper.readTree(diagnosticManifest())
            (value.at(path) as ObjectNode).put("token", "not-permitted")
            assertStatus(400) { parser.parse(mapper.writeValueAsBytes(value)) }
        }
        val duplicate = diagnosticManifest().toString(Charsets.UTF_8)
            .replace("\"schema_version\":1", "\"schema_version\":1,\"schema_version\":1")
        assertStatus(400) { parser.parse(duplicate.toByteArray()) }
    }

    @Test
    fun `versions UUIDs enum limits nulls paths and private OCR text are validated`() {
        val event = UUID.randomUUID().toString()
        assertEquals(event, parser.parse(diagnosticManifest(event.uppercase())).eventId)
        assertStatus(413) { parser.parse(ByteArray(64 * 1024 + 1)) }
        val cases = listOf(
            "\"schema_version\":1" to "\"schema_version\":\"1\"",
            "\"schema_version\":1" to "\"schema_version\":1.5",
            "\"count\":1" to "\"count\":null",
            "\"count\":1" to "\"count\":-1",
            "\"failed\"" to "\"success\"",
            "agent/collector.py:run:12" to "/Users/private/collector.py:run:12",
            "agent/collector.py:run:12" to "agent/../collector.py:run:12",
            "攻击力" to "Bearer secret",
            "攻击力" to "https://private.test",
            "攻击力" to "name@example.test",
            "\"index\":0" to "\"index\":1",
        )
        cases.forEach { (from, to) ->
            assertThrows(ResponseStatusException::class.java) {
                parser.parse(diagnosticManifest().toString(Charsets.UTF_8).replace(from, to).toByteArray())
            }
        }
    }

    private fun assertStatus(status: Int, action: () -> Unit) {
        assertEquals(status, assertThrows(ResponseStatusException::class.java, action).statusCode.value())
    }
}

internal fun diagnosticManifest(event: String = UUID.randomUUID().toString(), withImage: Boolean = true): ByteArray {
    val images = if (withImage) """[{"index":0,"role":"disc_cells","roi":[0,0,4,4],"operator_id":"char_test"}]""" else "[]"
    return """
        {"schema_version":1,"event_id":"$event","run_id":"00000000-0000-0000-0000-000000000001",
        "feature":"operator_info_collection",
        "client":{"resource_version":"2026.11.10","maafw_version":"5.0","resource":"base","resolution":"1280x720"},
        "catalog":{"version":"1","source":"remote"},"occurred_at":"2026-11-10T12:00:00Z","outcome":"failed",
        "issues":[{"code":"collector_exception","stage":"collect","count":1,"operator_ids":["char_test"],
        "error_type":"ValueError","stack":["agent/collector.py:run:12"],
        "blocking_errors":[{"code":"invalid","field":"level"}],"section_status":{"disc_loadouts":"partial"},
        "ocr_samples":["攻击力"]}],"images":$images}
    """.trimIndent().toByteArray()
}
