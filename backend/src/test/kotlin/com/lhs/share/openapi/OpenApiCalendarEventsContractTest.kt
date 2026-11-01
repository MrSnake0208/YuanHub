package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarItem
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarResponse
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSourceType
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.LocalDate

class OpenApiCalendarEventsContractTest {
    private val tokens = mockk<OpenApiTokenService>()
    private val subscriptions = mockk<ActivityCalendarSubscriptionService>()
    private val calendar = mockk<ActivityCalendarService>()
    private val accounts = mockk<SubAccountService>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val mvc = MockMvcBuilders.standaloneSetup(OpenApiCalendarController(tokens, subscriptions, calendar, accounts))
        .setControllerAdvice(ActivityCalendarExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/open-api/calendar/events"

    private fun bind(game: String = "如鸢") {
        every { tokens.validateAuthorization("Bearer token", OpenApiPermission.CALENDAR_READ) } returns OpenApiPrincipal("u1", "a1")
        every { accounts.requireAccount("u1", "a1") } returns SubAccount(userId = "u1", accountId = "a1", name = "大号", game = game)
    }

    @Test
    fun `bound game catalog includes unsubscribed and recruitment items without subscription reads or writes`() {
        bind()
        val items = listOf(ActivityCalendarSourceType.MANUAL, ActivityCalendarSourceType.RECRUITMENT_POOL).map {
            ActivityCalendarItem(
                id = if (it == ActivityCalendarSourceType.MANUAL) "calendar:e1" else "recruitment:p1",
                sourceType = it,
                sourceRef = null,
                game = "如鸢",
                title = "未订阅活动",
                category = ActivityCalendarCategory.RECRUITMENT,
                startDate = LocalDate.parse("2026-10-18"),
            )
        }
        every { calendar.publicItems("如鸢", null, null, null) } returns ActivityCalendarResponse(items)
        mvc.perform(get(path).header("Authorization", "Bearer token").param("account_id", "other").param("game", "代号鸢"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("a1"))
            .andExpect(jsonPath("$.data.game").value("如鸢"))
            .andExpect(jsonPath("$.data.items[0].id").value("calendar:e1"))
            .andExpect(jsonPath("$.data.items[1].id").value("recruitment:p1"))
            .andExpect(jsonPath("$.data.items[0].start_date").value("2026-10-18"))
        verify(exactly = 1) { calendar.publicItems("如鸢", null, null, null) }
        verify { subscriptions wasNot Called }
    }

    @Test
    fun `empty game catalog returns success`() {
        bind("代号鸢")
        every { calendar.publicItems("代号鸢", null, null, null) } returns ActivityCalendarResponse(emptyList())
        mvc.perform(get(path).header("Authorization", "Bearer token"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.items").isEmpty)
    }

    @Test
    fun `missing token rejects before account or catalog access`() {
        every { tokens.validateAuthorization(null, OpenApiPermission.CALENDAR_READ) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")
        mvc.perform(get(path)).andExpect(status().isUnauthorized)
        verify {
            accounts wasNot Called
            calendar wasNot Called
        }
    }

    @Test
    fun `missing calendar scope rejects before account or catalog access`() {
        every { tokens.validateAuthorization("Bearer token", OpenApiPermission.CALENDAR_READ) } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "Missing scope")
        mvc.perform(get(path).header("Authorization", "Bearer token")).andExpect(status().isForbidden)
        verify {
            accounts wasNot Called
            calendar wasNot Called
        }
    }

    @Test
    fun `deleted bound account does not expose a catalog`() {
        bind()
        every { accounts.requireAccount("u1", "a1") } throws InventoryApiException(HttpStatus.NOT_FOUND, "not_found", "账号不存在")
        mvc.perform(get(path).header("Authorization", "Bearer token")).andExpect(status().isNotFound)
        verify { calendar wasNot Called }
    }
}
