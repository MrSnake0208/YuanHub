package com.lhs.share.hub.controller.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.inventory.response.MailboxHistoryResponse
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.service.inventory.MailboxHistoryService
import com.lhs.share.hub.service.inventory.MailboxReserveService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

@RestController
@RequireJwt
@RequestMapping("/v1/inventory/mailbox-reserve")
class MailboxReserveController(
    private val service: MailboxReserveService,
    private val helper: AuthenticationHelper,
    private val history: MailboxHistoryService,
) {
    @ExceptionHandler(ResponseStatusException::class)
    fun statusError(error: ResponseStatusException): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(error.statusCode).body(ApiResult.fail(error.statusCode.value(), error.reason))

    @GetMapping
    fun get(@RequestParam("account_id") accountId: String): ResponseEntity<ApiResult<MailboxReserveResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.get(helper.requireUserId(), accountId)))

    @GetMapping("/history")
    fun history(
        @RequestParam("account_id") accountId: String,
        @RequestParam from: Instant,
        @RequestParam to: Instant,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "100") limit: Int,
    ): ResponseEntity<ApiResult<MailboxHistoryResponse>> = ResponseEntity.ok().cacheControl(
        CacheControl.noStore(),
    ).body(success(history.list(helper.requireUserId(), accountId, from, to, cursor, limit)))

    @PostMapping("/sync")
    fun sync(@RequestParam("account_id") accountId: String): ResponseEntity<ApiResult<MailboxReserveResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.sync(helper.requireUserId(), accountId)))

    @GetMapping("/daily-status")
    fun dailyStatus(
        @RequestParam("account_id") accountId: String,
        @RequestParam day: String,
    ): ResponseEntity<ApiResult<Map<String, Any?>>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.dailyStatus(helper.requireUserId(), accountId, day)))

    @PutMapping
    fun save(
        @RequestParam("account_id") accountId: String,
        @RequestBody body: JsonNode,
    ): ResponseEntity<ApiResult<MailboxReserveResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.save(helper.requireUserId(), accountId, body)))
}
