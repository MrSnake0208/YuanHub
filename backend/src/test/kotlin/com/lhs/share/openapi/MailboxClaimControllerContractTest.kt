package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.GlobalExceptionHandler
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.inventory.MailboxClaimController
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.inventory.MailboxClaimService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class MailboxClaimControllerContractTest {
    private val service = mockk<MailboxClaimService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(MailboxClaimController(service, helper))
        .setControllerAdvice(InventoryExceptionHandler(), GlobalExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/v1/inventory/mailbox-reserve/claim"
    private val body = """{"expected_version":1,"operation_id":"receipt"}"""

    @Test
    fun `claim uses authenticated owner and no-store response without exposing private identity`() {
        every { helper.requireUserId() } returns "owner"
        every { service.claim("owner", "main", mapper.readTree(body)) } returns MailboxReserveResponse("main", emptyList(), 0, 2, null)
        mvc.perform(
            post(path).param("account_id", "main").param("user_id", "stranger").contentType(MediaType.APPLICATION_JSON).content(body),
        )
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("main"))
            .andExpect(jsonPath("$.data.version").value(2))
            .andExpect(jsonPath("$.data.user_id").doesNotExist())
        verify(exactly = 1) { service.claim("owner", "main", mapper.readTree(body)) }
    }

    @Test
    fun `missing account and stale reserve return inventory errors instead of false success`() {
        every { helper.requireUserId() } returns "owner"
        for (status in listOf(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)) {
            every { service.claim("owner", "main", any()) } throws InventoryApiException(status, "claim_rejected", "rejected")
            mvc.perform(post(path).param("account_id", "main").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().`is`(status.value()))
                .andExpect(jsonPath("$.error.code").value("claim_rejected"))
        }
    }

    @Test
    fun `unauthenticated request cannot reach claim service`() {
        every { helper.requireUserId() } throws InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "unauthorized")
        mvc.perform(post(path).param("account_id", "main").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized)
        verify { service wasNot io.mockk.Called }
    }
}
