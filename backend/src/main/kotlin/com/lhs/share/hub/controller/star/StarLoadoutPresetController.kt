package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.InventoryReadResponses
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.doc.StarLoadoutPresetWriteResponses
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarLoadoutPresetCurrentRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutPresetCurrentResponse
import com.lhs.share.hub.service.star.StarLoadoutPresetService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(name = "星石装配预设", description = "YuanHub user-global 主星与辅星名称预设")
@RequestMapping("/v1/star-loadout-presets", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class StarLoadoutPresetController(
    private val service: StarLoadoutPresetService,
    private val helper: AuthenticationHelper,
) {
    @Operation(summary = "读取当前用户的星石装配预设", description = "无快照时返回 revision=0 的空预设。")
    @InventoryReadResponses
    @RequireJwt
    @GetMapping("/current")
    fun current(): ApiResult<StarLoadoutPresetCurrentResponse> = success(service.current(helper.requireUserId()))

    @Operation(summary = "整体替换当前用户的星石装配预设", description = "一次 user-global CAS 保存完整主星与辅星预设。")
    @StarLoadoutPresetWriteResponses
    @RequireJwt
    @PutMapping("/current", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun putCurrent(@Valid @RequestBody request: StarLoadoutPresetCurrentRequest): ApiResult<StarLoadoutPresetCurrentResponse> =
        success(service.putCurrent(helper.requireUserId(), request))
}
