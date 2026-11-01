package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.StarCompletionController
import com.lhs.share.hub.controller.star.request.StarCompletionRequest
import com.lhs.share.hub.controller.star.response.StarCompletionContextResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarCompletionService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class StarCompletionControllerContractTest {
    private val service = mockk<StarCompletionService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(StarCompletionController(service, helper))
        .setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val body = """
        {"account_id":"a","game":"如鸢","operation_id":"op","expected_generation":2,"expected_star_revision":3,"expected_inventory_revision":7,
         "stars":[{"instance_id":"s1","current_level":40,"target_level":50}],
         "experience_consumed":{"orange":1,"purple":0,"white":0},"bottles_consumed":{"jiezhuping":0,"jiezheping":50,"jieyangping":20}}
    """.trimIndent()

    @Test fun `command uses authenticated user and snake case contract`() {
        every { helper.requireUserId() } returns "authenticated"
        every { service.complete("authenticated", any()) } throws
            InventoryApiException(HttpStatus.CONFLICT, "inventory_state_stale", "stale")
        mvc.perform(post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("inventory_state_stale"))
        verify(exactly = 1) { service.complete("authenticated", match { it.operationId == "op" && it.expectedInventoryRevision == 7L }) }
    }

    @Test fun `null missing fractional string and overflowing quantities never reach the service`() {
        for (invalid in listOf(
            body.replace("\"orange\":1", "\"orange\":null"),
            body.replace("\"orange\":1,", ""),
            body.replace("\"orange\":1", "\"orange\":0.5"),
            body.replace("\"orange\":1", "\"orange\":\"1\""),
            body.replace("\"orange\":1", "\"orange\":2147483648"),
            body.replace("\"jiezheping\":50", "\"jiezheping\":50.1"),
            body.replace("\"game\":\"如鸢\",", ""),
            body.replace("\"target_level\":50", "\"target_level\":50,\"start_already_broken\":{}"),
        )) {
            mvc.perform(post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("star_completion_invalid_request"))
        }
        verify(exactly = 0) { service.complete(any(), any()) }
    }

    @Test fun `client supplied user and unknown consumption fields are rejected`() {
        for (invalid in listOf(
            body.replace("\"account_id\"", "\"user_id\":\"victim\",\"account_id\""),
            body.replace("\"orange\":1", "\"extra\":3,\"orange\":1"),
        )) {
            mvc.perform(
                post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(invalid),
            ).andExpect(status().isUnprocessableEntity)
                .andExpect(jsonPath("$.error.code").value("star_completion_invalid_request"))
        }
        verify(exactly = 0) { service.complete(any(), any()) }
    }

    @Test fun `receipt and context pass only authenticated account scope`() {
        every { helper.requireUserId() } returns "u"
        every { service.receipt("u", "a", "op") } throws InventoryApiException(HttpStatus.NOT_FOUND, "star_completion_not_found", "missing")
        every { service.context("u", "a") } throws InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        mvc.perform(get("/v1/star-state/completions/op").param("account_id", "a"))
            .andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("star_completion_not_found"))
        mvc.perform(get("/v1/star-state/completion-context").param("account_id", "a"))
            .andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("account_not_found"))
    }

    @Test fun `server failure and uncertain commit have distinct responses`() {
        every { helper.requireUserId() } returns "u"
        every { service.complete("u", any()) } throws IllegalStateException("injected server failure")
        mvc.perform(post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isInternalServerError).andExpect(jsonPath("$.error.code").value("internal_error"))
        every { service.complete("u", any()) } throws
            InventoryApiException(HttpStatus.SERVICE_UNAVAILABLE, "star_completion_result_unknown", "retry original operation")
        mvc.perform(post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isServiceUnavailable).andExpect(jsonPath("$.error.code").value("star_completion_result_unknown"))
    }

    @Test fun `request integer decoder preserves the exact confirmed values`() {
        val request = mapper.readValue(body, StarCompletionRequest::class.java)
        assertEquals(1, request.experienceConsumed.orange)
        assertEquals(50L, request.bottlesConsumed.jiezheping)
    }

    @Test fun `fallback validation errors use completion code only for the command`() {
        every { helper.requireUserId() } returns "u"
        every { service.complete("u", any()) } throws IllegalArgumentException("Invalid completion input")
        mvc.perform(post("/v1/star-state/completions").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("star_completion_invalid_request"))
        every { service.receipt("u", "a", "op") } throws IllegalArgumentException("Invalid query")
        mvc.perform(get("/v1/star-state/completions/op").param("account_id", "a"))
            .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    @Test fun `context JSON distinguishes null unknown bottle from numeric zero and positive balance`() {
        every { helper.requireUserId() } returns "u"
        every { service.context("u", "a") } returns StarCompletionContextResponse(
            "a",
            "如鸢",
            StarStateCurrentResponse.empty("a"),
            mapOf("jiezhuping" to null, "jiezheping" to 0L, "jieyangping" to 8L),
            7,
        )
        val json = mapper.readTree(
            mvc.perform(get("/v1/star-state/completion-context").param("account_id", "a"))
                .andExpect(status().isOk).andReturn().response.contentAsString,
        )
        val balances = json.at("/data/bottle_balances")
        org.junit.jupiter.api.Assertions.assertTrue(balances.has("jiezhuping") && balances["jiezhuping"].isNull)
        assertEquals(0L, balances["jiezheping"].longValue())
        assertEquals(8L, balances["jieyangping"].longValue())
    }
}
