package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.AdminActivityCalendarController
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.calendar.ActivityCalendarImportService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException

class ActivityCalendarImportContractTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val service = ActivityCalendarService(repository, mockk<RecruitmentCatalogRepository>())
    private val importer = ActivityCalendarImportService(service, repository, mapper)
    private lateinit var mvc: MockMvc
    private val path = "/v1/admin/activity-calendar/import"
    private val json = """
        {"schema_version":1,"items":[{"game":"如鸢","title":"活动","category":"SHOP",
        "start_date":"2026-10-10","end_date":"2026-10-20"}]}
    """.trimIndent()
    private fun body(source: String = json, token: String? = null) = mapper.writeValueAsString(
        if (token == null) mapOf("json" to source) else mapOf("json" to source, "preview_token" to token),
    )

    @BeforeEach
    fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(AdminActivityCalendarController(service, helper, authorization, mapper, importer, mockk()))
            .setControllerAdvice(
                ActivityCalendarExceptionHandler(),
            ).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "editor"
        every { authorization.hasPermission("editor", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns true
        every { repository.list(null, null, null, emptySet(), null) } returns emptyList()
        every { repository.insert(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
    }

    @Test
    fun `preview is read only snake case report and commit requires corresponding fresh token`() {
        val response = mvc.perform(post("$path/preview").contentType(MediaType.APPLICATION_JSON).content(body()))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.total").value(1)).andExpect(jsonPath("$.data.ready").value(1))
            .andExpect(jsonPath("$.data.public_count").value(1)).andExpect(jsonPath("$.data.rows[0].row").value(1))
            .andExpect(jsonPath("$.data.rows[0].data.time_zone").value("Asia/Shanghai")).andReturn()
        verify(exactly = 0) {
            repository.save(any())
            repository.insert(any())
        }
        mvc.perform(post("$path/commit").contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isConflict)
        val token = mapper.readTree(response.response.contentAsString)["data"]["preview_token"].asText()
        mvc.perform(post("$path/commit").contentType(MediaType.APPLICATION_JSON).content(body(token = token)))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.created").value(1))
            .andExpect(jsonPath("$.data.rows[0].status").value("CREATED")).andExpect(jsonPath("$.data.failed").value(0))
    }

    @Test
    fun `both endpoints reject anonymous and unauthorized callers before reading source`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        for (operation in listOf("preview", "commit")) {
            mvc.perform(post("$path/$operation").contentType(MediaType.APPLICATION_JSON).content("broken"))
                .andExpect(status().isUnauthorized)
        }
        every { helper.requireUserId() } returns "editor"
        every { authorization.hasPermission("editor", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns false
        for (operation in listOf("preview", "commit")) {
            mvc.perform(post("$path/$operation").contentType(MediaType.APPLICATION_JSON).content("broken"))
                .andExpect(status().isForbidden)
        }
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `malformed oversized encoded source and row errors are explicit and cannot commit`() {
        for (source in listOf("{", "[]", " ".repeat(1024 * 1024 + 1))) {
            for (operation in listOf("preview", "commit")) {
                mvc.perform(post("$path/$operation").contentType(MediaType.APPLICATION_JSON).content(body(source)))
                    .andExpect(status().isUnprocessableEntity)
            }
        }
        val bad = json.replace("\"SHOP\"", "\"RECRUITMENT\"")
        mvc.perform(post("$path/preview").contentType(MediaType.APPLICATION_JSON).content(body(bad)))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.invalid").value(1))
            .andExpect(jsonPath("$.data.rows[0].issues[0].field").value("category"))
        mvc.perform(
            post("$path/commit").contentType(MediaType.APPLICATION_JSON).content(body(bad)),
        ).andExpect(status().isUnprocessableEntity)
        mvc.perform(post("$path/preview").contentType(MediaType.APPLICATION_JSON).content(byteArrayOf(0xff.toByte())))
            .andExpect(status().isUnprocessableEntity)
        verify(exactly = 0) {
            repository.insert(any())
            repository.save(any())
        }
    }
}
