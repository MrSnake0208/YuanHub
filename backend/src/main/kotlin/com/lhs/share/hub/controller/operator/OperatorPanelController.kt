package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.operator.OperatorPanelService
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/operator/panel", produces = [MediaType.APPLICATION_JSON_VALUE])
class OperatorPanelController(private val panels: OperatorPanelService, private val helper: AuthenticationHelper) {
    @RequireJwt
    @AccessLimit(times = 60, second = 60)
    @PostMapping("/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun preview(@RequestBody request: JsonNode) = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(success(panels.preview(helper.requireUserId(), request)))

    @RequireJwt
    @AccessLimit(times = 20, second = 60)
    @PostMapping("/current", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun current(@RequestBody request: JsonNode) = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(success(panels.current(helper.requireUserId(), request)))
}
