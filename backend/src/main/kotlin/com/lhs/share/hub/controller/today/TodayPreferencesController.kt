package com.lhs.share.hub.controller.today

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.today.response.TodayPreferencesResponse
import com.lhs.share.hub.service.today.TodayPreferencesService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/today/preferences")
class TodayPreferencesController(private val service: TodayPreferencesService, private val helper: AuthenticationHelper) {
    @GetMapping("/{mode}")
    fun get(@PathVariable mode: String): ResponseEntity<ApiResult<TodayPreferencesResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.get(helper.requireUserId(), mode)))

    @PutMapping("/{mode}")
    fun save(@PathVariable mode: String, @RequestBody body: JsonNode): ResponseEntity<ApiResult<TodayPreferencesResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.save(helper.requireUserId(), mode, body)))
}
