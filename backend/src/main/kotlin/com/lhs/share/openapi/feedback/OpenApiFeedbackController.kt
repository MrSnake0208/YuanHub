package com.lhs.share.openapi.feedback

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackAgentAnalysisService
import com.lhs.share.hub.service.report.FeedbackAgentImplementationInput
import com.lhs.share.hub.service.report.FeedbackAgentReviewInput
import com.lhs.share.hub.service.report.FeedbackReportService
import com.lhs.share.hub.service.report.FeedbackWorkflowService
import com.lhs.share.openapi.integration.IntegrationScope
import com.lhs.share.openapi.integration.IntegrationTokenService
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.CacheControl
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.nio.charset.StandardCharsets
import java.time.Instant

@RestController
@RequestMapping("/open-api/feedback", produces = [MediaType.APPLICATION_JSON_VALUE])
class OpenApiFeedbackController(
    private val integrationTokens: IntegrationTokenService,
    private val reports: FeedbackReportService,
    private val workflow: FeedbackWorkflowService,
    private val analysis: FeedbackAgentAnalysisService,
    private val mediaStorage: MediaStorageService,
) {
    @GetMapping("/queue")
    fun queue(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(defaultValue = "UNASSIGNED") queue: String,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(name = "page_size", defaultValue = "20") pageSize: Int,
        @RequestParam(name = "work_area", required = false) workArea: String?,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(name = "sort_by", defaultValue = "updatedAt") sortBy: String,
        @RequestParam(name = "sort_order", defaultValue = "desc") sortOrder: String,
    ): ApiResult<FeedbackAutomationListResponse> {
        val principal = integrationTokens.validateAuthorization(authorization, IntegrationScope.FEEDBACK_READ)
        val result = reports.listForAutomation(
            currentUserId = principal.ownerUserId,
            page = page,
            pageSize = pageSize,
            status = null,
            type = type,
            category = workArea,
            area = null,
            reporterUserId = null,
            keyword = q,
            sortBy = sortBy,
            sortOrder = sortOrder,
            queue = queue,
            allowedAreas = principal.feedbackAreas,
        )
        return success(FeedbackAutomationListResponse.from(result))
    }

    @GetMapping("/{id}")
    fun detail(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
    ): ApiResult<FeedbackAutomationDetailResponse> {
        val principal = integrationTokens.validateAuthorization(authorization, IntegrationScope.FEEDBACK_READ)
        return success(
            FeedbackAutomationDetailResponse.from(
                reports.getByIdForAutomation(principal.ownerUserId, id, principal.feedbackAreas),
            ),
        )
    }

    @GetMapping("/{id}/events")
    fun events(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
    ): ApiResult<List<FeedbackAutomationEvent>> {
        val principal = integrationTokens.validateAuthorization(authorization, IntegrationScope.FEEDBACK_READ)
        reports.getByIdForAutomation(principal.ownerUserId, id, principal.feedbackAreas)
        return success(workflow.events(principal.ownerUserId, id).map(FeedbackAutomationEvent::from))
    }

    @GetMapping("/{id}/attachments/{mediaId}", produces = [MediaType.ALL_VALUE])
    fun attachment(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
        @PathVariable mediaId: String,
    ): ResponseEntity<*> {
        val principal = integrationTokens.validateAuthorization(authorization, IntegrationScope.FEEDBACK_READ)
        val asset = reports.getAttachmentForAutomation(
            principal.ownerUserId,
            id,
            mediaId,
            principal.feedbackAreas,
        )
        val resource = mediaStorage.loadAuthorizedAsset(asset)
        val contentType = runCatching { MediaType.parseMediaType(asset.mime) }
            .getOrDefault(MediaType.APPLICATION_OCTET_STREAM)
        return ResponseEntity.ok()
            .contentType(contentType)
            .contentLength(resource.contentLength())
            .cacheControl(CacheControl.noStore().cachePrivate())
            .header("X-Content-Type-Options", "nosniff")
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                    .filename(safeDownloadName(asset.originalName), StandardCharsets.UTF_8)
                    .build()
                    .toString(),
            )
            .body(resource)
    }

    @GetMapping("/{id}/analysis")
    fun latestAnalysis(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
    ): ApiResult<FeedbackAgentReviewResponse?> {
        val principal = integrationTokens.validateAuthorization(authorization, IntegrationScope.FEEDBACK_READ)
        val view = analysis.latest(principal.ownerUserId, id, principal.feedbackAreas)
        return success(view?.let(FeedbackAgentReviewResponse::from))
    }

    @PutMapping("/{id}/analysis", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun putAnalysis(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
        @Valid @RequestBody request: FeedbackAgentReviewRequest,
    ): ApiResult<FeedbackAgentReviewResponse> {
        val principal = integrationTokens.validateAuthorization(
            authorization,
            IntegrationScope.FEEDBACK_ANALYSIS_WRITE,
        )
        val view = analysis.save(
            ownerUserId = principal.ownerUserId,
            integrationTokenId = principal.tokenId,
            ticketId = id,
            allowedAreas = principal.feedbackAreas,
            input = request.toInput(),
        )
        return success(FeedbackAgentReviewResponse.from(view))
    }

    private fun safeDownloadName(originalName: String): String = originalName
        .replace('\r', '_')
        .replace('\n', '_')
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .ifBlank { "attachment" }
}

data class FeedbackAgentReviewRequest(
    val ticketUpdatedAt: Instant,
    @field:NotBlank
    @field:Size(max = 40)
    val source: String,
    @field:Size(max = 120)
    val model: String? = null,
    @field:NotBlank
    @field:Size(max = 4000)
    val summary: String,
    val classification: FeedbackAgentClassificationRequest = FeedbackAgentClassificationRequest(),
    @field:Size(max = 20)
    val suspectedModules: List<String> = emptyList(),
    @field:Size(max = 20)
    val suspectedFiles: List<String> = emptyList(),
    @field:NotBlank
    @field:Size(max = 40)
    val suggestedAction: String,
    val confidence: Double? = null,
    @field:Size(max = 20)
    val evidence: List<String> = emptyList(),
    val implementationResult: FeedbackAgentImplementationRequest? = null,
) {
    fun toInput() = FeedbackAgentReviewInput(
        ticketUpdatedAt = ticketUpdatedAt,
        source = source,
        model = model,
        summary = summary,
        suggestedType = classification.suggestedType,
        suggestedArea = classification.suggestedArea,
        severity = classification.severity,
        suspectedModules = suspectedModules,
        suspectedFiles = suspectedFiles,
        suggestedAction = suggestedAction,
        confidence = confidence,
        evidence = evidence,
        implementationResult = implementationResult?.let {
            FeedbackAgentImplementationInput(
                status = it.status,
                commit = it.commit,
                files = it.files,
                validation = it.validation,
            )
        },
    )
}

data class FeedbackAgentClassificationRequest(
    val suggestedType: String? = null,
    val suggestedArea: String? = null,
    val severity: String = "UNKNOWN",
)

data class FeedbackAgentImplementationRequest(
    val status: String? = null,
    val commit: String? = null,
    @field:Size(max = 20)
    val files: List<String> = emptyList(),
    @field:Size(max = 20)
    val validation: List<String> = emptyList(),
)
