package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.account.AccountShareController
import com.lhs.share.hub.controller.account.response.AccountShareResponse
import com.lhs.share.hub.controller.operator.OperatorController
import com.lhs.share.hub.controller.operator.response.OperatorShareResponse
import com.lhs.share.hub.controller.operator.response.OperatorShareTag
import com.lhs.share.hub.controller.operator.response.OperatorShareViewResponse
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.operator.OperatorService
import com.lhs.share.hub.service.operator.OperatorShareService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class OperatorShareControllerContractTest {
    private val operatorService = mockk<OperatorService>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val shareService = mockk<OperatorShareService>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        every { helper.obtainUserId() } returns null
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        mockMvc = MockMvcBuilders
            .standaloneSetup(
                OperatorController(operatorService, catalogService, helper, shareService = shareService),
                AccountShareController(shareService, helper),
            )
            .setControllerAdvice(OperatorExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
        every { helper.requireUserId() } returns "u1"
    }

    @Test
    fun `management routes use the authenticated owner and fixed account query`() {
        every { shareService.get("u1", "acc1") } returns active("first")
        every { shareService.create("u1", "acc1") } returns active("first")
        every { shareService.regenerate("u1", "acc1") } returns active("second")
        every { shareService.revoke("u1", "acc1") } returns inactive()

        mockMvc.perform(get("/v1/operator/share").param("account_id", "acc1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.share_code").value("first"))
        mockMvc.perform(put("/v1/operator/share").param("account_id", "acc1"))
            .andExpect(status().isOk)
        mockMvc.perform(post("/v1/operator/share/regenerate").param("account_id", "acc1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.share_code").value("second"))
        mockMvc.perform(delete("/v1/operator/share").param("account_id", "acc1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.active").value(false))

        verify { shareService.get("u1", "acc1") }
        verify { shareService.create("u1", "acc1") }
        verify { shareService.regenerate("u1", "acc1") }
        verify { shareService.revoke("u1", "acc1") }
    }

    @Test
    fun `tag consent uses authenticated identity and rejects client owner or missing consent`() {
        every { shareService.setScope("u1", "acc1", "operator_tags", true) } returns
            AccountShareResponse("acc1", true, "code", listOf("operator", "operator_tags"))
        mockMvc.perform(
            patch("/v1/accounts/share").param("account_id", "acc1").contentType("application/json")
                .content("""{"scope":"operator_tags","enabled":true}"""),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.scopes[1]").value("operator_tags"))
        listOf(
            """{"scope":"operator_tags"}""",
            """{"scope":"operator_tags","enabled":true,"user_id":"other"}""",
        ).forEach { body ->
            mockMvc.perform(patch("/v1/accounts/share").param("account_id", "acc1").contentType("application/json").content(body))
                .andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 1) { shareService.setScope("u1", "acc1", "operator_tags", true) }
        every { shareService.setScope("u1", "foreign", "operator_tags", true) } throws
            OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        mockMvc.perform(
            patch("/v1/accounts/share").param("account_id", "foreign").contentType("application/json")
                .content("""{"scope":"operator_tags","enabled":true}"""),
        ).andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("account_not_found"))
    }

    @Test
    fun `public tags serialize names and snake case membership without exposing private organization`() {
        every { shareService.view("code") } returns OperatorShareViewResponse(
            "代号鸢",
            "fixture",
            Instant.EPOCH,
            emptyMap(),
            listOf(OperatorShareTag("main", "主力", listOf("owned"))),
        )
        mockMvc.perform(get("/v1/operator/share/view/code"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.tags[0].id").value("main"))
            .andExpect(jsonPath("$.data.tags[0].name").value("主力"))
            .andExpect(jsonPath("$.data.tags[0].operator_ids[0]").value("owned"))
            .andExpect(jsonPath("$.data.pinned_ids").doesNotExist())
            .andExpect(jsonPath("$.data.status_order").doesNotExist())
    }

    @Test
    fun `public view is anonymous shaped and disables caching`() {
        every { shareService.view("code") } returns OperatorShareViewResponse(
            game = "代号鸢",
            catalogVersion = "2026-09-03",
            updatedAt = Instant.parse("2026-09-03T08:00:00Z"),
            entries = emptyMap(),
        )

        mockMvc.perform(get("/v1/operator/share/view/code"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.game").value("代号鸢"))
            .andExpect(jsonPath("$.data.catalog_version").value("2026-09-03"))
            .andExpect(jsonPath("$.data.entries").isEmpty)
            .andExpect(jsonPath("$.data.tags").isEmpty)

        verify { shareService.view("code") }
    }

    @Test
    fun `invalid public code uses the stable not found error`() {
        every { shareService.view("bad") } throws
            OperatorApiException(HttpStatus.NOT_FOUND, "share_not_found", "Share not found")

        mockMvc.perform(get("/v1/operator/share/view/bad"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error.code").value("share_not_found"))
            .andExpect(jsonPath("$.error.message").value("Share not found"))
    }

    private fun active(code: String) = OperatorShareResponse("acc1", true, code)
    private fun inactive() = OperatorShareResponse("acc1", false, null)
}
