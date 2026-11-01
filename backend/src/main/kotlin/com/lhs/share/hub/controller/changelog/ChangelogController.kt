package com.lhs.share.hub.controller.changelog

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.changelog.response.ChangelogPublicResponse
import com.lhs.share.hub.service.changelog.ChangelogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Changelog", description = "Published product changelog")
@RestController
@RequestMapping("/v1/changelog", produces = [MediaType.APPLICATION_JSON_VALUE])
class ChangelogController(private val service: ChangelogService) {
    @Operation(summary = "List published changelog entries")
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "10") size: Int,
    ): ApiResult<PagedDTO<ChangelogPublicResponse>> = success(service.publicEntries(page, size))
}
