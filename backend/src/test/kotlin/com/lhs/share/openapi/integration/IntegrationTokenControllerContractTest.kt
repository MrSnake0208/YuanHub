package com.lhs.share.openapi.integration

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.IntegrationExceptionHandler
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import java.time.Instant

class IntegrationTokenControllerContractTest {
    private val service = mockk<IntegrationTokenService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val validator = LocalValidatorFactoryBean().apply { afterPropertiesSet() }
        mvc = MockMvcBuilders.standaloneSetup(IntegrationTokenController(service, helper))
            .setControllerAdvice(IntegrationExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .setValidator(validator)
            .build()
    }

    @Test
    fun `create binds token ownership to authenticated user instead of request data`() {
        every { helper.requireUserId() } returns "admin"
        every {
            service.create(
                ownerUserId = "admin",
                name = "WebCodex",
                scopes = listOf("feedback:read", "feedback:analysis:write"),
                feedbackAreas = setOf("UI"),
                expiresAt = null,
            )
        } returns IntegrationTokenCreatedResponse(
            tokenId = "int_1",
            token = "yhi_once",
            name = "WebCodex",
            scopes = setOf("feedback:read", "feedback:analysis:write"),
            feedbackAreas = setOf("UI"),
            createdAt = Instant.parse("2026-10-02T00:00:00Z"),
            expiresAt = null,
        )

        mvc.perform(
            post("/user/integration-tokens")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {
                      "name": "WebCodex",
                      "scopes": ["feedback:read", "feedback:analysis:write"],
                      "feedback_areas": ["UI"]
                    }
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.token_id").value("int_1"))
            .andExpect(jsonPath("$.data.token").value("yhi_once"))

        verify(exactly = 1) { helper.requireUserId() }
    }

    @Test
    fun `list and revoke stay owner scoped`() {
        every { helper.requireUserId() } returns "admin"
        every { service.list("admin") } returns emptyList()
        every { service.revoke("admin", "int_1") } returns IntegrationTokenListItemResponse(
            tokenId = "int_1",
            name = "WebCodex",
            scopes = setOf("feedback:read"),
            feedbackAreas = setOf("UI"),
            enabled = false,
            createdAt = Instant.parse("2026-10-02T00:00:00Z"),
            expiresAt = null,
            lastUsedAt = null,
            revokedAt = Instant.parse("2026-10-02T01:00:00Z"),
        )

        mvc.perform(get("/user/integration-tokens")).andExpect(status().isOk)
        mvc.perform(delete("/user/integration-tokens/int_1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.enabled").value(false))

        verify(exactly = 2) { helper.requireUserId() }
        verify(exactly = 1) { service.list("admin") }
        verify(exactly = 1) { service.revoke("admin", "int_1") }
    }
}
