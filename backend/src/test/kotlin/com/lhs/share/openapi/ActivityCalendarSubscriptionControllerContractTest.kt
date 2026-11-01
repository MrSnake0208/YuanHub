package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.ActivityCalendarSubscriptionController
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionResponse
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class ActivityCalendarSubscriptionControllerContractTest {
    private val service = mockk<ActivityCalendarSubscriptionService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private lateinit var mvc: MockMvc
    private val path = "/v1/activity-calendar/subscriptions/recruitment:pool-one"

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "owner"
        mvc = MockMvcBuilders.standaloneSetup(ActivityCalendarSubscriptionController(service, helper))
            .setControllerAdvice(ActivityCalendarExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `completion command rejects coercion and changes only authenticated account state`() {
        listOf(
            """{"account_id":"a","expected_version":0,"completed":"true"}""",
            """{"account_id":"a","expected_version":null,"completed":false}""",
            """{"account_id":"a","expected_version":0,"completed":true,"checklist":[]}""",
            """{"account_id":"a","expected_version":0,"completed":null}""",
            """{"account_id":"a","expected_version":0,"completed":true,"user_id":"other"}""",
        ).forEach { body ->
            mvc.perform(put("$path/completion").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
        every { service.completion("owner", "recruitment:pool-one", any()) } returns
            CalendarSubscriptionResponse("recruitment:pool-one", 1, true, true, emptyList(), null, manualCompleted = true)
        mvc.perform(
            put("$path/completion").contentType(MediaType.APPLICATION_JSON)
                .content("""{"account_id":"a","expected_version":0,"completed":true}"""),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.completed").value(true))
            .andExpect(jsonPath("$.data.manual_completed").value(true))
        verify {
            service.completion("owner", "recruitment:pool-one", match { it.accountId == "a" && it.completed && it.expectedVersion == 0L })
        }
    }

    @Test
    fun `strict request rejects server identity unknown fields missing version and coercion`() {
        listOf(
            """{"account_id":"a","subscribed":true}""",
            """{"account_id":"a","expected_version":null,"subscribed":"true"}""",
            """{"account_id":"a","expected_version":-1,"subscribed":true}""",
            """{"account_id":"a","expected_version":0,"subscribed":true,"user_id":"other"}""",
        ).forEach { body ->
            mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnprocessableEntity)
        }
        listOf(
            """{"account_id":"a","expected_version":0,"completed":true,"checklist":null}""",
            """{"account_id":"a","expected_version":0,"completed":true,"checklist":[{"id":"a","title":"关卡","completed":1}]}""",
        ).forEach { body ->
            mvc.perform(
                put("$path/progress").contentType(MediaType.APPLICATION_JSON).content(body),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `colon event id and private response use authenticated owner and snake case`() {
        every { service.subscribe("owner", "recruitment:pool-one", any()) } returns
            CalendarSubscriptionResponse("recruitment:pool-one", 0, true, false, emptyList(), null)
        mvc.perform(
            put(path).contentType(MediaType.APPLICATION_JSON).content("""{"account_id":"a","expected_version":null,"subscribed":true}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.event_id").value("recruitment:pool-one"))
            .andExpect(jsonPath("$.data.version").value(0)).andExpect(jsonPath("$.data.user_id").doesNotExist())
        verify {
            service.subscribe(
                "owner",
                "recruitment:pool-one",
                match {
                    it.accountId == "a" && it.expectedVersion == null &&
                        it.subscribed
                },
            )
        }
    }

    @Test
    fun `anonymous user cannot list read subscribe or write progress`() {
        every { helper.requireUserId() } throws
            org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED)
        listOf(
            get(path).param("account_id", "a"),
            get("/v1/activity-calendar/subscriptions").param("account_id", "a"),
            get("/v1/activity-calendar/subscriptions/summary").param("account_id", "a"),
            put(path).contentType(MediaType.APPLICATION_JSON).content("{}"),
            put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{}"),
            put("$path/completion").contentType(MediaType.APPLICATION_JSON).content("{}"),
        )
            .forEach { mvc.perform(it).andExpect(status().isUnauthorized) }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `missing account query uses calendar validation envelope`() {
        listOf("/v1/activity-calendar/subscriptions", "/v1/activity-calendar/subscriptions/summary", path).forEach {
            mvc.perform(
                get(it),
            ).andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `progress accepts optional snake case memo fields and legacy omission without coercion`() {
        every { service.progress("owner", "recruitment:pool-one", any()) } returns
            CalendarSubscriptionResponse("recruitment:pool-one", 1, true, false, emptyList(), null, "本期目标", "换行\n备注")
        val base = """"account_id":"a","expected_version":0,"completed":false,"checklist":[]"""
        mvc.perform(put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.memo_title").value("本期目标"))
            .andExpect(jsonPath("$.data.memo_note").value("换行\n备注"))
        verify { service.progress("owner", "recruitment:pool-one", match { it.memoTitle == null && it.memoNote == null }) }
        mvc.perform(
            put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("""{$base,"memo_title":"本期已完成","memo_note":""}"""),
        ).andExpect(status().isOk)
        verify { service.progress("owner", "recruitment:pool-one", match { it.memoTitle == "本期已完成" && it.memoNote == "" }) }
    }

    @Test
    fun `memo decoder rejects null blank title wrong types and overlong fields before service`() {
        val base = """"account_id":"a","expected_version":0,"completed":false,"checklist":[]"""
        listOf(
            """"memo_title":null""", """"memo_title":""""", """"memo_title":"   """", """"memo_title":42""",
            """"memo_title":"${"字".repeat(61)}"""", """"memo_note":null""", """"memo_note":[]""", """"memo_note":false""",
            """"memo_note":"${"字".repeat(1001)}"""", """"memoTitle":"wrong case"""",
        ).forEach { field ->
            mvc.perform(put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base,$field}"))
                .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `manual completion accepts both booleans independently and rejects null and coercion`() {
        val base = "\"account_id\":\"a\",\"expected_version\":0,\"completed\":true," +
            "\"checklist\":[{\"id\":\"old\",\"title\":\"待办\",\"completed\":false}]"
        listOf(true, false).forEach { manual ->
            every { service.progress("owner", "recruitment:pool-one", any()) } returns
                CalendarSubscriptionResponse("recruitment:pool-one", 1, true, manual, emptyList(), null, manualCompleted = manual)
            mvc.perform(
                put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base,\"manual_completed\":$manual}"),
            ).andExpect(status().isOk).andExpect(jsonPath("$.data.completed").value(manual))
                .andExpect(jsonPath("$.data.manual_completed").value(manual))
            verify {
                service.progress(
                    "owner",
                    "recruitment:pool-one",
                    match {
                        it.manualCompleted == manual &&
                            it.checklist.single().id == "old"
                    },
                )
            }
        }
        listOf("null", "\"false\"", "0", "{}", "[]").forEach { invalid ->
            mvc.perform(
                put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base,\"manual_completed\":$invalid}"),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 2) { service.progress(any(), any(), any()) }
    }

    @Test
    fun `checklist mode accepts only checklist writes and rejects conflicting or unknown protocol`() {
        val base = "\"account_id\":\"a\",\"expected_version\":0,\"completed\":false,\"checklist\":[]"
        every { service.progress("owner", "recruitment:pool-one", any()) } returns
            CalendarSubscriptionResponse("recruitment:pool-one", 1, true, false, emptyList(), null, legacyCompleted = true)
        mvc.perform(
            put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base,\"progress_mode\":\"checklist\"}"),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.legacy_completed").value(true))
        verify { service.progress("owner", "recruitment:pool-one", match { it.progressMode == "checklist" && it.memoNote == null }) }
        listOf(
            "\"progress_mode\":null",
            "\"progress_mode\":true",
            "\"progress_mode\":\"other\"",
            "\"progress_mode\":\"checklist\",\"memo_note\":\"\"",
            "\"progress_mode\":\"checklist\",\"manual_completed\":false",
            "\"progress_mode\":\"checklist\",\"memo_title\":\"标题\"",
        ).forEach { fields ->
            mvc.perform(put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$base,$fields}"))
                .andExpect(status().isUnprocessableEntity)
        }
        val complete = base.replace("\"completed\":false", "\"completed\":true")
        mvc.perform(
            put("$path/progress").contentType(MediaType.APPLICATION_JSON).content("{$complete,\"progress_mode\":\"checklist\"}"),
        ).andExpect(status().isUnprocessableEntity)
        verify(exactly = 1) { service.progress(any(), any(), any()) }
    }
}
