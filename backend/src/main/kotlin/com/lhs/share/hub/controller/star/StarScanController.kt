package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarScanApplyRequest
import com.lhs.share.hub.service.star.StarScanService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/star/scans", produces = [MediaType.APPLICATION_JSON_VALUE])
class StarScanController(private val scans: StarScanService, private val helper: AuthenticationHelper) {
    @RequireJwt
    @GetMapping("/pending")
    fun pending(@RequestParam(name = "account_id") accountId: String) = success(scans.pending(helper.requireUserId(), accountId))

    @RequireJwt
    @GetMapping("/{recordId}")
    fun review(@RequestParam(name = "account_id") accountId: String, @PathVariable recordId: String) =
        success(scans.review(helper.requireUserId(), accountId, recordId))

    @RequireJwt
    @PostMapping("/{recordId}/apply", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun apply(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable recordId: String,
        @RequestBody request: StarScanApplyRequest,
    ) = success(scans.apply(helper.requireUserId(), accountId, recordId, request))

    @RequireJwt
    @PostMapping("/{recordId}/discard")
    fun discard(@RequestParam(name = "account_id") accountId: String, @PathVariable recordId: String): Any {
        scans.discard(helper.requireUserId(), accountId, recordId)
        return success(mapOf("record_id" to recordId))
    }
}
