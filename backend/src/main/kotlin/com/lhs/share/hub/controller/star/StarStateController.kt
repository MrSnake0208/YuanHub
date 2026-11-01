package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.InventoryReadResponses
import com.lhs.share.config.doc.StarStateWriteResponses
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarStateRestoreRequest
import com.lhs.share.hub.controller.star.response.StarRecoveryPointResponse
import com.lhs.share.hub.controller.star.response.StarStateCommandResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.service.star.StarStateService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "星石当前状态", description = "账号级 StarState generation 与恢复点")
@RequestMapping("/v1/star-state", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class StarStateController(private val service: StarStateService, private val helper: AuthenticationHelper) {
    @Operation(summary = "读取当前 StarState")
    @InventoryReadResponses
    @RequireJwt
    @GetMapping("/current")
    fun current(@RequestParam(name = "account_id") accountId: String): ApiResult<StarStateCurrentResponse> =
        success(service.current(helper.requireUserId(), accountId))

    @Operation(summary = "在当前 generation 内编辑星石状态")
    @StarStateWriteResponses
    @RequireJwt
    @PatchMapping("/current", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun patch(@RequestParam(name = "account_id") accountId: String, @Valid @RequestBody request: StarStatePatchRequest): ApiResult<StarStateCommandResponse> =
        success(service.patch(helper.requireUserId(), accountId, request))

    @Operation(summary = "完整 OCR 或 JSON 替换，创建新 generation 与恢复点")
    @StarStateWriteResponses
    @RequireJwt
    @PostMapping("/rebuild", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun rebuild(@RequestParam(name = "account_id") accountId: String, @Valid @RequestBody request: StarStateRebuildRequest): ApiResult<StarStateCommandResponse> =
        success(service.rebuild(helper.requireUserId(), accountId, request))

    @Operation(summary = "读取最近三个星石恢复点")
    @InventoryReadResponses
    @RequireJwt
    @GetMapping("/recovery-points")
    fun recoveryPoints(@RequestParam(name = "account_id") accountId: String): ApiResult<List<StarRecoveryPointResponse>> =
        success(service.recoveryPoints(helper.requireUserId(), accountId))

    @Operation(summary = "恢复历史状态为新的 generation")
    @StarStateWriteResponses
    @RequireJwt
    @PostMapping("/recovery-points/{pointId}/restore", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun restore(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable pointId: String,
        @Valid @RequestBody request: StarStateRestoreRequest,
    ): ApiResult<StarStateCommandResponse> = success(service.restore(helper.requireUserId(), accountId, pointId, request))
}
