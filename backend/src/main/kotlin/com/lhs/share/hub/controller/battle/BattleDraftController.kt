package com.lhs.share.hub.controller.battle

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.battle.BattleDraftService
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/battle-drafts", produces = [MediaType.APPLICATION_JSON_VALUE])
class BattleDraftController(
    private val service: BattleDraftService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping
    fun list(@RequestParam("account_id") accountId: String) = ok(service.list(helper.requireUserId(), accountId))

    @GetMapping("/{id}")
    fun get(@RequestParam("account_id") accountId: String, @PathVariable id: String) =
        ok(service.get(helper.requireUserId(), accountId, id))

    @PostMapping
    fun create(@RequestParam("account_id") accountId: String, @RequestBody body: JsonNode) =
        ok(service.create(helper.requireUserId(), accountId, body))

    @PutMapping("/{id}")
    fun save(@RequestParam("account_id") accountId: String, @PathVariable id: String, @RequestBody body: JsonNode) =
        ok(service.save(helper.requireUserId(), accountId, id, body))

    @DeleteMapping("/{id}")
    fun delete(@RequestParam("account_id") accountId: String, @PathVariable id: String) =
        service.delete(helper.requireUserId(), accountId, id).let { ok(mapOf("deleted" to true)) }

    private fun <T> ok(body: T) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(body))
}
