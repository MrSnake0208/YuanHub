package com.lhs.share.openapi

import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.achievement.response.AchievementCatalogResponse
import com.lhs.share.hub.service.achievement.AchievementCatalogService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.security.MessageDigest

@RestController
@RequestMapping("/open-api/achievements", produces = [MediaType.APPLICATION_JSON_VALUE])
class OpenApiAchievementController(
    private val catalogService: AchievementCatalogService,
    @Value("\${openapi.catalog-read-key:}") private val catalogReadKey: String,
) {
    @AccessLimit(times = 60, second = 60)
    @GetMapping("/catalog")
    fun catalog(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) game: String?,
    ): ResponseEntity<ApiResult<AchievementCatalogResponse>> {
        if (catalogReadKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(fail(HttpStatus.SERVICE_UNAVAILABLE.value(), "成就目录开放接口未启用"))
        }

        val suppliedKey = authorization?.takeIf { it.startsWith("Bearer ", ignoreCase = true) }?.substringAfter(' ')
        if (suppliedKey == null || !MessageDigest.isEqual(catalogReadKey.toByteArray(), suppliedKey.toByteArray())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
                .body(fail(HttpStatus.UNAUTHORIZED.value(), "成就目录读取 Key 缺失或无效"))
        }

        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(catalogService.catalog(game.orEmpty())))
    }
}
