package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorRelationshipController
import com.lhs.share.hub.service.operator.OperatorRelationshipService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorRelationshipControllerTest {
    @Test
    fun `private routes use authenticated owner and return snake case without caching`() {
        val service = mockk<OperatorRelationshipService>()
        val helper = mockk<AuthenticationHelper>()
        every { helper.requireUserId() } returns "owner"
        val result = mapOf<String, Any>("account_id" to "a", "revision" to 1L)
        every { service.get("owner", "a") } returns result
        every { service.patch("owner", "a", any()) } returns result
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val mvc = MockMvcBuilders.standaloneSetup(OperatorRelationshipController(service, helper))
            .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        mvc.perform(get("/v1/operator/relationships").param("account_id", "a").param("game", "如鸢").param("user_id", "attacker"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("a"))
        mvc.perform(
            patch("/v1/operator/relationships").param("account_id", "a").param("game", "如鸢")
                .contentType(
                    MediaType.APPLICATION_JSON,
                ).content("""{"expected_revision":0,"catalog_version":"test","entries":{"op":{"trust":0}}}"""),
        )
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
        verify(exactly = 1) { service.get("owner", "a") }
        verify(exactly = 1) { service.patch("owner", "a", match { it.path("entries").path("op").path("trust").asInt() == 0 }) }
    }
}
