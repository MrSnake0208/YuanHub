package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.request.StarScanReportRequest
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.star.StarScanService
import com.lhs.share.hub.service.star.StarScanUploadResponse
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OpenApiStarScanControllerContractTest {
    @Test fun `scan uses dedicated scope and token account without granting state write`() {
        val tokens = mockk<OpenApiTokenService>()
        val scans = mockk<StarScanService>()
        val access = mockk<AdminAuthorizationService>()
        val controller = OpenApiStarScanController(tokens, scans, access)
        every { access.hasPermission("u", AdminPermission.STAR_SCAN_REVIEW) } returns true
        val report = StarScanReportRequest()
        every { tokens.validateAuthorization("Bearer scan", OpenApiPermission.STAR_SCAN_WRITE) } returns OpenApiPrincipal("u", "a")
        every { scans.upload("u", "a", report) } returns StarScanUploadResponse("r", "needs_review")
        assertEquals("needs_review", controller.upload("Bearer scan", report).data!!.status)
        every { tokens.validateAuthorization(null, OpenApiPermission.STAR_SCAN_WRITE) } throws IllegalStateException("unauthorized")
        assertThrows(IllegalStateException::class.java) { controller.upload(null, report) }
        verify(exactly = 1) { scans.upload(any(), any(), any()) }
        assertTrue(BetaAccessPolicy.requiresBeta("POST", "/v1/star/scans/r/apply"))
        assertTrue(BetaAccessPolicy.requiresBeta("GET", "/v1/star/scans/pending"))
        assertEquals(30002, OpenApiPermission.codeByKey("star:scan:write"))
    }

    @Test fun `valid scan token cannot upload or query accounts after owner loses preview permission`() {
        val tokens = mockk<OpenApiTokenService>()
        val scans = mockk<StarScanService>()
        val access = mockk<AdminAuthorizationService>()
        every { tokens.validateAuthorization("Bearer scan", OpenApiPermission.STAR_SCAN_WRITE) } returns OpenApiPrincipal("ordinary", "a")
        every { access.hasPermission("ordinary", AdminPermission.STAR_SCAN_REVIEW) } returns false
        val mvc = MockMvcBuilders.standaloneSetup(OpenApiStarScanController(tokens, scans, access))
            .setControllerAdvice(InventoryExceptionHandler()).build()
        mvc.perform(get("/open-api/star/scans/account").header("Authorization", "Bearer scan")).andExpect(status().isForbidden)
        mvc.perform(
            post("/open-api/star/scans").header("Authorization", "Bearer scan").contentType(MediaType.APPLICATION_JSON).content("{}"),
        )
            .andExpect(status().isForbidden)
        verify(exactly = 0) { scans.upload(any(), any(), any()) }
        verify(exactly = 0) { scans.account(any(), any()) }
    }

    @Test fun `scan rejects embedded images and client supplied plans at decoding boundary`() {
        val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        for (field in listOf("images", "plan_targets", "loadouts")) {
            assertThrows(Exception::class.java) { mapper.readValue("{\"$field\":[]}", StarScanReportRequest::class.java) }
        }
    }
}
