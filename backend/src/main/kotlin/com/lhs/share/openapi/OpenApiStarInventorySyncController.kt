package com.lhs.share.openapi

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.service.star.StarInventorySyncService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/open-api/star/inventory-sync", produces = [MediaType.APPLICATION_JSON_VALUE])
class OpenApiStarInventorySyncController(private val tokens: OpenApiTokenService, private val syncs: StarInventorySyncService) {
    @RequireOpenApiToken
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun sync(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: JsonNode) =
        principal(authorization).let { success(syncs.sync(it.userId, it.accountId, StarInventorySyncRequest.fromWire(request))) }

    @RequireOpenApiToken
    @GetMapping("/{scanId}")
    fun status(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable scanId: String) =
        principal(authorization).let { success(syncs.status(it.userId, it.accountId, scanId)) }

    private fun principal(authorization: String?) = tokens.validateAuthorization(authorization, OpenApiPermission.STAR_SYNC_WRITE)
}
