package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.operator.response.OperatorDailyTasksResponse
import com.lhs.share.hub.service.operator.OperatorDailyTasksService
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
@RequestMapping("/v1/operator/training-plans/{planId}/daily-tasks")
class OperatorDailyTasksController(private val service: OperatorDailyTasksService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun get(@RequestParam("account_id") accountId: String, @PathVariable planId: String, @RequestParam date: String) =
        response(service.get(helper.requireUserId(), accountId, planId, date))

    @PutMapping
    fun adopt(
        @RequestParam("account_id") accountId: String,
        @PathVariable planId: String,
        @RequestParam date: String,
        @RequestBody body: JsonNode,
    ) = response(service.adopt(helper.requireUserId(), accountId, planId, date, body))

    @PutMapping("/{entryId}")
    fun complete(
        @RequestParam("account_id") accountId: String,
        @PathVariable planId: String,
        @RequestParam date: String,
        @PathVariable entryId: String,
        @RequestBody body: JsonNode,
    ) = response(service.complete(helper.requireUserId(), accountId, planId, date, entryId, body))

    private fun response(value: OperatorDailyTasksResponse): ResponseEntity<ApiResult<OperatorDailyTasksResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
