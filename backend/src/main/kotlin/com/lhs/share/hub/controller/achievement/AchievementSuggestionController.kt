package com.lhs.share.hub.controller.achievement

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionRequestDecoder
import com.lhs.share.hub.service.achievement.AchievementSuggestionService
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RequireJwt
@RestController
@RequestMapping("/v1/achievements/suggestions", produces = [MediaType.APPLICATION_JSON_VALUE])
class AchievementSuggestionController(
    private val service: AchievementSuggestionService,
    private val helper: AuthenticationHelper,
    mapper: ObjectMapper,
) {
    private val decoder = AchievementSuggestionRequestDecoder(mapper)

    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submit(@RequestBody body: JsonNode): ResponseEntity<*> = result(service.submit(helper.requireUserId(), decoder.submit(body)))

    @GetMapping
    fun mine(
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(name = "page_size", defaultValue = "20") size: Int,
    ): ResponseEntity<*> = result(service.mine(helper.requireUserId(), status, page, size))

    @GetMapping("/options")
    fun options(@RequestParam game: String): ResponseEntity<*> {
        helper.requireUserId()
        return result(service.options(game))
    }

    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): ResponseEntity<*> = result(service.detail(helper.requireUserId(), id))

    private fun result(value: Any) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
