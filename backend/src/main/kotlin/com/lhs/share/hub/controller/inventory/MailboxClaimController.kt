package com.lhs.share.hub.controller.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.service.inventory.MailboxClaimService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
class MailboxClaimController(private val service: MailboxClaimService, private val helper: AuthenticationHelper) {
    @PostMapping("/v1/inventory/mailbox-reserve/claim")
    fun claim(
        @RequestParam("account_id") accountId: String,
        @RequestBody body: JsonNode,
    ): ResponseEntity<ApiResult<MailboxReserveResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.claim(helper.requireUserId(), accountId, body)))
}
