package com.lhs.share.openapi.diagnostics

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import jakarta.validation.Valid
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RequireJwt
@RestController
@RequestMapping("/v1/admin/maayuan-diagnostics")
class AdminMaayuanDiagnosticController(private val center: MaayuanDiagnosticCenterService, private val helper: AuthenticationHelper) {
    @GetMapping("/issues")
    fun issues(
        @RequestParam(defaultValue = "NEW") status: String,
        @RequestParam(required = false) reason: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "lastSeen") sort: String,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") pageSize: Int,
    ) = authorized { success(center.list(status, reason, q, sort, page, pageSize)) }

    @GetMapping("/issues/{id}")
    fun issue(@PathVariable id: String) = authorized { success(center.detail(id)) }

    @GetMapping("/events/{eventId}")
    fun event(@PathVariable eventId: String) = authorized {
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(center.event(eventId, includeUrls = true)))
    }

    @GetMapping("/events/{eventId}/media/{assetId}", produces = [MediaType.ALL_VALUE])
    fun media(@PathVariable eventId: String, @PathVariable assetId: String) = authorized { center.mediaResponse(eventId, assetId) }

    @PatchMapping("/issues/{id}")
    fun update(@PathVariable id: String, @Valid @RequestBody request: DiagnosticIssueUpdateRequest) = authorized {
        success(center.update(id, helper.requireUserId(), request))
    }

    private fun <T> authorized(action: () -> T): T {
        center.requireAccess(helper.requireUserId())
        return action()
    }
}
