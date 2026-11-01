package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.StarLoadoutController
import com.lhs.share.hub.controller.star.StarStateController
import com.lhs.share.hub.controller.star.response.StarLoadoutCurrentResponse
import com.lhs.share.hub.controller.star.response.StarStateCommandResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarLoadoutService
import com.lhs.share.hub.service.star.StarStateService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean

class StarCloudControllerContractTest {
    private val states = mockk<StarStateService>()
    private val loadouts = mockk<StarLoadoutService>()
    private val helper = mockk<AuthenticationHelper>()
    private val state = StarStateCurrentResponse.empty("acc_a")
    private val loadout = StarLoadoutCurrentResponse.empty("acc_a")
    private val command = StarStateCommandResponse(state, loadout, null)
    private val mvc = MockMvcBuilders.standaloneSetup(StarStateController(states, helper), StarLoadoutController(loadouts, helper))
        .setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(
            jacksonObjectMapper().registerModule(JavaTimeModule())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE),
        ))
        .setValidator(LocalValidatorFactoryBean().apply { afterPropertiesSet() })
        .build()

    @BeforeEach fun setUp() { every { helper.requireUserId() } returns "jwt-user" }

    @Test
    fun `state GET PATCH rebuild and restore use one account scoped generation contract`() {
        every { states.current("jwt-user", "acc_a") } returns state
        every { states.patch("jwt-user", "acc_a", any()) } returns command
        every { states.rebuild("jwt-user", "acc_a", any()) } returns command
        every { states.restore("jwt-user", "acc_a", "point_1", any()) } returns command
        every { states.recoveryPoints("jwt-user", "acc_a") } returns emptyList()
        mvc.perform(get("/v1/star-state/current").param("account_id", "acc_a"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.generation").value(0))
        mvc.perform(patch("/v1/star-state/current").param("account_id", "acc_a")
            .contentType(MediaType.APPLICATION_JSON).content(snapshotBody()))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.state.account_id").value("acc_a"))
        mvc.perform(post("/v1/star-state/rebuild").param("account_id", "acc_a")
            .contentType(MediaType.APPLICATION_JSON).content(snapshotBody("pre_ocr_rebuild")))
            .andExpect(status().isOk)
        mvc.perform(get("/v1/star-state/recovery-points").param("account_id", "acc_a"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data").isEmpty)
        mvc.perform(post("/v1/star-state/recovery-points/point_1/restore").param("account_id", "acc_a")
            .contentType(MediaType.APPLICATION_JSON).content("""{"expected_generation":0,"expected_revision":0}"""))
            .andExpect(status().isOk)
        verify { states.rebuild("jwt-user", "acc_a", match { it.expectedGeneration == 0L && it.reason == "pre_ocr_rebuild" }) }
    }

    @Test
    fun `loadout PUT carries the generation fence`() {
        every { loadouts.putCurrent("jwt-user", "acc_a", any()) } returns loadout
        mvc.perform(put("/v1/star-loadout/current").param("account_id", "acc_a")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"expected_generation":3,"expected_revision":0,"loadouts":{}}"""))
            .andExpect(status().isOk)
        verify { loadouts.putCurrent("jwt-user", "acc_a", match { it.expectedGeneration == 3L }) }
    }

    @Test
    fun `generation conflicts keep their stable code`() {
        every { states.rebuild("jwt-user", "acc_a", any()) } throws InventoryApiException(
            HttpStatus.CONFLICT, "star_generation_changed", "reload",
        )
        mvc.perform(post("/v1/star-state/rebuild").param("account_id", "acc_a")
            .contentType(MediaType.APPLICATION_JSON).content(snapshotBody("pre_ocr_rebuild")))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("star_generation_changed"))
    }

    private fun snapshotBody(reason: String? = null) = """{"expected_generation":0,"expected_revision":0,"inventory":[],"plan_targets":{},"experience":{"orange":null,"purple":null,"white":null},"bag":{"current_count":null,"capacity":null}${reason?.let { ",\"reason\":\"$it\"" } ?: ""}}"""
}
