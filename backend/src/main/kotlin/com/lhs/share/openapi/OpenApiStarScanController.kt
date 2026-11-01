package com.lhs.share.openapi

import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarScanReportRequest
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarScanService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/open-api/star/scans", produces = [MediaType.APPLICATION_JSON_VALUE])
class OpenApiStarScanController(
    private val tokens: OpenApiTokenService,
    private val scans: StarScanService,
    private val access: AdminAuthorizationService,
) {
    @RequireOpenApiToken
    @GetMapping("/account")
    fun account(@RequestHeader(value = "Authorization", required = false) authorization: String?) = principal(authorization).let {
        success(scans.account(it.userId, it.accountId))
    }

    @RequireOpenApiToken
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun upload(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody report: StarScanReportRequest,
    ) = principal(authorization).let {
        success(scans.upload(it.userId, it.accountId, report))
    }

    private fun principal(authorization: String?) = tokens.validateAuthorization(authorization, OpenApiPermission.STAR_SCAN_WRITE).also {
        if (!access.hasPermission(it.userId, AdminPermission.STAR_SCAN_REVIEW)) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "feature_forbidden", "没有该功能的访问权限")
        }
    }
}
