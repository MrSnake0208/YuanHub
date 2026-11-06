package com.lhs.share.openapi

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/user/operator-match/connections")
@RequireJwt
class OperatorMatchConnectionController(
    private val service: OperatorMatchConnectionService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping
    fun list() = noStore(service.list(helper.requireUserId()))

    @PostMapping
    fun create() = noStore(service.create(helper.requireUserId()))

    @GetMapping("/{id}/secret")
    fun secret(@PathVariable id: String) = noStore(service.secret(helper.requireUserId(), id))

    @DeleteMapping("/{id}")
    fun revoke(@PathVariable id: String): ResponseEntity<ApiResult<Unit>> {
        service.revoke(helper.requireUserId(), id)
        return noStore(Unit)
    }
}

@RestController
@RequestMapping("/open-api/operator-match")
class OperatorMatchController(private val service: OperatorMatchService) {
    @GetMapping("/accounts")
    fun accounts(@RequestHeader("Authorization", required = false) bearer: String?) = noStore(service.accounts(bearer))

    @GetMapping("/accounts/{accountId}/roster")
    fun roster(@RequestHeader("Authorization", required = false) bearer: String?, @PathVariable accountId: String) =
        noStore(service.roster(bearer, accountId))
}

private fun <T> noStore(value: T): ResponseEntity<ApiResult<T>> =
    ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
