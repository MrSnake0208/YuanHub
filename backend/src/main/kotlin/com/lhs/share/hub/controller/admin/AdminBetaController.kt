package com.lhs.share.hub.controller.admin

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.hub.controller.beta.BetaAdminResponse
import com.lhs.share.hub.controller.beta.BetaAdmissionsRequest
import com.lhs.share.hub.controller.beta.BetaCapacityRequest
import com.lhs.share.hub.controller.beta.BetaLocalResetRequest
import com.lhs.share.hub.controller.beta.BetaModeRequest
import com.lhs.share.hub.service.beta.BetaService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/admin/beta")
@Tag(name = "Beta Admin", description = "需要beta:manage，不要求管理员占用内测名额")
class AdminBetaController(private val service: BetaService, private val helper: AuthenticationHelper) {
    @GetMapping
    @Operation(summary = "内测管理状态")
    fun status(): ResponseEntity<ApiResult<BetaAdminResponse>> = reply(service.admin(helper.requireUserId()))

    @PutMapping("/admissions")
    @Operation(summary = "暂停或恢复新增", description = "不影响已开通用户；仍接受候补")
    fun admissions(@RequestBody request: BetaAdmissionsRequest): ResponseEntity<ApiResult<BetaAdminResponse>> = reply(
        service.setAdmissions(helper.requireUserId(), request.paused, request.reason, request.expectedConfigVersion),
    )

    @PutMapping("/capacity")
    @Operation(
        summary = "绝对值扩容",
        description = "按绝对目标容量调整，只增不减；新增名额全部公开且候补优先。除防止误输入的系统安全上限外没有本轮人数上限。",
    )
    fun capacity(@RequestBody request: BetaCapacityRequest): ResponseEntity<ApiResult<BetaAdminResponse>> = reply(
        service.setCapacity(helper.requireUserId(), request.capacity, request.reason, request.expectedConfigVersion),
    )

    @PutMapping("/mode")
    @Operation(summary = "维护、内测或正式开放", description = "首次OPEN后只能在OPEN和CLOSED间切换，不能退回旧内测配额")
    fun mode(@RequestBody request: BetaModeRequest): ResponseEntity<ApiResult<BetaAdminResponse>> = reply(
        service.setMode(helper.requireUserId(), request.accessMode, request.reason, request.expectedConfigVersion),
    )

    @PutMapping("/local-reset")
    @Operation(summary = "重置本地内测", description = "仅显式本地测试模式可用；清空本地活动报名并重新立即开放，不影响正式活动")
    fun localReset(@RequestBody request: BetaLocalResetRequest): ResponseEntity<ApiResult<BetaAdminResponse>> = reply(
        service.resetLocal(helper.requireUserId(), request.reason),
    )

    private fun reply(data: BetaAdminResponse): ResponseEntity<ApiResult<BetaAdminResponse>> = ResponseEntity.ok()
        .cacheControl(CacheControl.noStore()).body(ApiResult.success(data))
}
