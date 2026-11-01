package com.lhs.share.hub.controller.achievement

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.service.achievement.AchievementCatalogService
import com.lhs.share.hub.service.achievement.AchievementService
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Achievement Archive")
@RestController
@RequestMapping("/v1/achievements", produces = [MediaType.APPLICATION_JSON_VALUE])
class AchievementController(
    private val service: AchievementService,
    private val catalog: AchievementCatalogService,
    private val helper: AuthenticationHelper,
    private val mapper: ObjectMapper,
) {
    @RequireJwt
    @GetMapping("/catalog")
    fun catalog(@RequestParam game: String) = privateResult(catalog.catalog(game))

    @RequireJwt
    @GetMapping("/archive")
    fun archive(@RequestParam(name = "account_id") accountId: String) = privateResult(service.archive(helper.requireUserId(), accountId))

    @RequireJwt
    @PatchMapping("/records/{id}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable id: String, @RequestBody body: ByteArray) = AchievementRequestDecoder.write(requestBody(body), id).let {
        privateResult(service.update(helper.requireUserId(), it.accountId, it.expectedRevision, it.records))
    }

    @RequireJwt
    @PostMapping("/batch", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun batch(@RequestBody body: ByteArray) = AchievementRequestDecoder.write(requestBody(body)).let {
        privateResult(service.update(helper.requireUserId(), it.accountId, it.expectedRevision, it.records))
    }

    @RequireJwt
    @GetMapping("/export")
    fun export(@RequestParam(name = "account_id") accountId: String) = privateResult(service.export(helper.requireUserId(), accountId))

    @RequireJwt
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun preview(@RequestBody body: ByteArray) =
        privateResult(service.preview(helper.requireUserId(), AchievementRequestDecoder.exchange(requestBody(body), false)))

    @RequireJwt
    @PostMapping("/import/confirm", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun confirm(@RequestBody body: ByteArray) =
        privateResult(service.confirm(helper.requireUserId(), AchievementRequestDecoder.exchange(requestBody(body), true)))

    private fun requestBody(body: ByteArray): JsonNode {
        if (body.size > AchievementRequestDecoder.MAX_BYTES + 4096) {
            throw com.lhs.share.hub.service.inventory.InventoryApiException(
                org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                "achievement_import_too_large",
                "导入请求最多16MiB加4KiB封装",
            )
        }
        return try {
            mapper.reader().with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(body)
                ?: AchievementRequestDecoder.invalid("JSON 不能为空")
        } catch (_: JsonProcessingException) {
            throw com.lhs.share.hub.service.inventory.InventoryApiException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "invalid_json",
                "JSON 损坏",
            )
        }
    }

    private fun <T> privateResult(value: T) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
