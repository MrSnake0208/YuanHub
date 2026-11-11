package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiPrincipal
import com.lhs.share.openapi.OpenApiTokenService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletInputStream
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class MaayuanDiagnosticFilterTest {
    private val tokens = mockk<OpenApiTokenService>()
    private val quotas = mockk<MaayuanDiagnosticQuota>(relaxed = true)
    private val filter = MaayuanDiagnosticFilter(tokens, quotas, jacksonObjectMapper())

    @Test
    fun `missing or invalid connection code returns real 401 before reading multipart`() {
        every { tokens.authenticateAuthorization(any()) } throws InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Invalid")
        var readBody = false
        val request = object : MockHttpServletRequest("POST", DIAGNOSTIC_PATH) {
            override fun getInputStream(): ServletInputStream {
                readBody = true
                return super.getInputStream()
            }
        }
        request.contentType = "multipart/form-data; boundary=test"
        val response = MockHttpServletResponse()
        filter.doFilter(request, response, FilterChain { _, _ -> error("Unauthorized request reached endpoint") })
        assertEquals(401, response.status)
        assertFalse(readBody)
        verify(exactly = 0) { quotas.request(any(), any()) }
    }

    @Test
    fun `valid old connection codes need no new scope and retain bounded chunked bodies`() {
        val principal = OpenApiPrincipal("user", "account")
        every { tokens.authenticateAuthorization("Bearer existing-code") } returns principal
        val request = object : MockHttpServletRequest("POST", DIAGNOSTIC_PATH) {
            override fun getContentLengthLong(): Long = -1
        }
        request.addHeader("Authorization", "Bearer existing-code")
        request.contentType = "multipart/form-data; boundary=test"
        request.setContent("bounded".toByteArray())
        val response = MockHttpServletResponse()
        var reached = false
        filter.doFilter(
            request,
            response,
            FilterChain { wrapped, _ ->
                reached = true
                assertEquals(principal, wrapped.getAttribute(DIAGNOSTIC_PRINCIPAL))
                assertEquals("application/octet-stream", wrapped.contentType)
                assertEquals("bounded", (wrapped.getAttribute(DIAGNOSTIC_BODY) as ByteArray).toString(Charsets.UTF_8))
            },
        )
        assertTrue(reached)
        verify { quotas.request(principal, any()) }
    }

    @Test
    fun `actual body over 2 MiB returns real 413 even without Content-Length`() {
        every { tokens.authenticateAuthorization(any()) } returns OpenApiPrincipal("user", "account")
        val request = object : MockHttpServletRequest("POST", DIAGNOSTIC_PATH) {
            override fun getContentLengthLong(): Long = -1
        }
        request.contentType = "multipart/form-data; boundary=test"
        request.setContent(ByteArray(MaayuanDiagnosticFilter.MAX_REQUEST_BYTES + 1))
        val response = MockHttpServletResponse()
        filter.doFilter(request, response, FilterChain { _, _ -> error("Oversized request reached endpoint") })
        assertEquals(413, response.status)
    }
}
