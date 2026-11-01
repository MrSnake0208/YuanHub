package com.lhs.share.openapi

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.SpringDocConfig
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.controller.changelog.AdminChangelogController
import com.lhs.share.hub.controller.changelog.ChangelogController
import com.lhs.share.hub.service.changelog.ChangelogService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springdoc.core.configuration.SpringDocConfiguration
import org.springdoc.core.configuration.SpringDocKotlinConfiguration
import org.springdoc.core.properties.SpringDocConfigProperties
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@WebMvcTest(controllers = [ChangelogController::class, AdminChangelogController::class])
@AutoConfigureMockMvc(addFilters = false)
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SpringDocConfig::class,
    SpringDocConfiguration::class,
    SpringDocConfigProperties::class,
    SpringDocKotlinConfiguration::class,
    SpringDocWebMvcConfiguration::class,
)
@TestPropertySource(properties = ["share.info.public-base-url=https://changelog.example.test"])
class ChangelogOpenApiContractTest {
    @MockitoBean
    lateinit var authorization: com.lhs.share.hub.service.admin.AdminAuthorizationService

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @MockitoBean
    lateinit var recruitmentAccessService: com.lhs.share.hub.service.recruitment.RecruitmentAccessService

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @MockitoBean
    lateinit var service: ChangelogService

    @MockitoBean
    lateinit var authenticationHelper: AuthenticationHelper

    @MockitoBean
    lateinit var stringRedisTemplate: StringRedisTemplate

    @MockitoBean
    lateinit var dataTransferService: DataTransferService

    @MockitoBean
    lateinit var jwtService: JwtService

    @Test
    fun `generated OpenAPI publishes changelog paths and snake case request fields`() {
        val response = mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val root = objectMapper.readTree(response)

        listOf(
            "/v1/changelog",
            "/v1/admin/changelog",
            "/v1/admin/changelog/{id}/draft",
            "/v1/admin/changelog/{id}/submit",
            "/v1/admin/changelog/{id}/approve",
            "/v1/admin/changelog/{id}/reject",
            "/v1/admin/changelog/{id}/withdraw",
        ).forEach { assertTrue(root["paths"].has(it)) }
        assertTrue(root.at("/components/schemas/ChangelogCreateRequest/properties").has("version_label"))
        assertTrue(root.at("/components/schemas/ChangelogDraftRequest/properties").has("expected_version"))
        assertTrue(root.at("/components/schemas/ChangelogRejectRequest/properties").has("expected_version"))
    }
}
