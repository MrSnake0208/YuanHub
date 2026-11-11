package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class MaayuanDiagnosticParserTest {
    private val mapper = jacksonObjectMapper()
    private val parser = MaayuanDiagnosticParser(mapper)

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
