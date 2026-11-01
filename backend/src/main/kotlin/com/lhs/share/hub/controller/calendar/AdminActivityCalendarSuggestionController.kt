package com.lhs.share.hub.controller.calendar

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionRequestDecoder
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionPage
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionResponse
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.calendar.ActivityCalendarApiException
import com.lhs.share.hub.service.calendar.ActivityCalendarSuggestionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Activity Calendar Suggestion Review", description = "活动维护成员查询、采纳与不采纳用户建议")
@RequireJwt
@RestController
@RequestMapping("/v1/admin/activity-calendar/suggestions", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminActivityCalendarSuggestionController(
    private val service: ActivityCalendarSuggestionService,
    private val helper: AuthenticationHelper,
    private val authorization: AdminAuthorizationService,
    mapper: ObjectMapper,
) {
    private val decoder = ActivityCalendarSuggestionRequestDecoder(mapper)

    @Operation(summary = "分页查询审核队列，按提交时间与ID升序")
    @GetMapping
    fun queue(
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) game: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(name = "page_size", defaultValue = "20") pageSize: Int,
    ): ApiResult<ActivityCalendarSuggestionPage> {
        requireEditor()
        return success(service.queue(status, game, page, pageSize))
    }

    @Operation(summary = "原子采纳建议并创建启用手工活动；已采纳重试返回旧结果")
    @PostMapping("/{id}/accept", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun accept(@PathVariable id: String, @RequestBody body: JsonNode): ApiResult<ActivityCalendarSuggestionResponse> =
        success(service.accept(requireEditor(), id, decoder.accept(body)))

    @Operation(summary = "按版本不采纳待审核建议，原因必填，终态不可改写")
    @PostMapping("/{id}/reject", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun reject(@PathVariable id: String, @RequestBody body: JsonNode): ApiResult<ActivityCalendarSuggestionResponse> =
        success(service.reject(requireEditor(), id, decoder.reject(body)))

    private fun requireEditor(): String {
        val actor = helper.requireUserId()
        if (!authorization.hasPermission(actor, AdminPermission.ACTIVITY_CALENDAR_WRITE)) {
            throw ActivityCalendarApiException(HttpStatus.FORBIDDEN, "forbidden", "需要活动日历维护权限")
        }
        return actor
    }
}
