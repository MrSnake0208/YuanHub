package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.operator.OperatorRelationshipService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/operator/relationships")
class OperatorRelationshipController(private val service: OperatorRelationshipService, private val auth: AuthenticationHelper) {
    @GetMapping("/catalog")
    fun catalog(@RequestParam game: String) = response(service.catalog(game))

    @GetMapping
    fun get(@RequestParam("account_id") account: String) = response(service.get(auth.requireUserId(), account))

    @PatchMapping
    fun patch(@RequestParam("account_id") account: String, @RequestBody body: JsonNode) =
        response(service.patch(auth.requireUserId(), account, body))

    private fun response(value: Map<String, Any>): ResponseEntity<ApiResult<Map<String, Any>>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
