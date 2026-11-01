package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorReserveWorkspaceController
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException

class OperatorReserveWorkspaceControllerTest {
    private val service = mockk<OperatorReserveWorkspaceService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper()
    private val mvc = MockMvcBuilders.standaloneSetup(OperatorReserveWorkspaceController(service, helper))
        .setControllerAdvice(OperatorExceptionHandler()).build()

    @Test
    fun `authenticated identity and account route reach service and errors retain HTTP status`() {
        every { helper.requireUserId() } returns "authenticated-owner"
        every { service.workspace("authenticated-owner", "a") } returns mapper.createObjectNode().put("revision", 0)
        mvc.perform(get("/v1/operator/reserve-workspace").param("account_id", "a"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(0))
        for (http in listOf(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.CONFLICT, HttpStatus.NOT_FOUND)) {
            every { service.putWorkspace("authenticated-owner", "a", any()) } throws
                OperatorApiException(http, "synthetic_error", "synthetic error", fieldPath = "plans[0].name")
            mvc.perform(
                put("/v1/operator/reserve-workspace").param("account_id", "a").contentType(MediaType.APPLICATION_JSON).content("{}"),
            )
                .andExpect(status().`is`(http.value())).andExpect(jsonPath("$.error.code").value("synthetic_error"))
        }
        verify(exactly = 1) { service.workspace("authenticated-owner", "a") }
    }

    @Test
    fun `malformed body is 422 before service write`() {
        every { helper.requireUserId() } returns "authenticated-owner"
        mvc.perform(put("/v1/operator/reserve-workspace").param("account_id", "a").contentType(MediaType.APPLICATION_JSON).content("[]"))
            .andExpect(status().isUnprocessableEntity)
        verify(exactly = 0) { service.putWorkspace(any(), any(), any()) }
    }

    @Test
    fun `missing authentication cannot read or write`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("/v1/operator/reserve-workspace").param("account_id", "a")).andExpect(status().isUnauthorized)
        mvc.perform(put("/v1/operator/reserve-workspace").param("account_id", "a").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized)
        verify(exactly = 0) { service.workspace(any(), any()) }
        verify(exactly = 0) { service.putWorkspace(any(), any(), any()) }
    }
}
