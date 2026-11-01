package com.lhs.share.hub.controller.level

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.level.LevelCatalogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Level Catalog", description = "Public level catalog")
@RestController
@RequestMapping("/v1/level/catalog", produces = [MediaType.APPLICATION_JSON_VALUE])
class LevelCatalogController(
    private val service: LevelCatalogService,
) {
    @Operation(summary = "Read the public level catalog")
    @GetMapping
    fun list(
        @RequestParam(required = false) game: String?,
        @RequestParam(name = "cat_one", required = false) catOne: String?,
        @RequestParam(name = "cat_two", required = false) catTwo: String?,
        @RequestParam(required = false, name = "q") query: String?,
        @RequestParam(name = "include_archived", required = false, defaultValue = "false") includeArchived: Boolean,
        @RequestParam(name = "open_only", required = false, defaultValue = "false") openOnly: Boolean,
    ): ApiResult<com.lhs.share.hub.controller.level.response.LevelCatalogResponse> = success(
        service.catalog(game, catOne, catTwo, query, includeArchived, openOnly),
    )

    @Operation(summary = "Read one public level catalog entry")
    @GetMapping("/{levelKey}")
    fun get(@PathVariable levelKey: String): ApiResult<com.lhs.share.hub.controller.level.response.LevelCatalogItemResponse> =
        success(service.get(levelKey))
}
