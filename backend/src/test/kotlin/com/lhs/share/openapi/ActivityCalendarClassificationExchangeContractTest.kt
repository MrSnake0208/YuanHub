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
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.calendar.ActivityCalendarClassificationExchangeService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarClassificationExchangeContractTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val recruitment = mockk<RecruitmentCatalogRepository>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val calendar = ActivityCalendarService(repository, recruitment)
    private val exchange =
        ActivityCalendarClassificationExchangeService(calendar, repository, mapper, TransactionTemplate(mockk(relaxed = true)))
    private val mvc = MockMvcBuilders.standaloneSetup(
        AdminActivityCalendarController(calendar, helper, authorization, mapper, mockk(), exchange),
    )
        .setControllerAdvice(ActivityCalendarExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/v1/admin/activity-calendar"
    private val event =
        ActivityCalendarEvent(
            "evt_fixture", "如鸢", "历史停用", ActivityCalendarCategory.LOGIN,
            LocalDate.parse(
                "2026-01-01",
            ),
            enabled = false,
            createdBy = "creator",
            createdAt = Instant.EPOCH,
            updatedBy = "creator",
            updatedAt = Instant.EPOCH,
            version = 0,
        )

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "editor"
        every { authorization.hasPermission(any(), any()) } returns true
        every { repository.list(null, null, null, emptySet(), null) } returns listOf(event)
        every { recruitment.all() } returns emptyList()
        every { repository.findAll(any()) } answers { if (event.id in firstArg<Collection<String>>()) listOf(event) else emptyList() }
    }

    @Test
    fun `export and unchanged preview preserve historical fields without writes`() {
        val result = mvc.perform(get("$path/export")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.classification_options.常驻[3]").value("历练/洞窟"))
            .andExpect(jsonPath("$.data.classification_options.其他[0]").value("其他"))
            .andExpect(jsonPath("$.data.document_type").value("activity-calendar-classification"))
            .andExpect(jsonPath("$.data.items[0].expected_version").value(0))
            .andExpect(jsonPath("$.data.items[0].original.enabled").value(false))
            .andExpect(jsonPath("$.data.items[0].classification.level2").value("签到/查岗")).andReturn()
        val document = mapper.readTree(result.response.contentAsString)["data"]
        mvc.perform(
            post("$path/classification-import/preview").contentType(MediaType.APPLICATION_JSON).content(
                mapper.writeValueAsString(
                    mapOf(
                        "json" to document.toString(),
                    ),
                ),
            ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.ready").value(0)).andExpect(jsonPath("$.data.unchanged").value(1))
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { repository.insert(any()) }
    }

    @Test
    fun `every endpoint requires authentication and editor permission before reading or writing`() {
        every { authorization.hasPermission(any(), any()) } returns false
        mvc.perform(get("$path/export")).andExpect(status().isForbidden)
        for (operation in listOf("preview", "commit")) {
            mvc.perform(post("$path/classification-import/$operation").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden)
        }
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("$path/export")).andExpect(status().isUnauthorized)
        for (operation in listOf("preview", "commit")) {
            mvc.perform(post("$path/classification-import/$operation").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized)
        }
        verify(exactly = 0) { repository.findAll(any()) }
        verify(exactly = 0) { repository.list(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
    }

    @Test
    fun `new import rejects legacy documents duplicate keys and malformed envelopes`() {
        for (json in listOf(
            "[]",
            "{\"schema_version\":1,\"items\":[]}",
            "{\"document_type\":\"activity-calendar-classification\",\"schema_version\":1,\"schema_version\":1}",
        )) {
            mvc.perform(
                post("$path/classification-import/preview").contentType(MediaType.APPLICATION_JSON).content(
                    mapper.writeValueAsString(
                        mapOf(
                            "json" to json,
                        ),
                    ),
                ),
            )
                .andExpect(status().isUnprocessableEntity)
        }
        mvc.perform(
            post(
                "$path/classification-import/preview",
            ).contentType(MediaType.APPLICATION_JSON).content("{\"json\":{},\"unexpected\":true}"),
        )
            .andExpect(status().isUnprocessableEntity)
    }
}
