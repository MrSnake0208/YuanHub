package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.inventory.DrawResourceController
import com.lhs.share.hub.controller.inventory.response.DrawResourceContextResponse
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.service.inventory.DrawResourceService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class DrawResourceControllerContractTest {
    private val service = mockk<DrawResourceService>()
    private val helper = mockk<AuthenticationHelper>()
    private val path = "/v1/inventory/draw-resources"
    private val body = """
        {"account_id":"a","game":"代号鸢","operation_id":"op","expected_inventory_revision":1,
        "action":"exchange","ticket_id":"fuchuan","quantity":10,"channel":"monthly-shop"}
    """.trimIndent()
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "owner"
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        mvc = MockMvcBuilders.standaloneSetup(DrawResourceController(service, helper)).setControllerAdvice(InventoryExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `private context and command use authenticated identity and expose signed record`() {
        every { service.context("owner", "a") } returns DrawResourceContextResponse("a", "代号鸢", 1, mapOf("baijinbi" to null))
        mvc.perform(get(path).param("account_id", "a").param("user_id", "stranger"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.inventory_revision").value(1))
        every { service.execute("owner", any()) } returns InventoryRecord(
            recordId = "yuanhub:draw:op",
            userId = "owner",
            accountId = "a",
            recordType = "resource_delta",
            entityType = "item",
            effectiveAt = Instant.parse("2026-10-23T00:00:00Z"),
            producer = ProducerInfo("yuanhub"),
            entries = listOf(RecordEntry("baijinbi", "白金币", -1600), RecordEntry("fuchuan", "符传", 10)),
        )
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.record_type").value("resource_delta"))
            .andExpect(jsonPath("$.data.entries[0].count").value(-1600))
            .andExpect(jsonPath("$.data.resource_request_identity").doesNotExist())
        verify(exactly = 1) { service.execute("owner", match { it.quantity == 10L && it.channel == "monthly-shop" }) }
    }

    @Test
    fun `fractional string null and forged fields fail before command execution`() {
        listOf(
            body.replace("\"quantity\":10", "\"quantity\":1.5"),
            body.replace("\"quantity\":10", "\"quantity\":\"10\""),
            body.replace("\"quantity\":10", "\"quantity\":null"),
            body.replace("\"quantity\":10", "\"quantity\":999999999999999999999"),
            body.replace("\"expected_inventory_revision\":1", "\"expected_inventory_revision\":0.5"),
            body.dropLast(1) + ",\"unit_price\":1}",
            body.dropLast(1) + ",\"user_id\":\"stranger\"}",
        ).forEach {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(it)).andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 0) { service.execute(any(), any()) }
    }

    @Test
    fun `ownership and version errors preserve inventory error contract`() {
        every { service.context("owner", "foreign") } throws InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        mvc.perform(get(path).param("account_id", "foreign")).andExpect(status().isNotFound)
        every { service.execute("owner", any()) } throws InventoryApiException(HttpStatus.CONFLICT, "inventory_state_stale", "stale")
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("inventory_state_stale"))
    }
}
