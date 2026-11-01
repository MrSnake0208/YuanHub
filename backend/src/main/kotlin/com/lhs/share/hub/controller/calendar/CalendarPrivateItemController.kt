package com.lhs.share.hub.controller.calendar

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequestDecoder
import com.lhs.share.hub.service.calendar.CalendarPrivateItemService
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

@Tag(name = "Calendar Private Items")
@RequireJwt
@RestController
@RequestMapping("/v1/activity-calendar/private-items", produces = [MediaType.APPLICATION_JSON_VALUE])
class CalendarPrivateItemController(
    private val service: CalendarPrivateItemService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping
    fun list(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ) = success(service.list(actor(), accountId, from, to))

    @GetMapping("/{id}")
    fun get(@PathVariable id: String, @RequestParam(name = "account_id") accountId: String) = success(service.get(actor(), accountId, id))

    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@RequestBody body: JsonNode) = success(service.create(actor(), CalendarPrivateItemRequestDecoder.decode(body, false)))

    @PutMapping("/{id}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable id: String, @RequestBody body: JsonNode) =
        success(service.update(actor(), id, CalendarPrivateItemRequestDecoder.decode(body, true)))

    @DeleteMapping("/{id}")
    fun delete(
        @PathVariable id: String,
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(name = "expected_version") expectedVersion: Long,
        @RequestParam(
            name = "occurrence_date",
            required = false,
        ) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) occurrenceDate: LocalDate? =
            null,
    ) = success(service.delete(actor(), accountId, id, expectedVersion, occurrenceDate))

    private fun actor(): String = helper.requireUserId()
}
