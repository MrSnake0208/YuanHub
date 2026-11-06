package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.StarPlanInheritanceController
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarInventorySyncService
import com.lhs.share.hub.service.star.StarPlanInheritanceResolutionResponse
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class StarPlanInheritanceControllerContractTest {
    private val service = mockk<StarInventorySyncService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(StarPlanInheritanceController(service, helper))
        .setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val base = "/v1/star-state/plan-inheritance"

    private fun body(confirm: Boolean) = mapper.writeValueAsString(
        mapOf(
            "operation_id" to "11111111-1111-4111-8111-111111111111",
            "source_recovery_point_id" to "point",
            "expected_generation" to 2,
            "expected_revision" to 7,
        ) + if (confirm) mapOf("plan_targets" to mapOf("new.1" to 60)) else emptyMap(),
    )

    @Test fun routes_use_the_authenticated_user_and_selected_account() {
        every { helper.requireUserId() } returns "owner"
        every { service.inheritanceSource("owner", "a") } returns null
        for (action in listOf("confirm", "discard")) {
            every { service.resolveInheritance("owner", "a", action, any()) } returns
                StarPlanInheritanceResolutionResponse("op", "point", 2, 8, action)
            mvc.perform(post("$base/$action?account_id=a").contentType(MediaType.APPLICATION_JSON).content(body(action == "confirm")))
                .andExpect(status().isOk)
            verify(exactly = 1) { service.resolveInheritance("owner", "a", action, any()) }
        }
        mvc.perform(get("$base/pending?account_id=a")).andExpect(status().isOk)
    }

    @Test fun body_cannot_override_account_or_user() {
        every { helper.requireUserId() } returns "owner"
        val foreign = mapper.readTree(body(true)) as com.fasterxml.jackson.databind.node.ObjectNode
        foreign.put("user_id", "other")
        mvc.perform(post("$base/confirm?account_id=a").contentType(MediaType.APPLICATION_JSON).content(foreign.toString()))
            .andExpect(status().isUnprocessableEntity)
        verify(exactly = 0) { service.resolveInheritance(any(), any(), any(), any()) }
    }

    @Test fun conflicts_remain_explicit_and_do_not_turn_into_success() {
        every { helper.requireUserId() } returns "owner"
        every { service.resolveInheritance("owner", "a", "confirm", any()) } throws
            InventoryApiException(HttpStatus.CONFLICT, "star_generation_changed", "changed")
        mvc.perform(post("$base/confirm?account_id=a").contentType(MediaType.APPLICATION_JSON).content(body(true)))
            .andExpect(status().isConflict)
    }
}
