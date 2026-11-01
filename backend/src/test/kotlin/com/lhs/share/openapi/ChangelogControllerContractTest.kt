package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ChangelogExceptionHandler
import com.lhs.share.hub.controller.changelog.AdminChangelogController
import com.lhs.share.hub.controller.changelog.ChangelogController
import com.lhs.share.hub.controller.changelog.response.ChangelogAdminResponse
import com.lhs.share.hub.controller.changelog.response.ChangelogPublicResponse
import com.lhs.share.hub.repository.entity.ChangelogEntry
import com.lhs.share.hub.repository.entity.ChangelogRevisionState
import com.lhs.share.hub.repository.entity.ChangelogWorkingRevision
import com.lhs.share.hub.service.changelog.ChangelogApiException
import com.lhs.share.hub.service.changelog.ChangelogService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class ChangelogControllerContractTest {
    private val service = mockk<ChangelogService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        mockMvc = MockMvcBuilders
            .standaloneSetup(ChangelogController(service), AdminChangelogController(service, helper))
            .setControllerAdvice(ChangelogExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
    }

    @Test
    fun `public response exposes only the published projection`() {
        every { service.publicEntries(1, 10) } returns PagedDTO(
            false,
            1,
            1,
            listOf(ChangelogPublicResponse("chg_1", 2, "新版", "2.0", body, Instant.EPOCH)),
        )

        mockMvc.perform(get("/v1/changelog"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.data[0].version_label").value("2.0"))
            .andExpect(jsonPath("$.data.data[0].published_at").value("1970-01-01T00:00:00Z"))
            .andExpect(jsonPath("$.data.data[0].working_revision").doesNotExist())
            .andExpect(jsonPath("$.data.data[0].authored_by").doesNotExist())
            .andExpect(jsonPath("$.data.data[0].rejection_reason").doesNotExist())
    }

    @Test
    fun `admin transition accepts the snake case concurrency token`() {
        every { helper.requireUserId() } returns "editor"
        every { service.submit("editor", "chg_1", 3) } returns adminResponse()

        mockMvc.perform(
            post("/v1/admin/changelog/chg_1/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":3}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.version").value(3))
            .andExpect(jsonPath("$.data.working_revision.state").value("IN_REVIEW"))

        verify { service.submit("editor", "chg_1", 3) }
    }

    @Test
    fun `domain conflict preserves the http status and stable code`() {
        every { helper.requireUserId() } returns "reviewer"
        every { service.approve("reviewer", "chg_1", 3) } throws ChangelogApiException(
            HttpStatus.CONFLICT,
            "version_conflict",
            "内容已被其他人修改",
        )

        mockMvc.perform(
            post("/v1/admin/changelog/chg_1/approve")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":3}"""),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("version_conflict"))
    }

    private fun adminResponse(): ChangelogAdminResponse = ChangelogAdminResponse.of(
        ChangelogEntry(
            id = "chg_1",
            createdBy = "editor",
            createdAt = Instant.EPOCH,
            updatedBy = "editor",
            updatedAt = Instant.EPOCH,
            workingRevision = ChangelogWorkingRevision(
                revision = 2,
                state = ChangelogRevisionState.IN_REVIEW,
                title = "新版",
                versionLabel = "2.0",
                body = body,
                mediaIds = emptySet(),
                authoredBy = "editor",
                updatedBy = "editor",
                updatedAt = Instant.EPOCH,
                submittedBy = "editor",
                submittedAt = Instant.EPOCH,
            ),
            version = 3,
        ),
    )

    private companion object {
        val body = mapOf<String, Any?>("type" to "doc", "content" to listOf(mapOf("type" to "paragraph")))
    }
}
