package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.cfg.CoercionAction
import com.fasterxml.jackson.databind.cfg.CoercionInputShape
import com.fasterxml.jackson.databind.type.LogicalType
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticBagCell
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.Base64
import java.util.UUID

internal const val DIAGNOSTIC_INTENT_LIMIT = 68 * 1024

data class MaayuanDiagnosticManifest(
    val schemaVersion: Int,
    val eventId: String,
    val runId: String,
    val feature: String,
    val client: DiagnosticClient,
    val catalog: DiagnosticCatalog,
    val occurredAt: String,
    val outcome: String,
    val issues: List<DiagnosticIssue>,
    val images: List<DiagnosticImage> = emptyList(),
    val trace: List<DiagnosticTraceStep> = emptyList(),
    val bagCells: List<MaayuanDiagnosticBagCell>? = null,
)

data class DiagnosticClient(
    val resourceVersion: String,
    val maafwVersion: String,
    val resource: String,
    val resolution: String,
    val uiScript: String? = null,
)

data class DiagnosticCatalog(val version: String, val source: String)

data class DiagnosticIssue(
    val code: String,
    val stage: String,
    val count: Int = 1,
    val operatorIds: List<String> = emptyList(),
    val errorType: String? = null,
    val stack: List<String> = emptyList(),
    val blockingErrors: List<DiagnosticBlockingError> = emptyList(),
    val sectionStatus: Map<String, String> = emptyMap(),
    val ocrSamples: List<String> = emptyList(),
    val reason: String? = null,
    val candidateOperatorIds: List<String> = emptyList(),
    val node: String? = null,
)

data class DiagnosticBlockingError(val code: String, val field: String)

data class DiagnosticTraceStep(
    val kind: String,
    val node: String,
    val stage: String,
    @param:JsonProperty(required = true) val hit: Boolean,
    val n: Int,
    @param:JsonProperty(required = true) val t: Int,
    val dt: Int? = null,
    val algo: String? = null,
    val score: BigDecimal? = null,
    val box: List<Int>? = null,
    val text: String? = null,
)

data class DiagnosticImage(
    val index: Int,
    val role: String,
    val roi: List<Int>,
    val operatorId: String? = null,
    val traceIndex: Int? = null,
    val nodeRoi: List<Int>? = null,
)

data class DiagnosticReceipt(val status: String, @get:JsonProperty("event_id") val eventId: String)

@Component
class MaayuanDiagnosticParser(mapper: ObjectMapper) {
    // A separate mapper keeps strict input rules local to this untrusted protocol.
    private val json = mapper.copy()
        .setSerializationInclusion(JsonInclude.Include.NON_NULL)
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
        .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)

    init {
        json.coercionConfigFor(LogicalType.Textual)
            .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
            .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
            .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail)
    }

    fun parse(bytes: ByteArray): MaayuanDiagnosticManifest {
        if (bytes.size > 64 * 1024) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "manifest exceeds 64 KiB")
        val manifest = try {
            val tree = json.readTree(bytes)

            if (!noNulls(tree)) diagnosticError(HttpStatus.BAD_REQUEST, "Null diagnostic field")
            json.readValue(bytes, MaayuanDiagnosticManifest::class.java)
        } catch (_: Exception) {
            diagnosticError(HttpStatus.BAD_REQUEST, "Invalid manifest or unknown field")
        }
        validate(manifest)
        return manifest.copy(eventId = manifest.eventId.lowercase(), runId = manifest.runId.lowercase())
    }

    fun bytes(manifest: MaayuanDiagnosticManifest): ByteArray = json.writeValueAsBytes(manifest)

    fun parseIntent(bytes: ByteArray): DiagnosticIntentRequest {
        if (bytes.size > DIAGNOSTIC_INTENT_LIMIT) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "Intent exceeds 68 KiB")
        val request = try {
            if (!noNulls(json.readTree(bytes))) diagnosticError(HttpStatus.BAD_REQUEST, "Null diagnostic field")
            json.readValue(bytes, DiagnosticIntentRequest::class.java)
        } catch (_: Exception) {
            diagnosticError(HttpStatus.BAD_REQUEST, "Invalid upload intent or unknown field")
        }
        val manifest = parse(this.bytes(request.manifest))
        if (request.uploads.size != manifest.images.size) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Image index/count mismatch")
        request.uploads.forEach { upload ->
            validateUpload(upload, 524288)
        }
        request.log?.let { validateUpload(it, DIAGNOSTIC_LOG_COMPRESSED_LIMIT) }
        return request.copy(manifest = manifest)
    }

    private fun validateUpload(upload: DiagnosticUploadDeclaration, limit: Int) {
        valid(upload.size in 1..limit && Regex("[A-Za-z0-9+/]{22}==").matches(upload.contentMd5))
        val digest = Base64.getDecoder().decode(upload.contentMd5)
        valid(digest.size == 16 && Base64.getEncoder().encodeToString(digest) == upload.contentMd5)
    }

    fun requireEmptyObject(bytes: ByteArray) {
        val empty = try {
            val tree = json.readTree(bytes)
            tree != null && tree.isObject && tree.isEmpty
        } catch (_: Exception) {
            false
        }
        if (!empty) diagnosticError(HttpStatus.BAD_REQUEST, "Expected empty JSON object")
    }

    private fun noNulls(node: JsonNode, path: String = ""): Boolean = when {
        node.isNull -> NULLABLE_BAG_COUNT.matches(path)
        node.isObject -> node.fields().asSequence().all { (name, child) -> noNulls(child, "$path/$name") }
        node.isArray -> node.withIndex().all { (index, child) -> noNulls(child, "$path/$index") }
        else -> true
    }

    private fun validate(value: MaayuanDiagnosticManifest) {
        valid(value.schemaVersion == 1 && value.feature in setOf("operator_info_collection", "inventory_bag_scan"))
        val bagScan = value.feature == "inventory_bag_scan"
        valid(uuid(value.eventId) && uuid(value.runId))
        valid(value.outcome in setOf("failed", "upload_failed", "data_review"))
        valid(value.client.resource in setOf("base", "zh_tw"))
        value.client.uiScript?.let { valid(it in setOf("simplified", "traditional", "mixed", "unknown")) }
        valid(value.catalog.source in setOf("remote", "cache", "builtin"))
        listOf(value.client.resourceVersion, value.client.maafwVersion, value.catalog.version).forEach {
            valid(it.length in 1..100 && VERSION.matches(it))
        }
        val resolution = Regex("([1-9][0-9]{0,3})x([1-9][0-9]{0,3})").matchEntire(value.client.resolution)
        valid(resolution != null)
        val width = resolution!!.groupValues[1].toInt()
        val height = resolution.groupValues[2].toInt()
        valid(width <= 8192 && height <= 8192)
        valid(value.occurredAt.length <= 40 && runCatching { OffsetDateTime.parse(value.occurredAt) }.isSuccess)
        valid(value.issues.size in 1..32)
        if (bagScan) {
            valid(value.outcome == "data_review" && value.catalog.source == "builtin")
            valid(value.issues.size in 1..2 && value.issues.map { it.code }.distinct().size == value.issues.size)
            valid(value.issues.map { it.stage }.distinct().size == 1)
        }
        val countSuspect = value.issues.singleOrNull { it.code == "bag_count_suspect" }
        valid(if (bagScan && countSuspect != null) value.bagCells != null && value.bagCells.size in 1..64 else value.bagCells == null)
        value.issues.forEach { issue ->
            valid(issue.code in ISSUE_CODES)
            if (bagScan) {
                when (issue.code) {
                    "bag_item_missing" -> {
                        valid(issue.stage == "bag_tab1" && issue.count == 1)
                        valid(issue.reason in setOf("tianjifuchuan_missing", "fuchuan_missing", "both_missing"))
                    }
                    "bag_count_suspect" -> {
                        valid(issue.stage in setOf("bag_tab1", "bag_tab3_1", "bag_tab3_2"))
                        valid(issue.reason in BAG_COUNT_REASONS || issue.reason == "mixed")
                        valid(issue.count in 1..64 && issue.count == value.bagCells?.size)
                    }
                    else -> valid(false)
                }
                valid(issue.operatorIds.isEmpty() && issue.candidateOperatorIds.isEmpty())
                valid(issue.errorType == null && issue.node == null && issue.stack.isEmpty())
                valid(issue.blockingErrors.isEmpty() && issue.sectionStatus.isEmpty() && issue.ocrSamples.isEmpty())
            } else {
                valid(issue.code !in setOf("bag_item_missing", "bag_count_suspect"))
            }
            valid(issue.stage.length in 1..64 && STAGE.matches(issue.stage))
            issue.node?.let(::validateNode)
            issue.reason?.let { valid(it.length in 1..64 && REASON.matches(it)) }
            valid(issue.count in 1..10000 && issue.operatorIds.size <= 100)
            issue.operatorIds.forEach { valid(OPERATOR.matches(it)) }
            valid(issue.candidateOperatorIds.size <= 5 && issue.candidateOperatorIds.distinct().size == issue.candidateOperatorIds.size)
            issue.candidateOperatorIds.forEach { valid(OPERATOR.matches(it)) }
            issue.errorType?.let { valid(it.length in 1..100 && SYMBOL.matches(it)) }
            valid(issue.stack.size <= 32)
            issue.stack.forEach { valid(it.length <= 200 && STACK.matches(it) && ".." !in it) }
            valid(issue.blockingErrors.size <= 32 && issue.sectionStatus.size <= 32 && issue.ocrSamples.size <= 20)
            issue.blockingErrors.forEach {
                valid(it.code.length in 1..64 && SYMBOL.matches(it.code))
                valid(it.field.length in 1..100 && SYMBOL.matches(it.field))
            }
            issue.sectionStatus.forEach { (key, status) ->
                valid(key.length in 1..64 && SYMBOL.matches(key))
                valid(status.length in 1..32 && SYMBOL.matches(status))
            }
            issue.ocrSamples.forEach {
                valid(it.length in 1..80 && OCR.matches(it) && !SENSITIVE.containsMatchIn(it))
            }
        }
        valid(value.trace.size <= 64)
        var previousTime = -1
        value.trace.forEach { step ->
            valid(step.kind in setOf("reco", "action"))
            validateNode(step.node)
            valid(step.stage.length in 1..64 && STAGE.matches(step.stage))
            valid(step.n in 1..10000 && step.t in 0..86400000 && step.t >= previousTime)
            previousTime = step.t
            step.dt?.let { valid(it in 0..86400000) }
            step.algo?.let { valid(step.kind == "reco" && it.length in 1..32 && ALGORITHM.matches(it)) }
            step.score?.let {
                valid(step.kind == "reco" && it >= BigDecimal(-1) && it <= BigDecimal(100000) && it.stripTrailingZeros().scale() <= 3)
            }
            step.box?.let { validateBox(it, width, height) }
            step.text?.let {
                valid(step.kind == "reco" && step.algo.equals("OCR", ignoreCase = true))
                valid(it.length in 1..32 && OCR.matches(it) && !SENSITIVE.containsMatchIn(it))
            }
        }
        valid(if (bagScan) value.images.size in 1..12 else value.images.size <= 3)
        valid(value.images.map { it.index } == value.images.indices.toList())
        value.images.forEach { image ->
            if (bagScan) {
                valid(image.role == "bag_page" && image.operatorId == null && image.traceIndex == null && image.nodeRoi == null)
            } else {
                valid(image.role in setOf("disc_cells", "main_panel", "last_frame", "name_area"))
            }
            image.operatorId?.let { valid(OPERATOR.matches(it)) }
            validateBox(image.roi, width, height)
            valid(image.role == "last_frame" || (image.traceIndex == null && image.nodeRoi == null))
            image.traceIndex?.let { valid(it in 0..63 && it < value.trace.size) }
            image.nodeRoi?.let { validateBox(it, width, height) }
        }
        value.bagCells?.forEach { cell ->
            valid(cell.entityType in setOf("item", "agent") && BAG_ENTITY.matches(cell.entityId))
            cell.chosen?.let { valid(it in 0..99999999) }
            valid(cell.reasons.isNotEmpty() && cell.reasons.distinct().size == cell.reasons.size)
            valid(cell.reasons.all { it in BAG_COUNT_REASONS })
            valid(cell.readings.size in 1..8)
            cell.readings.forEach { reading ->
                valid(value.images.any { it.index == reading.imageIndex })
                validateBox(reading.countBox, width, height)
                reading.count?.let { valid(it in 0..99999999) }
                valid(BAG_RAW.matches(reading.raw))
                valid(reading.score >= BigDecimal.ZERO && reading.score <= BigDecimal.ONE)
                valid(reading.source in setOf("primary", "fallback"))
            }
        }
    }

    private fun validateNode(node: String) {
        // The protocol reserves this literal for calls without a resource node name.
        valid(node.length in 1..64 && (node == "(direct)" || NODE.matches(node)))
    }

    private fun validateBox(box: List<Int>, width: Int, height: Int) {
        valid(box.size == 4)
        val (x, y, w, h) = box
        valid(x >= 0 && y >= 0 && w > 0 && h > 0)
        valid(x.toLong() + w <= width && y.toLong() + h <= height)
    }

    private fun uuid(value: String): Boolean = value.length == 36 && runCatching {
        UUID.fromString(value).toString().equals(value, ignoreCase = true)
    }.getOrDefault(false)

    private fun valid(condition: Boolean) {
        if (!condition) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid diagnostic field")
    }

    companion object {
        val ISSUE_CODES = setOf(
            "collector_exception", "account_lookup_failed", "annotations_failed", "catalog_unavailable", "navigation_failed",
            "screenshot_or_ocr_failed", "identity_unresolved", "data_review", "upload_network_failed", "upload_http_failed",
            "upload_rejected", "upload_response_unverified", "bag_item_missing", "bag_count_suspect",
        )
        private val BAG_COUNT_REASONS = setOf("page_conflict", "threshold_disagree", "edge_zone")
        private val BAG_ENTITY = Regex("[a-z0-9_]{1,64}")
        private val BAG_RAW = Regex("[0-9]{0,8}")
        private val NULLABLE_BAG_COUNT = Regex("(/manifest)?/bag_cells/[0-9]+/(chosen|readings/[0-9]+/count)")
        private val VERSION = Regex("[A-Za-z0-9._+() -]+")
        private val SYMBOL = Regex("[A-Za-z0-9_.\\[\\]-]+")
        private val STAGE = Regex("[\\p{L}\\p{N} _.-]+")
        private val NODE = Regex("[\\p{L}\\p{N}_\\-·@ ]+")
        private val ALGORITHM = Regex("[A-Za-z0-9_]+")
        private val REASON = Regex("[a-z][a-z0-9_]{0,63}")
        private val OPERATOR = Regex("char_[A-Za-z0-9_]{1,80}")
        private val STACK = Regex("[A-Za-z0-9_][A-Za-z0-9_/.-]*:[A-Za-z0-9_.<>]+:[1-9][0-9]{0,6}")
        private val OCR = Regex("[\\p{L}\\p{N}\\p{Zs}·・，。！？、（）()【】《》+%％:：._-]+")
        private val SENSITIVE = Regex("(?i)(bearer|token|cookie|https?|acc_|[a-f0-9]{24,}|[0-9]{9,})")
    }
}

internal fun diagnosticError(status: HttpStatus, message: String): Nothing = throw ResponseStatusException(status, message)
