package com.lhs.share.openapi.diagnostics

import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.report.FeedbackArea
import com.lhs.share.openapi.integration.IntegrationApiException
import com.lhs.share.openapi.integration.IntegrationScope
import com.lhs.share.openapi.integration.IntegrationTokenService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/open-api/maayuan-diagnostics")
class OpenApiMaayuanDiagnosticController(private val center: MaayuanDiagnosticCenterService, private val tokens: IntegrationTokenService) {
    @GetMapping("/issues")
    fun issues(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(defaultValue = "NEW") status: String,
        @RequestParam(required = false) reason: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "lastSeen") sort: String,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(name = "page_size", defaultValue = "20") pageSize: Int,
    ) = authorized(authorization) { success(center.list(status, reason, q, sort, page, pageSize)) }

    @GetMapping("/issues/{id}")
    fun issue(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: String) =
        authorized(authorization) { success(center.detail(id)) }

    @GetMapping("/events/{eventId}")
    fun event(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable eventId: String) =
        authorized(authorization) { success(center.event(eventId)) }

    @GetMapping("/events/{eventId}/media/{assetId}", produces = [MediaType.ALL_VALUE])
    fun media(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable eventId: String,
        @PathVariable assetId: String,
    ) = authorized(authorization) { center.mediaResponse(eventId, assetId) }

    @PutMapping("/issues/{id}/analysis")
    fun analysis(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: String,
        @Valid @RequestBody request: DiagnosticAnalysisRequest,
    ) = authorized(authorization, IntegrationScope.DIAGNOSTICS_ANALYSIS_WRITE) { success(center.analysis(id, request)) }

    private fun <T> authorized(authorization: String?, scope: IntegrationScope = IntegrationScope.DIAGNOSTICS_READ, action: () -> T): T {
        val principal = tokens.validateAuthorization(authorization, scope)
        if (principal.feedbackAreas?.contains(FeedbackArea.MAAYUAN) != true) {
            throw IntegrationApiException(HttpStatus.FORBIDDEN, "diagnostics_area_missing", "Integration token must include MAAYUAN")
        }
        center.requireAccess(principal.ownerUserId)
        return action()
    }
}
