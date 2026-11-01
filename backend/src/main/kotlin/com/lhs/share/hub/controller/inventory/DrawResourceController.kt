package com.lhs.share.hub.controller.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.inventory.request.DrawResourceRequest
import com.lhs.share.hub.controller.inventory.response.DrawResourceContextResponse
import com.lhs.share.hub.controller.inventory.response.InventoryRecordListItemDto
import com.lhs.share.hub.service.inventory.DrawResourceService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/inventory/draw-resources")
class DrawResourceController(private val service: DrawResourceService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun context(@RequestParam("account_id") accountId: String): ResponseEntity<ApiResult<DrawResourceContextResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.context(helper.requireUserId(), accountId)))

    @PostMapping
    fun execute(@RequestBody body: JsonNode): ResponseEntity<ApiResult<InventoryRecordListItemDto>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            success(InventoryRecordListItemDto.of(service.execute(helper.requireUserId(), DrawResourceRequest.parse(body)))),
        )
}
