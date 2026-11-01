package com.lhs.share.hub.controller.development

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.development.response.DevelopmentGoalResponse
import com.lhs.share.hub.service.development.DevelopmentGoalService
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Development goals", description = "Public development objectives and acceptance progress")
@RestController
@RequestMapping("/v1/development-goals", produces = [MediaType.APPLICATION_JSON_VALUE])
class DevelopmentGoalController(private val service: DevelopmentGoalService) {
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "12") size: Int,
        @RequestParam(required = false) stage: String?,
    ): ApiResult<PagedDTO<DevelopmentGoalResponse>> = success(service.list(page, size, stage))
}
