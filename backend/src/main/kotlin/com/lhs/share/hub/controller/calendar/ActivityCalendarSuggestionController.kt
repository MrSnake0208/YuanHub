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
import com.lhs.share.hub.service.calendar.ActivityCalendarSuggestionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Activity Calendar Suggestions", description = "内测用户提交活动资料与查询私人审核结果")
@RequireJwt
@RestController
@RequestMapping("/v1/activity-calendar/suggestions", produces = [MediaType.APPLICATION_JSON_VALUE])
class ActivityCalendarSuggestionController(
    private val service: ActivityCalendarSuggestionService,
    private val helper: AuthenticationHelper,
    private val authorization: AdminAuthorizationService,
    mapper: ObjectMapper,
) {
    private val decoder = ActivityCalendarSuggestionRequestDecoder(mapper)

    @Operation(summary = "提交活动建议；同用户同请求标识同资料可安全重试")
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submit(@RequestBody body: JsonNode): ApiResult<ActivityCalendarSuggestionResponse> =
        success(service.submit(helper.requireUserId(), decoder.submit(body)))

    @Operation(summary = "分页查询本人建议，按提交时间与ID降序")
    @GetMapping("/mine")
    fun mine(
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(name = "page_size", defaultValue = "20") pageSize: Int,
    ): ApiResult<ActivityCalendarSuggestionPage> = success(service.mine(helper.requireUserId(), status, page, pageSize))

    @Operation(summary = "本人或活动维护成员查询建议；不存在或越权统一404")
    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): ApiResult<ActivityCalendarSuggestionResponse> {
        val actor = helper.requireUserId()
        return success(service.detail(actor, id, authorization.hasPermission(actor, AdminPermission.ACTIVITY_CALENDAR_WRITE)))
    }
}
