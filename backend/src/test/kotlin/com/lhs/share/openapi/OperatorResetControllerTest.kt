package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorResetController
import com.lhs.share.hub.controller.operator.response.OperatorResetHistoryResponse
import com.lhs.share.hub.service.operator.OperatorResetService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorResetControllerTest {
    private val service = mockk<OperatorResetService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(
        OperatorResetController(service, helper),
    ).setControllerAdvice(OperatorExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()

    @Test
    fun `private history uses authenticated owner and no store`() {
        assertTrue(OperatorResetController::class.java.isAnnotationPresent(RequireJwt::class.java))
        every { helper.requireUserId() } returns "owner"
        every { service.history("owner", "a", "如鸢", "op", null) } returns OperatorResetHistoryResponse(emptyList(), null)
        mvc.perform(
            get("/v1/operator/resets").param("account_id", "a").param("game", "如鸢").param("operator_id", "op").param("user_id", "stranger"),
        )
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
        verify(exactly = 1) { service.history("owner", "a", "如鸢", "op", null) }
    }

    @Test
    fun `fractional string oversized and foreign fields are rejected before service mutations`() {
        val prefix = "\"account_id\":\"a\",\"game\":\"如鸢\",\"operator_id\":\"op\""
        listOf(
            "{$prefix,\"refunds\":{\"jianjia\":1.5}}",
            "{$prefix,\"refunds\":{\"jianjia\":\"1\"}}",
            "{$prefix,\"refunds\":{\"jianjia\":99999999999999999999999999}}",
            "{$prefix,\"level_breakthrough_stage\":3.1}",
            "{$prefix,\"user_id\":\"stranger\"}",
            "{$prefix,\"extra\":true}",
        ).forEach { body ->
            mvc.perform(
                post("/v1/operator/resets/preview").contentType(MediaType.APPLICATION_JSON).content(body),
            ).andExpect(status().isUnprocessableEntity)
        }
        mvc.perform(
            post("/v1/operator/resets/execute").header("Idempotency-Key", "key").contentType(MediaType.APPLICATION_JSON)
                .content("{\"account_id\":\"a\",\"game\":\"如鸢\",\"preview_token\":\"p\",\"confirmed_game_preview\":\"true\"}"),
        )
            .andExpect(status().isUnprocessableEntity)
        verify(exactly = 0) { service.preview(any(), any()) }
        verify(exactly = 0) { service.execute(any(), any(), any()) }
    }
}
