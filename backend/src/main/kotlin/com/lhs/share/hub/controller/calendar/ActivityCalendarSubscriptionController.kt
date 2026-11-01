package com.lhs.share.hub.controller.calendar

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.calendar.request.CalendarSubscriptionRequestDecoder
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

@Tag(name = "Activity Calendar Subscriptions")
@RequireJwt
@RestController
@RequestMapping("/v1/activity-calendar/subscriptions", produces = [MediaType.APPLICATION_JSON_VALUE])
class ActivityCalendarSubscriptionController(
    private val service: ActivityCalendarSubscriptionService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping
    fun list(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate?,
        @RequestParam(required = false) category: String?,
    ) = success(service.list(actor(), accountId, from, to, category))

    @GetMapping("/summary")
    fun summary(@RequestParam(name = "account_id") accountId: String) = success(service.summary(actor(), accountId))

    @GetMapping("/{eventId}")
    fun get(@PathVariable eventId: String, @RequestParam(name = "account_id") accountId: String) =
        success(service.get(actor(), accountId, eventId))

    @PutMapping("/{eventId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun subscribe(@PathVariable eventId: String, @RequestBody body: JsonNode) =
        success(service.subscribe(actor(), eventId, CalendarSubscriptionRequestDecoder.subscribe(body)))

    @PutMapping("/{eventId}/completion", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun completion(@PathVariable eventId: String, @RequestBody body: JsonNode) =
        success(service.completion(actor(), eventId, CalendarSubscriptionRequestDecoder.completion(body)))

    @PutMapping("/{eventId}/progress", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun progress(@PathVariable eventId: String, @RequestBody body: JsonNode) =
        success(service.progress(actor(), eventId, CalendarSubscriptionRequestDecoder.progress(body)))

    private fun actor(): String = helper.requireUserId()
}
