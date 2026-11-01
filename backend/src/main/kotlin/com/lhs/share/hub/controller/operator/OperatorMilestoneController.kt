package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.operator.response.OperatorMilestoneResponse
import com.lhs.share.hub.service.operator.OperatorMilestoneService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/operator/{operatorId}/milestones")
class OperatorMilestoneController(private val service: OperatorMilestoneService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun get(@RequestParam("account_id") account: String, @RequestParam game: String, @PathVariable operatorId: String) =
        response(service.get(helper.requireUserId(), account, game, operatorId))

    @PutMapping
    fun put(
        @RequestParam("account_id") account: String,
        @RequestParam game: String,
        @PathVariable operatorId: String,
        @RequestBody body: JsonNode,
    ) = response(service.put(helper.requireUserId(), account, game, operatorId, body))

    private fun response(value: OperatorMilestoneResponse): ResponseEntity<ApiResult<OperatorMilestoneResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
