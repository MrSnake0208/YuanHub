package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.entity.FeedbackDiagnosticSummary
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticAnalysis
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticEvent
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticIssue
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.report.FeedbackAccessService
import com.lhs.share.hub.service.report.FeedbackArea
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.core.io.Resource
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.http.CacheControl
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.regex.Pattern

@Service
class MaayuanDiagnosticCenterService(
    @param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate,
    private val access: FeedbackAccessService,
    private val catalog: OperatorCatalogService,
    private val media: MediaStorageService,
    private val mapper: ObjectMapper,
) {
    fun requireAccess(userId: String) {
        // Fresh diagnostic tickets were UNASSIGNED, whose visibility uses operatorAreas rather than legacy manageAreas.
        if (FeedbackArea.MAAYUAN !in access.operatorAreas(userId)) throw ApiResultException(403, "没有 MaaYuan 诊断的查看权限")
    }

    fun list(
        status: String,
        reason: String?,
        q: String?,
        sort: String,
        page: Int,
        pageSize: Int,
        includeTrace: Boolean = false,
    ): DiagnosticIssuePage {
        if (status !in setOf("NEW", "FIXED", "IGNORED", "ALL") || page < 1 || pageSize !in 1..100) {
            throw ApiResultException(400, "无效的诊断状态或分页参数")
        }
        if (reason != null && (reason.length !in 1..64 || !Regex("[a-z][a-z0-9_]{0,63}").matches(reason))) {
            throw ApiResultException(400, "无效的诊断原因")
        }
        if ((q?.length ?: 0) > 100) throw ApiResultException(400, "搜索内容最多 100 个字符")
        val sortField = when (sort) {
            "lastSeen" -> "lastSeenAt"
            "count" -> "eventCount"
            "firstSeen" -> "firstSeenAt"
            else -> throw ApiResultException(400, "无效的诊断排序")
        }
        val operators = catalog.catalogReadOnly()
        val base = mutableListOf<Criteria>()
        q?.trim()?.takeIf { it.isNotEmpty() }?.let { text ->
            val pattern = Pattern.compile(Pattern.quote(text), Pattern.CASE_INSENSITIVE)
            val ids = operators.filter {
                pattern.matcher(it.name).find() || pattern.matcher(it.alias.orEmpty()).find()
            }.map { it.operatorId }
            base += Criteria().orOperator(
                Criteria.where("subject").regex(pattern),
                Criteria.where("ocrSamples").regex(pattern),
                Criteria.where("subject").`in`(ids),
                Criteria.where("candidateOperatorIds").`in`(ids),
            )
        }
        val reasonFilter = reason?.let { Criteria().orOperator(Criteria.where("reason").`is`(it), Criteria.where("reasons").`is`(it)) }
        val statusFilter = status.takeUnless { it == "ALL" }?.let { Criteria.where("status").`is`(it) }
        val criteria = combine(base + listOfNotNull(reasonFilter, statusFilter))
        val items = mongo.find(
            Query(criteria).with(PageRequest.of(page - 1, pageSize, Sort.by(Sort.Direction.DESC, sortField, "_id"))),
            MaayuanDiagnosticIssue::class.java,
        )
        val names = operators.associate { it.operatorId to it.name }
        val now = Instant.now()
        return DiagnosticIssuePage(
            items.map {
                DiagnosticIssueListItem(
                    if (includeTrace) it else it.copy(nodes = emptyList()),
                    if (it.subjectKind == "operator") names[it.subject] else null,
                )
            },
            mongo.count(Query(criteria), MaayuanDiagnosticIssue::class.java),
            page,
            pageSize,
            counts(combine(base + listOfNotNull(reasonFilter)), "status"),
            counts(combine(base + listOfNotNull(statusFilter)), "reason"),
            mongo.count(Query(Criteria.where("status").`is`("NEW")), MaayuanDiagnosticIssue::class.java),
            mongo.count(Query(Criteria.where("createdAt").gte(now.minus(Duration.ofDays(7)))), MaayuanDiagnosticEvent::class.java),
            mongo.count(Query(Criteria.where("status").`is`("NEW").and("regressedAt").ne(null)), MaayuanDiagnosticIssue::class.java),
        )
    }

    fun detail(id: String, includeTrace: Boolean = false): DiagnosticIssueDetail {
        val issue = issue(id)
        val events = Query(Criteria.where("signatures").`is`(id).and("createdAt").gt(retainedAfter()))
        val users = mongo.findDistinct(events, "userId", MaayuanDiagnosticEvent::class.java, String::class.java)
        val recent = mongo.find(
            Query.of(events).with(Sort.by(Sort.Direction.DESC, "createdAt", "_id")).limit(20),
            MaayuanDiagnosticEvent::class.java,
        )
        val operators = catalog.catalogReadOnly()
        val eventOperatorIds = recent.flatMap { it.summary.operatorIds }.toSet()
        val names = operators.filter {
            it.operatorId == issue.subject || it.operatorId in issue.candidateOperatorIds ||
                it.operatorId in issue.operatorIds || it.operatorId in eventOperatorIds
        }.associate { it.operatorId to it.name }
        val inCatalog = if (issue.subjectKind == "ocr_name") {
            operators.any { it.name == issue.subject || issue.subject in it.alias.orEmpty().split(Regex("[\\s,，;；、]+")) }
        } else {
            null
        }
        return DiagnosticIssueDetail(
            if (includeTrace) issue else issue.copy(nodes = emptyList()),
            users.size,
            recent.map {
                DiagnosticEventSummary(it.id, it.createdAt, summary(it.summary, includeTrace))
            },
            inCatalog,
            names,
        )
    }

    fun event(id: String, includeUrls: Boolean = false, includeTrace: Boolean = false): DiagnosticEventDetail {
        val event = retainedEvent(id)
        val manifest = asset(event, event.manifestAssetId)
        val json = media.loadAuthorizedAsset(manifest).inputStream.use { mapper.readTree(it) }
        // Keep the existing integration-token response schema; trace is an admin-only extension.
        if (!includeTrace) {
            (json as ObjectNode).remove("trace")
            json.path("issues").forEach { (it as ObjectNode).remove("node") }
            json.path("images").forEach { (it as ObjectNode).remove(listOf("trace_index", "node_roi")) }
        }
        val images = event.images.mapIndexed { index, image ->
            val stored = mongo.findById(image.assetId, MediaAsset::class.java)
            val expired = stored == null || expired(stored)
            val status = stored?.status ?: image.status
            val url = if (includeUrls && stored != null && !expired && status == "ready" && stored.storageBackend == "cos" &&
                stored.privateStorage && stored.diagnosticEventId == event.id
            ) {
                media.cosStorage.presignGet(stored.storagePath)
            } else {
                null
            }
            val operatorId = image.operatorId ?: json.path("images").path(index).path("operator_id")
                .takeIf { it.isTextual }?.asText()
            DiagnosticEventImage(
                image.assetId, image.role, image.issueIndex, expired, status, url, operatorId,
                traceIndex = if (includeTrace) image.traceIndex else null,
                nodeRoi = if (includeTrace) image.nodeRoi else null,
            )
        }
        val log = if (includeTrace) {
            event.log?.let {
                val stored = mongo.findById(it.assetId, MediaAsset::class.java)
                DiagnosticEventLog(it.assetId, stored?.status ?: it.status, it.size, stored == null || expired(stored))
            }
        } else {
            null
        }
        return DiagnosticEventDetail(
            event.id,
            event.createdAt,
            summary(event.summary, includeTrace),
            json,
            images,
            trace = if (includeTrace) event.trace else null,
            log = log,
        )
    }

    private fun summary(value: FeedbackDiagnosticSummary, includeTrace: Boolean): FeedbackDiagnosticSummary =
        if (includeTrace) value else value.copy(issues = value.issues.map { it.copy(node = null) })

    fun mediaResponse(eventId: String, assetId: String): ResponseEntity<Resource> {
        val asset = asset(retainedEvent(eventId), assetId)
        val resource = media.loadAuthorizedAsset(asset)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(asset.mime))
            .contentLength(resource.contentLength())
            .cacheControl(CacheControl.noStore().cachePrivate())
            .header("X-Content-Type-Options", "nosniff")
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(asset.originalName).build().toString())
            .body(resource)
    }

    fun logResponse(eventId: String): ResponseEntity<String> {
        val event = retainedEvent(eventId)
        val reference = event.log ?: throw ApiResultException(404, "诊断日志不存在")
        val asset = mongo.findById(reference.assetId, MediaAsset::class.java) ?: throw ApiResultException(404, "诊断日志已过期")
        if (!asset.privateStorage || asset.ownerUserId != event.userId || asset.diagnosticEventId != event.id || expired(asset) ||
            asset.kind != MediaKind.FILE || asset.mime != "application/gzip" || asset.storageBackend != "cos" ||
            asset.status != "ready" || reference.status != "ready" || asset.size != reference.size
        ) {
            throw ApiResultException(404, "诊断日志尚未就绪或不可用")
        }
        val text = try {
            val bytes = media.loadAuthorizedAsset(asset).inputStream.use { it.readNBytes(DIAGNOSTIC_LOG_COMPRESSED_LIMIT + 1) }
            if (bytes.size.toLong() != asset.size) throw ApiResultException(404, "诊断日志不可用")
            decodeDiagnosticLog(bytes)
        } catch (error: org.springframework.web.server.ResponseStatusException) {
            if (error.statusCode.value() in setOf(404, 422)) throw ApiResultException(404, "诊断日志不存在或不可用")
            throw error
        }
        return ResponseEntity.ok()
            .contentType(MediaType("text", "plain", Charsets.UTF_8))
            .cacheControl(CacheControl.noStore().cachePrivate())
            .header("X-Content-Type-Options", "nosniff")
            .body(text)
    }

    fun update(id: String, userId: String, request: DiagnosticIssueUpdateRequest): DiagnosticIssueDetail {
        issue(id)
        val update = Update().set("status", request.status).set("statusUpdatedBy", userId).set("statusUpdatedAt", Instant.now())
        request.note?.let { update.set("note", it) }
        mongo.updateFirst(Query(Criteria.where("_id").`is`(id)), update, MaayuanDiagnosticIssue::class.java)
        return detail(id, includeTrace = true)
    }

    fun analysis(id: String, request: DiagnosticAnalysisRequest): MaayuanDiagnosticAnalysis {
        issue(id)
        val analysis = MaayuanDiagnosticAnalysis(request.summary, request.suggestedAction, request.model, request.source, Instant.now())
        mongo.updateFirst(
            Query(Criteria.where("_id").`is`(id)),
            Update().set("agentAnalysis", analysis),
            MaayuanDiagnosticIssue::class.java,
        )
        return analysis
    }

    private fun issue(id: String): MaayuanDiagnosticIssue = mongo.findById(id, MaayuanDiagnosticIssue::class.java)
        ?: throw ApiResultException(404, "诊断问题不存在")

    private fun retainedEvent(id: String): MaayuanDiagnosticEvent {
        val event = mongo.findById(id, MaayuanDiagnosticEvent::class.java) ?: throw ApiResultException(404, "诊断事件不存在或已过期")
        if (!event.createdAt.isAfter(retainedAfter())) throw ApiResultException(404, "诊断事件已过期")
        return event
    }

    private fun asset(event: MaayuanDiagnosticEvent, id: String): MediaAsset {
        if (id != event.manifestAssetId && event.images.none { it.assetId == id }) throw ApiResultException(404, "诊断附件不存在")
        val asset = mongo.findById(id, MediaAsset::class.java) ?: throw ApiResultException(404, "诊断附件已过期")
        if (!asset.privateStorage || asset.diagnosticEventId != event.id || expired(asset)) throw ApiResultException(404, "诊断附件已过期")
        if (asset.status != "ready") throw ApiResultException(404, "诊断图片尚未就绪或不可用")
        return asset
    }

    private fun expired(asset: MediaAsset): Boolean = asset.deletedAt != null || asset.diagnosticExpiresAt?.isAfter(Instant.now()) != true

    private fun retainedAfter(): Instant = Instant.now().minus(Duration.ofDays(90))

    private fun combine(criteria: List<Criteria>): Criteria =
        if (criteria.isEmpty()) Criteria() else Criteria().andOperator(*criteria.toTypedArray())

    private fun counts(criteria: Criteria, field: String): Map<String, Long> = mongo.getCollection("maayuan_diagnostic_issues")
        .aggregate(
            listOf(
                Document("\$match", Query(criteria).queryObject),
                Document("\$group", Document("_id", "\$$field").append("count", Document("\$sum", 1))),
            ),
        )
        .associate { it.getString("_id") to (it["count"] as Number).toLong() }
}
