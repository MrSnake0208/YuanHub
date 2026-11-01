package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.CalendarPrivateItemController
import com.lhs.share.hub.controller.calendar.response.CalendarPrivateItemResponse
import com.lhs.share.hub.service.calendar.ActivityCalendarApiException
import com.lhs.share.hub.service.calendar.CalendarPrivateItemService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant
import java.time.LocalDate

class CalendarPrivateItemControllerContractTest {
    private val service = mockk<CalendarPrivateItemService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val path = "/v1/activity-calendar/private-items"
    private val id = "pci_00000000-0000-0000-0000-000000000001"
    private val body = """{"account_id":"a","title":"  私人内容  ","date":"2026-10-15"}"""
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "owner"
        mvc = MockMvcBuilders.standaloneSetup(CalendarPrivateItemController(service, helper))
            .setControllerAdvice(ActivityCalendarExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `strict fields reject forged ownership public event binding invalid dates and coercions`() {
        listOf(
            body.replace("2026-10-15", "2026-02-30"), body.replace("2026-10-15", "0000-01-01"),
            body.replace("2026-10-15", "2026-1-15"), body.replace("\"  私人内容  \"", "false"),
            body.dropLast(1) + ",\"user_id\":\"other\"}", body.dropLast(1) + ",\"game\":\"代号鸢\"}",
            body.dropLast(1) + ",\"event_id\":\"evt\"}", body.dropLast(1) + ",\"expected_version\":0}",
            body.dropLast(1) + ",\"time\":\"24:00\"}", body.dropLast(1) + ",\"time\":1}",
            body.dropLast(1) + ",\"note\":null}", body.dropLast(1) + ",\"note\":\"${"文".repeat(1001)}\"}",
            body.replace("  私人内容  ", "文".repeat(101)), body.replace("  私人内容  ", "   "),
        ).forEach { mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(it)).andExpect(status().isUnprocessableEntity) }
        listOf(body, body.dropLast(1) + ",\"expected_version\":null}", body.dropLast(1) + ",\"expected_version\":1.5}")
            .forEach {
                mvc.perform(put("$path/$id").contentType(MediaType.APPLICATION_JSON).content(it)).andExpect(status().isUnprocessableEntity)
            }
        mvc.perform(get(path).param("account_id", "a")).andExpect(status().isUnprocessableEntity)
        mvc.perform(delete("$path/$id").param("account_id", "a")).andExpect(status().isUnprocessableEntity)
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `create update get delete use JWT actor and snake case with optional single time`() {
        val now = Instant.parse("2026-10-10T04:00:00Z")
        val result = CalendarPrivateItemResponse(id, "a", "如鸢", "私人内容", LocalDate.parse("2026-10-15"), "00:00", "", 0, now, now)
        every { service.create("owner", any()) } returns result
        every { service.update("owner", id, any()) } returns result.copy(version = 1)
        every { service.get("owner", "a", id) } returns result
        every { service.delete("owner", "a", id, 1) } returns true
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body.dropLast(1) + ",\"time\":\"00:00\"}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.account_id").value("a"))
            .andExpect(jsonPath("$.data.time_zone").value("Asia/Shanghai"))
            .andExpect(jsonPath("$.data.start_date").value("2026-10-15")).andExpect(jsonPath("$.data.end_date").value("2026-10-15"))
            .andExpect(jsonPath("$.data.user_id").doesNotExist()).andExpect(jsonPath("$.data.event_id").doesNotExist())
            .andExpect(jsonPath("$.data.end_time").doesNotExist()).andExpect(jsonPath("$.data.created_at").value(now.toString()))
        verify { service.create("owner", match { it.title == "私人内容" && it.time == "00:00" && it.expectedVersion == null }) }
        mvc.perform(put("$path/$id").contentType(MediaType.APPLICATION_JSON).content(body.dropLast(1) + ",\"expected_version\":0}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.version").value(1))
        mvc.perform(get("$path/$id").param("account_id", "a")).andExpect(status().isOk)
        mvc.perform(delete("$path/$id").param("account_id", "a").param("expected_version", "1")).andExpect(status().isOk)
    }

    @Test
    fun `paired range contract round trips and missing optional update fields remain distinguishable`() {
        val start = LocalDate.parse("2026-12-30")
        val end = LocalDate.parse("2027-01-02")
        val now = Instant.parse("2026-10-10T04:00:00Z")
        val result = CalendarPrivateItemResponse(id, "a", "如鸢", "私人内容", start, "09:00", "保留", 0, now, now, endDate = end)
        val range = """{"account_id":"a","title":"私人内容","start_date":"2026-12-30","end_date":"2027-01-02"}"""
        every { service.create("owner", any()) } returns result
        every { service.update("owner", id, any()) } returns result.copy(version = 1)
        every { service.get("owner", "a", id) } returns result
        every { service.list("owner", "a", start, end) } returns
            com.lhs.share.hub.controller.calendar.response.CalendarPrivateItemsResponse(listOf(result))
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(range))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.start_date").value(start.toString()))
            .andExpect(jsonPath("$.data.end_date").value(end.toString())).andExpect(jsonPath("$.data.date").value(start.toString()))
        mvc.perform(put("$path/$id").contentType(MediaType.APPLICATION_JSON).content(range.dropLast(1) + ",\"expected_version\":0}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.end_date").value(end.toString()))
        verify { service.update("owner", id, match { it.date == start && it.endDate == end && !it.timeProvided && !it.noteProvided }) }
        mvc.perform(get("$path/$id").param("account_id", "a")).andExpect(jsonPath("$.data.end_date").value(end.toString()))
        mvc.perform(get(path).param("account_id", "a").param("from", start.toString()).param("to", end.toString()))
            .andExpect(
                jsonPath("$.data.items[0].start_date").value(start.toString()),
            ).andExpect(jsonPath("$.data.items[0].end_date").value(end.toString()))
    }

    @Test
    fun `range decoder rejects partial reversed invalid leap and alias mismatch without calling service`() {
        val range = """{"account_id":"a","title":"私人内容","start_date":"2028-02-29","end_date":"2028-03-01"}"""
        listOf(
            range.replace("2028-02-29", "2026-02-29"), range.replace("2028-03-01", "2028-02-28"),
            range.replace("2028-03-01", "2028-04-31"), range.replace("2028-03-01", "0000-01-01"),
            range.replace("\"start_date\":\"2028-02-29\",", ""), range.replace(",\"end_date\":\"2028-03-01\"", ""),
            range.replace("\"2028-03-01\"", "null"), range.replace("\"2028-03-01\"", "20280301"),
            range.dropLast(1) + ",\"date\":\"2028-02-28\"}",
        ).forEach { invalid ->
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isUnprocessableEntity)
            mvc.perform(put("$path/$id").contentType(MediaType.APPLICATION_JSON).content(invalid.dropLast(1) + ",\"expected_version\":0}"))
                .andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
        val decoder = com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequestDecoder
        val decoded = decoder.decode(mapper.readTree(range), false)
        org.junit.jupiter.api.Assertions.assertEquals(LocalDate.parse("2028-02-29"), decoded.date)
        org.junit.jupiter.api.Assertions.assertEquals(LocalDate.parse("2028-03-01"), decoded.endDate)
        val alias = decoder.decode(mapper.readTree(range.dropLast(1) + ",\"date\":\"2028-02-29\"}"), false)
        org.junit.jupiter.api.Assertions.assertEquals(decoded, alias)
    }

    @Test
    fun `anonymous user rejected before every service operation and conflicts use standard envelope`() {
        every { helper.requireUserId() } throws
            org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED)
        listOf(
            get(path).param("account_id", "a").param("from", "2026-10-01").param("to", "2026-10-31"),
            get("$path/$id").param("account_id", "a"),
            post(path).content(body),
            put("$path/$id").content(body),
            delete("$path/$id").param("account_id", "a").param("expected_version", "0"),
        ).forEach { mvc.perform(it.contentType(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized) }
        verify { service wasNot io.mockk.Called }
        every { helper.requireUserId() } returns "owner"
        every { service.delete("owner", "a", id, 0) } throws
            ActivityCalendarApiException(HttpStatus.CONFLICT, "private_item_conflict", "changed")
        mvc.perform(delete("$path/$id").param("account_id", "a").param("expected_version", "0"))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("private_item_conflict"))
    }

    @Test
    fun `reminder contract validates strict types tracks omissions and returns snake case settings`() {
        listOf(
            "\"reminder_on\":\"OTHER\"", "\"reminder_on\":false", "\"reminder_on\":0",
            "\"reminder_days_before\":null", "\"reminder_days_before\":\"1\"", "\"reminder_days_before\":true",
            "\"reminder_days_before\":-1", "\"reminder_days_before\":2", "\"reminder_days_before\":1.0",
            "\"reminder_days_before\":4294967296",
        ).forEach { invalid ->
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body.dropLast(1) + ",$invalid}"))
                .andExpect(status().isUnprocessableEntity)
            mvc.perform(
                put("$path/$id").contentType(MediaType.APPLICATION_JSON).content(
                    body.dropLast(1) + ",$invalid,\"expected_version\":0}",
                ),
            )
                .andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
        val decoder = com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequestDecoder
        val omitted = decoder.decode(mapper.readTree(body), false)
        org.junit.jupiter.api.Assertions.assertFalse(omitted.reminderOnProvided)
        org.junit.jupiter.api.Assertions.assertFalse(omitted.reminderDaysBeforeProvided)
        val disabled = decoder.decode(mapper.readTree(body.dropLast(1) + ",\"reminder_on\":null}"), false)
        org.junit.jupiter.api.Assertions.assertTrue(disabled.reminderOnProvided)
        org.junit.jupiter.api.Assertions.assertNull(disabled.reminderOn)
        val now = Instant.parse("2026-10-10T04:00:00Z")
        val result = CalendarPrivateItemResponse(
            id, "a", "如鸢", "私人内容", LocalDate.parse("2026-10-15"), null, "", 0, now, now,
            reminderOn = "END", reminderDaysBefore = 1,
        )
        every { service.create("owner", any()) } returns result
        mvc.perform(
            post(path).contentType(MediaType.APPLICATION_JSON).content(
                body.dropLast(1) + ",\"reminder_on\":\"END\",\"reminder_days_before\":1}",
            ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.reminder_on").value("END"))
            .andExpect(jsonPath("$.data.reminder_days_before").value(1))
        verify {
            service.create(
                "owner",
                match {
                    it.reminderOn == "END" && it.reminderDaysBefore == 1 && it.reminderOnProvided &&
                        it.reminderDaysBeforeProvided
                },
            )
        }
    }

    @Test
    fun `recurrence contract is optional strict and occurrence deletion forwards actor account version`() {
        val now = Instant.EPOCH
        val start = LocalDate.parse("2026-10-15")
        val response = CalendarPrivateItemResponse(id, "a", "如鸢", "私人内容", start, null, "", 0, now, now, recurrence = "MONTHLY")
        every { service.create("owner", any()) } returns response
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body.dropLast(1) + ",\"recurrence\":\"MONTHLY\"}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.recurrence").value("MONTHLY"))
            .andExpect(jsonPath("$.data.series_start_date").value("2026-10-15"))
        verify { service.create("owner", match { it.recurrence == "MONTHLY" && it.recurrenceProvided }) }
        listOf("null", "true", "\"WEEKLY\"").forEach {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body.dropLast(1) + ",\"recurrence\":$it}"))
                .andExpect(status().isUnprocessableEntity)
        }
        every { service.delete("owner", "a", id, 0, start) } returns true
        mvc.perform(delete("$path/$id").param("account_id", "a").param("expected_version", "0").param("occurrence_date", "2026-10-15"))
            .andExpect(status().isOk)
        verify { service.delete("owner", "a", id, 0, start) }
        mvc.perform(delete("$path/$id").param("account_id", "a").param("expected_version", "0").param("occurrence_date", "2026-02-30"))
            .andExpect(status().isUnprocessableEntity)
    }
}
