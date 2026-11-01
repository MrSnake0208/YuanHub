package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.doc.StarCompletionReadResponses
import com.lhs.share.config.doc.StarCompletionWriteResponses
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.hub.controller.star.request.StarCompletionRequest
import com.lhs.share.hub.controller.star.response.StarCompletionContextResponse
import com.lhs.share.hub.controller.star.response.StarCompletionResponse
import com.lhs.share.hub.service.star.StarCompletionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "星石养成完成", description = "原子完成命令与持久回执")
@RequestMapping("/v1/star-state", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class StarCompletionController(private val service: StarCompletionService, private val helper: AuthenticationHelper) {
    @Operation(summary = "读取养成完成确认上下文")
    @StarCompletionReadResponses
    @RequireJwt
    @GetMapping("/completion-context")
    fun context(@RequestParam(name = "account_id") accountId: String): ApiResult<StarCompletionContextResponse> =
        ApiResult.success(service.context(helper.requireUserId(), accountId))

    @Operation(summary = "原子完成选中星石养成")
    @StarCompletionWriteResponses
    @RequireJwt
    @PostMapping("/completions", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun complete(@Valid @RequestBody request: StarCompletionRequest): ApiResult<StarCompletionResponse> =
        ApiResult.success(service.complete(helper.requireUserId(), request))

    @Operation(summary = "按原操作 ID 查询已提交完成回执")
    @StarCompletionReadResponses
    @RequireJwt
    @GetMapping("/completions/{operationId}")
    fun receipt(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable operationId: String,
    ): ApiResult<StarCompletionResponse> = ApiResult.success(service.receipt(helper.requireUserId(), accountId, operationId))
}
