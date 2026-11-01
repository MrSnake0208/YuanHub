package com.lhs.share.hub.controller.beta

import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.hub.service.beta.BetaService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/beta")
@Tag(name = "Beta", description = "内测说明、自助报名及候补；注册账号不消耗名额")
class BetaController(private val service: BetaService, private val helper: AuthenticationHelper) {
    @GetMapping("/status")
    @Operation(summary = "公开内测状态", description = "仅此接口匿名可用；动态响应不得缓存")
    fun status(): ResponseEntity<ApiResult<BetaStatusResponse>> = reply(service.status())

    @RequireJwt
    @GetMapping("/me")
    @AccessLimit(times = 600, second = 60)
    @Operation(summary = "本人资格", description = "无需已开通；含同次读取的campaign状态")
    fun me(): ResponseEntity<ApiResult<BetaMeResponse>> = reply(service.me(helper.requireUserId()))

    @RequireJwt
    @PostMapping("/join")
    @AccessLimit(times = 100, second = 10)
    @Operation(summary = "自助报名", description = "确认须知后受理，满额自动候补；重复请求不重复占位")
    fun join(@RequestBody request: BetaJoinRequest): ResponseEntity<ApiResult<BetaMeResponse>> =
        reply(service.join(helper.requireUserId(), request))

    @RequireJwt
    @DeleteMapping("/waitlist")
    @AccessLimit(times = 100, second = 10)
    @Operation(summary = "取消候补", description = "只可取消WAITING，不回收ACTIVE；再次报名排到队尾")
    fun withdraw(): ResponseEntity<ApiResult<BetaMeResponse>> = reply(service.withdraw(helper.requireUserId()))

    @RequireJwt
    @PostMapping("/test-reset")
    @AccessLimit(times = 100, second = 10)
    @Operation(summary = "重置本地内测（自助）", description = "仅在本地测试模式生效；只清空隔离的本地活动并立即重新开放，不影响正式内测")
    fun testReset(): ResponseEntity<ApiResult<BetaMeResponse>> = reply(service.resetLocalSelf(helper.requireUserId()))

    private fun <T> reply(data: T): ResponseEntity<ApiResult<T>> = ResponseEntity.ok()
        .cacheControl(CacheControl.noStore()).body(ApiResult.success(data))
}
