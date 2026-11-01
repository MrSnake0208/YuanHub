package com.lhs.share.openapi

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.SpringDocConfig
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.controller.star.StarLoadoutController
import com.lhs.share.hub.controller.star.StarLoadoutPresetController
import com.lhs.share.hub.controller.star.StarStateController
import com.lhs.share.hub.service.star.StarLoadoutPresetService
import com.lhs.share.hub.service.star.StarLoadoutService
import com.lhs.share.hub.service.star.StarStateService
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

@WebMvcTest(controllers = [StarStateController::class, StarLoadoutController::class, StarLoadoutPresetController::class])
@AutoConfigureMockMvc(addFilters = false)
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SpringDocConfig::class,
    SpringDocConfiguration::class,
    SpringDocConfigProperties::class,
    SpringDocKotlinConfiguration::class,
    SpringDocWebMvcConfiguration::class,
)
@TestPropertySource(properties = ["share.info.public-base-url=https://star.example.test"])
class StarCloudOpenApiContractTest {
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
    lateinit var stateService: StarStateService

    @MockitoBean
    lateinit var loadoutService: StarLoadoutService

    @MockitoBean
    lateinit var presetService: StarLoadoutPresetService

    @MockitoBean
    lateinit var authenticationHelper: AuthenticationHelper

    @MockitoBean
    lateinit var stringRedisTemplate: StringRedisTemplate

    @MockitoBean
    lateinit var dataTransferService: DataTransferService

    @MockitoBean
    lateinit var jwtService: JwtService

    @Test
    fun `generated OpenAPI documents state rebuild restore and preset contracts`() {
        val root = objectMapper.readTree(
            mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString,
        )

        assertTrue(root.at("/paths/~1v1~1star-state~1current/patch/responses").has("409"))
        assertTrue(root.at("/paths/~1v1~1star-state~1rebuild/post/responses").has("409"))
        assertTrue(root.at("/paths/~1v1~1star-state~1recovery-points/get/responses").has("200"))
        assertTrue(root.at("/paths/~1v1~1star-state~1recovery-points~1{pointId}~1restore/post/responses").has("409"))
        assertTrue(root.at("/paths/~1v1~1star-state~1rebuild/post/responses/409/description").asText().contains("star_generation_changed"))
        assertTrue(
            root.at("/paths/~1v1~1star-state~1rebuild/post/responses/422/description").asText().contains("star_state_invalid_snapshot"),
        )
        assertTrue(root.at("/paths/~1v1~1star-loadout~1current/put/responses/409/description").asText().contains("star_generation_changed"))

        val presetResponses = root.at("/paths/~1v1~1star-loadout-presets~1current/put/responses")
        assertTrue(presetResponses.has("409"))
        assertTrue(presetResponses.has("422"))
        assertTrue(presetResponses["409"]["description"].asText().contains("star_loadout_preset_revision_conflict"))
        assertTrue(presetResponses["422"]["description"].asText().contains("star_loadout_preset_invalid_snapshot"))
    }
}
