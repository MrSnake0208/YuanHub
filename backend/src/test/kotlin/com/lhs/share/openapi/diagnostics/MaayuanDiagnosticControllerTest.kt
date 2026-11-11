package com.lhs.share.openapi.diagnostics

import com.lhs.share.openapi.OpenApiPrincipal
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException

class MaayuanDiagnosticControllerTest {
    private val service = mockk<MaayuanDiagnosticService>()
    private val mvc = MockMvcBuilders.standaloneSetup(MaayuanDiagnosticController(service))
        .setControllerAdvice(MaayuanDiagnosticExceptionHandler()).build()

    @Test
    fun `success is a plain JSON receipt and failures use real HTTP status`() {
        every { service.receive(any(), any(), any()) } returns DiagnosticReceipt("accepted", "event")
        mvc.perform(request()).andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("accepted"))
            .andExpect(jsonPath("$.event_id").value("event"))
            .andExpect(jsonPath("$.data").doesNotExist())
        listOf(400, 401, 403, 413, 422, 429, 503).forEach { code ->
            every { service.receive(any(), any(), any()) } throws ResponseStatusException(HttpStatus.valueOf(code), "Synthetic")
            mvc.perform(request()).andExpect(status().`is`(code))
        }
    }

    @Test
    fun `quota errors preserve Retry-After and unexpected failures are retryable`() {
        val failure = object : ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Quota") {
            override fun getHeaders() = org.springframework.http.HttpHeaders().apply { set("Retry-After", "60") }
        }
        every { service.receive(any(), any(), any()) } throws failure
        mvc.perform(request()).andExpect(status().isTooManyRequests).andExpect(header().string("Retry-After", "60"))
        every { service.receive(any(), any(), any()) } throws IllegalStateException("Synthetic database failure")
        mvc.perform(request()).andExpect(status().isServiceUnavailable)
    }

    private fun request() = post(DIAGNOSTIC_PATH)
        .requestAttr(DIAGNOSTIC_PRINCIPAL, OpenApiPrincipal("user", "account"))
        .requestAttr(DIAGNOSTIC_BODY, byteArrayOf())
        .requestAttr(DIAGNOSTIC_TYPE, "multipart/form-data; boundary=test")
}
