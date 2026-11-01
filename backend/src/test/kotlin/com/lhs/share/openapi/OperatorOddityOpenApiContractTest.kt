package com.lhs.share.openapi

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.SpringDocConfig
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.controller.operator.OperatorController
import com.lhs.share.hub.service.operator.OperatorService
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

@WebMvcTest(controllers = [OperatorController::class])
@AutoConfigureMockMvc(addFilters = false)
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SpringDocConfig::class,
    SpringDocConfiguration::class,
    SpringDocConfigProperties::class,
    SpringDocKotlinConfiguration::class,
    SpringDocWebMvcConfiguration::class,
)
@TestPropertySource(properties = ["share.info.public-base-url=https://operator.example.test"])
class OperatorOddityOpenApiContractTest {
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
    lateinit var service: OperatorService

    @MockitoBean
    lateinit var catalogService: com.lhs.share.hub.service.operator.OperatorCatalogService

    @MockitoBean
    lateinit var authenticationHelper: AuthenticationHelper

    @MockitoBean
    lateinit var stringRedisTemplate: StringRedisTemplate

    @MockitoBean
    lateinit var dataTransferService: DataTransferService

    @MockitoBean
    lateinit var jwtService: JwtService

    @Test
    fun `generated operator OpenAPI describes keyed numeric precision`() {
        val response = mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk).andReturn().response.contentAsString
        val root = objectMapper.readTree(response)
        val current = root.at("/components/schemas/OperatorOddityPatchRequest/properties/current")
        org.junit.jupiter.api.Assertions.assertEquals("number", current.path("type").asText())
        assertTrue(current.path("description").asText().contains("attack/hp"))
        assertTrue(current.path("description").asText().contains("special"))
        assertTrue(root.path("paths").path("/v1/operator/current/{operatorId}").has("patch"))
    }
}
