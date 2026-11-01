package com.lhs.share.openapi

import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionResponse
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * 第三方 API:活动日历只读接口(API Token 认证,非 JWT)
 *
 * 账号完全由 token 绑定,不接受客户端传入 account_id;窗口内无活动时返回空列表而不是 404。
 */
@Tag(name = "OpenAPI Calendar")
@RequestMapping("/open-api/calendar", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class OpenApiCalendarController(
    private val tokenService: OpenApiTokenService,
    private val subscriptions: ActivityCalendarSubscriptionService,
    private val calendar: ActivityCalendarService,
    private val accounts: SubAccountService,
    private val clock: Clock = Clock.systemUTC(),
) {
    /**
     * 已订阅活动日历(需 API Token 且具备 calendar:read 权限)
     */
    @Operation(
        summary = "已订阅活动日历",
        description = "只读返回 token 绑定子账号已订阅的活动;窗口缺省为今天起 30 天,上限 180 天",
    )
    @RequireOpenApiToken
    @GetMapping("/subscriptions")
    fun list(
        @Parameter(hidden = true)
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate?,
        @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate?,
        @RequestParam(name = "category", required = false) category: String?,
        @RequestParam(name = "include_completed", required = false, defaultValue = "false") includeCompleted: Boolean,
    ): ResponseEntity<ApiResult<OpenApiCalendarSubscriptionsResponse>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.CALENDAR_READ)
        val start = from ?: LocalDate.ofInstant(clock.instant(), ZONE)
        val end = to ?: start.plusDays(DEFAULT_WINDOW_DAYS)
        val result = subscriptions.list(
            principal.userId,
            principal.accountId,
            start,
            end,
            category,
            maxWindowDays = MAX_WINDOW_DAYS,
        )
        val items = result.items
            .mapNotNull { it.event() }
            .filter { includeCompleted || !it.completed }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            success(
                OpenApiCalendarSubscriptionsResponse(
                    accountId = principal.accountId,
                    generatedAt = Instant.now(clock),
                    window = OpenApiCalendarWindow(start, end),
                    items = items,
                ),
            ),
        )
    }

    @Operation(summary = "当前游戏全部活动", description = "只读返回 token 绑定账号所属游戏的全部公开活动,含未订阅活动")
    @RequireOpenApiToken
    @GetMapping("/events")
    fun events(
        @Parameter(hidden = true)
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ResponseEntity<ApiResult<OpenApiCalendarEventsResponse>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.CALENDAR_READ)
        val account = accounts.requireAccount(principal.userId, principal.accountId)
        val items = calendar.publicItems(account.game, null, null, null).items
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            success(
                OpenApiCalendarEventsResponse(
                    accountId = principal.accountId,
                    game = account.game,
                    generatedAt = Instant.now(clock),
                    items = items,
                ),
            ),
        )
    }

    /**
     * 拍平订阅记录:只有能解析出活动条目的订阅才会出现在第三方响应里,category 取枚举名。
     */
    private fun CalendarSubscriptionResponse.event(): OpenApiCalendarEvent? {
        val activity = item ?: return null
        return OpenApiCalendarEvent(
            eventId = eventId,
            title = activity.title,
            category = activity.category.name,
            game = activity.game,
            startDate = activity.startDate,
            endDate = activity.endDate,
            startTime = activity.startTime,
            endTime = activity.endTime,
            timeZone = activity.timeZone,
            subscribed = subscribed,
            completed = completed,
        )
    }

    companion object {
        private val ZONE: ZoneId = ZoneId.of("Asia/Shanghai")
        private const val DEFAULT_WINDOW_DAYS = 30L
        private const val MAX_WINDOW_DAYS = 180L
    }
}
