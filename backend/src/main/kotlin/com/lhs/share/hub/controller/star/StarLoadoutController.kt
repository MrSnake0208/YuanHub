package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.InventoryReadResponses
import com.lhs.share.config.doc.StarLoadoutWriteResponses
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarLoadoutCurrentRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutCurrentResponse
import com.lhs.share.hub.service.star.StarLoadoutService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "星石佩戴", description = "YuanStar account 级密探六槽星石引用快照")
@RequestMapping("/v1/star-loadout", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class StarLoadoutController(
    private val service: StarLoadoutService,
    private val helper: AuthenticationHelper,
) {
    @Operation(summary = "读取当前星石佩戴", description = "无佩戴快照时返回 revision=0 的空 loadouts。")
    @InventoryReadResponses
    @RequireJwt
    @GetMapping("/current")
    fun current(@RequestParam(name = "account_id") accountId: String): ApiResult<StarLoadoutCurrentResponse> = success(
        service.current(helper.requireUserId(), accountId),
    )

    @Operation(summary = "整体替换当前星石佩戴", description = "一次 account 级 CAS 保存完整 loadouts；同一 instance 不能重复占用。")
    @StarLoadoutWriteResponses
    @RequireJwt
    @PutMapping("/current", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun putCurrent(
        @RequestParam(name = "account_id") accountId: String,
        @Valid @RequestBody request: StarLoadoutCurrentRequest,
    ): ApiResult<StarLoadoutCurrentResponse> = success(
        service.putCurrent(helper.requireUserId(), accountId, request),
    )
}
