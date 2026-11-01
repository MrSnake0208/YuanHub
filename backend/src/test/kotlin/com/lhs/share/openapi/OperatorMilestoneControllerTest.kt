package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorMilestoneController
import com.lhs.share.hub.controller.operator.response.OperatorMilestoneItem
import com.lhs.share.hub.controller.operator.response.OperatorMilestoneResponse
import com.lhs.share.hub.service.operator.OperatorMilestoneService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorMilestoneControllerTest {
    @Test
    fun `private routes use authenticated owner and return snake case without caching`() {
        val service = mockk<OperatorMilestoneService>()
        val helper = mockk<AuthenticationHelper>()
        every { helper.requireUserId() } returns "owner"
        val result = OperatorMilestoneResponse("a", "如鸢", "op", 1, listOf(OperatorMilestoneItem("star_1", "2026-01-01", null)))
        every { service.get("owner", "a", "如鸢", "op") } returns result
        every { service.put("owner", "a", "如鸢", "op", any()) } returns result
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val mvc = MockMvcBuilders.standaloneSetup(OperatorMilestoneController(service, helper))
            .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        mvc.perform(get("/v1/operator/op/milestones").param("account_id", "a").param("game", "如鸢").param("user_id", "attacker"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("a")).andExpect(jsonPath("$.data.milestones[0].date").value("2026-01-01"))
        mvc.perform(
            put("/v1/operator/op/milestones").param("account_id", "a").param("game", "如鸢")
                .contentType(MediaType.APPLICATION_JSON).content("""{"expected_revision":0,"dates":{"star_1":"2026-01-01"}}"""),
        )
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
        verify(exactly = 1) { service.get("owner", "a", "如鸢", "op") }
        verify(exactly = 1) { service.put("owner", "a", "如鸢", "op", match { it.path("dates").path("star_1").asText() == "2026-01-01" }) }
    }
}
