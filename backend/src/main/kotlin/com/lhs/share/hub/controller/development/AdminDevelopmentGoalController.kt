package com.lhs.share.hub.controller.development

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.development.request.DevelopmentGoalRequest
import com.lhs.share.hub.controller.development.response.DevelopmentGoalResponse
import com.lhs.share.hub.service.development.DevelopmentGoalService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/admin/development-goals", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminDevelopmentGoalController(private val service: DevelopmentGoalService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "12") size: Int,
        @RequestParam(required = false) stage: String?,
    ): ApiResult<PagedDTO<DevelopmentGoalResponse>> = success(service.list(page, size, stage, helper.requireUserId()))

    @PostMapping
    fun create(@RequestBody request: DevelopmentGoalRequest): ApiResult<DevelopmentGoalResponse> =
        success(service.create(helper.requireUserId(), request))

    @GetMapping("/{id}")
    fun get(@PathVariable id: String): ApiResult<DevelopmentGoalResponse> = success(service.get(helper.requireUserId(), id))

    @PutMapping("/{id}")
    fun update(@PathVariable id: String, @RequestBody request: DevelopmentGoalRequest): ApiResult<DevelopmentGoalResponse> =
        success(service.update(helper.requireUserId(), id, request))
}
