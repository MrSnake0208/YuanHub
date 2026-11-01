package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarItem
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSourceType
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionResponse
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionsResponse
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import com.lhs.share.hub.service.calendar.calendarInvalid
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * GET /open-api/calendar/subscriptions 契约测试
 *
 * 账号恒取 token principal.accountId;缺省窗口 30 天;无活动 200 + 空列表;token/scope/日期错误映射真实 HTTP 状态码。
 */
class OpenApiCalendarControllerContractTest {
    private val tokenService = mockk<OpenApiTokenService>()
    private val service = mockk<ActivityCalendarSubscriptionService>()
    private val clock: Clock = Clock.fixed(Instant.parse("2026-10-17T00:00:00Z"), ZoneOffset.UTC)
    private val controller = OpenApiCalendarController(tokenService, service, mockk(), mockk(), clock)
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val mvc = MockMvcBuilders.standaloneSetup(controller)
        .setControllerAdvice(ActivityCalendarExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/open-api/calendar/subscriptions"

    private fun bind() {
        every { tokenService.validateAuthorization("Bearer token", OpenApiPermission.CALENDAR_READ) } returns
            OpenApiPrincipal("u1", "acc1")
    }

    private fun event(eventId: String, completed: Boolean, startTime: String? = "05:00", endTime: String? = null) =
        CalendarSubscriptionResponse(
            eventId = eventId,
            version = 1,
            subscribed = true,
            completed = completed,
            checklist = emptyList(),
            item = ActivityCalendarItem(
                id = eventId,
                sourceType = ActivityCalendarSourceType.MANUAL,
                sourceRef = null,
                game = "代号鸢",
                title = "活动$eventId",
                category = ActivityCalendarCategory.RECRUITMENT,
                startDate = LocalDate.parse("2026-10-05"),
                endDate = null,
                startTime = startTime,
                endTime = endTime,
            ),
        )

    @Test
    fun `token bound account and default thirty day window`() {
        bind()
        val start = LocalDate.parse("2026-10-17")
        val end = LocalDate.parse("2026-11-16")
        every { service.list("u1", "acc1", start, end, null, 180L) } returns
            CalendarSubscriptionsResponse(emptyList(), emptyList(), 0)

        val data = requireNotNull(controller.list("Bearer token", null, null, null, false).body?.data)

        assertEquals("acc1", data.accountId)
        assertEquals(OpenApiCalendarWindow(start, end), data.window)
        assertEquals(Instant.parse("2026-10-17T00:00:00Z"), data.generatedAt)
        assertTrue(data.items.isEmpty())
        verify { service.list("u1", "acc1", start, end, null, 180L) }
    }

    @Test
    fun `explicit window and category are forwarded and enum name is flattened`() {
        bind()
        val start = LocalDate.parse("2026-10-01")
        val end = LocalDate.parse("2026-10-31")
        every { service.list("u1", "acc1", start, end, "RECRUITMENT", 180L) } returns
            CalendarSubscriptionsResponse(listOf(event("e1", completed = false)), emptyList(), 1)

        val data = requireNotNull(controller.list("Bearer token", start, end, "RECRUITMENT", true).body?.data)

        assertEquals(OpenApiCalendarWindow(start, end), data.window)
        val item = data.items.single()
        assertEquals("e1", item.eventId)
        assertEquals("活动e1", item.title)
        assertEquals("RECRUITMENT", item.category)
        assertEquals("代号鸢", item.game)
        assertEquals(LocalDate.parse("2026-10-05"), item.startDate)
        assertNull(item.endDate)
        assertEquals("05:00", item.startTime)
        assertNull(item.endTime)
        assertEquals("Asia/Shanghai", item.timeZone)
        assertTrue(item.subscribed)
        assertFalse(item.completed)
        verify { service.list("u1", "acc1", start, end, "RECRUITMENT", 180L) }
    }

    @Test
    fun `include_completed filters completed entries and unavailable items are dropped`() {
        bind()
        val start = LocalDate.parse("2026-10-17")
        val end = LocalDate.parse("2026-11-16")
        val done = event("done", completed = true)
        val open = event("open", completed = false)
        val unavailable = CalendarSubscriptionResponse("gone", 1, true, false, emptyList(), null)
        every { service.list("u1", "acc1", start, end, null, 180L) } returns
            CalendarSubscriptionsResponse(listOf(done, unavailable, open), listOf(event("hidden", false)), 3)

        val filtered = requireNotNull(controller.list("Bearer token", null, null, null, false).body?.data)
        val kept = requireNotNull(controller.list("Bearer token", null, null, null, true).body?.data)

        assertEquals(listOf("open"), filtered.items.map { it.eventId })
        assertEquals(listOf("done", "open"), kept.items.map { it.eventId })
    }

    @Test
    fun `read endpoint is snake case uncached and ignores client account id`() {
        bind()
        val start = LocalDate.parse("2026-10-17")
        val end = LocalDate.parse("2026-11-16")
        every { service.list("u1", "acc1", start, end, null, 180L) } returns
            CalendarSubscriptionsResponse(
                listOf(event("done", completed = true), event("open", completed = false)),
                emptyList(),
                2,
            )

        mvc.perform(get(path).header("Authorization", "Bearer token").param("account_id", "victim"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.generated_at").value("2026-10-17T00:00:00Z"))
            .andExpect(jsonPath("$.data.window.from").value("2026-10-17"))
            .andExpect(jsonPath("$.data.window.to").value("2026-11-16"))
            .andExpect(jsonPath("$.data.items[0].event_id").value("open"))
            .andExpect(jsonPath("$.data.items[1]").doesNotExist())
            .andExpect(jsonPath("$.data.items[0].category").value("RECRUITMENT"))
            .andExpect(jsonPath("$.data.items[0].game").value("代号鸢"))
            .andExpect(jsonPath("$.data.items[0].start_date").value("2026-10-05"))
            .andExpect(jsonPath("$.data.items[0].start_time").value("05:00"))
            .andExpect(content().string(containsString("\"end_time\":null")))
            .andExpect(jsonPath("$.data.items[0].time_zone").value("Asia/Shanghai"))
            .andExpect(jsonPath("$.data.items[0].subscribed").value(true))
            .andExpect(jsonPath("$.data.items[0].completed").value(false))
            .andExpect(jsonPath("$.data.items[0].account_id").doesNotExist())
            .andExpect(jsonPath("$.data.user_id").doesNotExist())

        mvc.perform(get(path).header("Authorization", "Bearer token").param("include_completed", "true"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items[0].event_id").value("done"))
            .andExpect(jsonPath("$.data.items[1].event_id").value("open"))
            .andExpect(jsonPath("$.data.items[2]").doesNotExist())

        verify(exactly = 2) { service.list("u1", "acc1", start, end, null, 180L) }
    }

    @Test
    fun `empty window returns 200 with empty items instead of 404`() {
        bind()
        val start = LocalDate.parse("2026-10-01")
        val end = LocalDate.parse("2026-10-31")
        every { service.list("u1", "acc1", start, end, "SHOP", 180L) } returns
            CalendarSubscriptionsResponse(emptyList(), emptyList(), 0)

        mvc.perform(
            get(path).header("Authorization", "Bearer token")
                .param("from", "2026-10-01").param("to", "2026-10-31").param("category", "SHOP"),
        )
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.items").isEmpty)
            .andExpect(jsonPath("$.data.window.from").value("2026-10-01"))
            .andExpect(jsonPath("$.data.window.to").value("2026-10-31"))
    }

    @Test
    fun `missing token maps to real 401`() {
        every { tokenService.validateAuthorization(null, OpenApiPermission.CALENDAR_READ) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")

        mvc.perform(get(path))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))

        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `token without calendar scope maps to real 403`() {
        every { tokenService.validateAuthorization("Bearer token", OpenApiPermission.CALENDAR_READ) } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")

        mvc.perform(get(path).header("Authorization", "Bearer token"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))

        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `invalid window and malformed date map to 422`() {
        bind()
        every { service.list(any(), any(), any(), any(), any(), any()) } throws calendarInvalid("日期范围须在180天以内")

        mvc.perform(
            get(path).header("Authorization", "Bearer token").param("from", "2026-10-17").param("to", "2026-10-16"),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))

        mvc.perform(get(path).header("Authorization", "Bearer token").param("from", "not-a-date"))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }
}
