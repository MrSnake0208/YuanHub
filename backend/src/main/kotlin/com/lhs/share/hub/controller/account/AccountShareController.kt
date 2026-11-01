package com.lhs.share.hub.controller.account

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.account.request.AccountShareScopeRequest
import com.lhs.share.hub.service.operator.OperatorShareService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/accounts/share", produces = [MediaType.APPLICATION_JSON_VALUE])
@RequireJwt
class AccountShareController(private val shares: OperatorShareService, private val helper: AuthenticationHelper) {
    @Operation(summary = "读取账号分享码及独立授权范围")
    @GetMapping
    fun current(@RequestParam(name = "account_id") accountId: String) = success(shares.getAccountShare(helper.requireUserId(), accountId))

    @Operation(summary = "开启或关闭一种分享；operator_tags 须先开启 operator，关闭 operator 一并撤销标签公开")
    @PatchMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun scope(@RequestParam(name = "account_id") accountId: String, @Valid @RequestBody request: AccountShareScopeRequest) =
        success(shares.setScope(helper.requireUserId(), accountId, request.scope!!, request.enabled!!))

    @Operation(summary = "重新生成账号分享码，使两种旧链接同时失效")
    @PostMapping("/regenerate")
    fun regenerate(@RequestParam(name = "account_id") accountId: String) =
        success(shares.regenerateAccountShare(helper.requireUserId(), accountId))

    @Operation(summary = "撤销全部分享")
    @DeleteMapping
    fun revoke(@RequestParam(name = "account_id") accountId: String) = success(shares.revokeAccountShare(helper.requireUserId(), accountId))
}
