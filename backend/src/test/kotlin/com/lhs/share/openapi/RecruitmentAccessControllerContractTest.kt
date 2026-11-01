package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.RecruitmentExceptionHandler
import com.lhs.share.hub.controller.recruitment.RecruitmentAccessController
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessGrantResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessMeResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessUserCandidateResponse
import com.lhs.share.hub.repository.entity.RecruitmentAccessMode
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class RecruitmentAccessControllerContractTest {
    private val service = mockk<RecruitmentAccessService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(RecruitmentAccessController(service, helper))
            .setControllerAdvice(RecruitmentExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
    }

    @Test
    fun userAccessStatusUsesIndependentSnakeCaseContract() {
        every { helper.requireUserId() } returns "u"
        every { service.me("u") } returns RecruitmentAccessMeResponse(RecruitmentAccessMode.LIMITED, false, false)

        mvc.perform(get("/v1/recruitment/access/me"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.access_mode").value("LIMITED"))
            .andExpect(jsonPath("$.data.granted").value(false))
            .andExpect(jsonPath("$.data.can_access").value(false))
    }

    @Test
    fun adminCanReadSwitchSearchGrantAndRevoke() {
        val grant = RecruitmentAccessGrantResponse("u", "测试用户", true, "admin", Instant.parse("2026-10-01T00:00:00Z"))
        every { helper.requireUserId() } returns "admin"
        every { service.admin("admin") } returns RecruitmentAccessAdminResponse(RecruitmentAccessMode.LIMITED, 2, listOf(grant))
        every { service.setMode("admin", RecruitmentAccessMode.PUBLIC, 2) } returns
            RecruitmentAccessAdminResponse(RecruitmentAccessMode.PUBLIC, 3, listOf(grant))
        every { service.searchCandidates("admin", "test", 1, 10) } returns
            listOf(RecruitmentAccessUserCandidateResponse("u", "测试用户", "test@example.com", true))
        every { service.grant("admin", "u") } returns grant
        every { service.revoke("admin", "u") } returns Unit

        mvc.perform(get("/v1/admin/recruitment-access"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.access_mode").value("LIMITED"))
            .andExpect(jsonPath("$.data.grants[0].user_name").value("测试用户"))
        mvc.perform(
            put("/v1/admin/recruitment-access/mode").contentType(MediaType.APPLICATION_JSON)
                .content("""{"access_mode":"PUBLIC","expected_version":2}"""),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.access_mode").value("PUBLIC"))
        mvc.perform(get("/v1/admin/recruitment-access/users").param("q", "test"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data[0].email").value("test@example.com"))
        mvc.perform(put("/v1/admin/recruitment-access/users/u"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.user_id").value("u"))
        mvc.perform(delete("/v1/admin/recruitment-access/users/u")).andExpect(status().isOk)

        verify { service.setMode("admin", RecruitmentAccessMode.PUBLIC, 2) }
        verify { service.grant("admin", "u") }
        verify { service.revoke("admin", "u") }
    }
}
