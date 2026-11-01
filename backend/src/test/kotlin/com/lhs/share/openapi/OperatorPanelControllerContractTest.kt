package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorPanelController
import com.lhs.share.hub.controller.operator.response.OperatorPanelResponse
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorPanelService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorPanelControllerContractTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val panels = mockk<OperatorPanelService>()
    private val helper = mockk<AuthenticationHelper>().also { every { it.requireUserId() } returns "jwt-owner" }
    private val mvc = MockMvcBuilders.standaloneSetup(OperatorPanelController(panels, helper))
        .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()

    @Test fun `preview and batch bind JWT owner and expose only final snake case result fields`() {
        val response = OperatorPanelResponse("calculated", 123, 456, ruleVersion = "synthetic")
        every { panels.preview("jwt-owner", any()) } returns response
        every { panels.current("jwt-owner", any()) } returns mapOf("op" to response)
        val result = mvc.perform(post("/v1/operator/panel/preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.rule_version").value("synthetic")).andReturn()
        assertEquals(
            setOf("status", "attack", "hp", "missing_fields", "reason", "rule_version"),
            mapper.readTree(result.response.contentAsString).path("data").fieldNames().asSequence().toSet(),
        )
        mvc.perform(post("/v1/operator/panel/current").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.op.attack").value(123))
        verify {
            panels.preview("jwt-owner", any())
            panels.current("jwt-owner", any())
        }
        for (name in listOf("preview", "current")) {
            assertNotNull(OperatorPanelController::class.java.methods.single { it.name == name }.getAnnotation(AccessLimit::class.java))
        }
    }

    @Test fun `invalid input uses operator error envelope`() {
        every { panels.preview("jwt-owner", any()) } throws
            OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "panel_invalid_input", "Invalid panel input", fieldPath = "level")
        mvc.perform(post("/v1/operator/panel/preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("panel_invalid_input"))
    }
}
