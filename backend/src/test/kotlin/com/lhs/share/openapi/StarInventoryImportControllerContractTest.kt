package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.StarInventoryImportController
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarInventoryImportPreview
import com.lhs.share.hub.service.star.StarInventorySyncResponse
import com.lhs.share.hub.service.star.StarInventorySyncService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class StarInventoryImportControllerContractTest {
    private val syncs = mockk<StarInventorySyncService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(StarInventoryImportController(syncs, helper))
        .setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private fun body(confirm: Boolean = false) = mapper.readTree(
        """{"game":"如鸢","source_format":"compact","document":{"format":"maayuan-star-inventory","version":1,
            "scan_id":"11111111-1111-4111-8111-111111111111","complete":true,"counts":{"main":0,"support":0},
            "inventory":[],"experience":{"orange":0,"purple":1,"white":2}}}""",
    ).let { node ->
        (node as com.fasterxml.jackson.databind.node.ObjectNode).apply {
            if (confirm) {
                put("expected_generation", 2)
                put("expected_revision", 7)
            }
        }
    }

    @Test fun `preview and confirm use JWT user selected account and original strict wire parser`() {
        assertTrue(
            StarInventoryImportController::class.java.declaredMethods.filter { it.name in setOf("preview", "confirm") }
                .all { it.isAnnotationPresent(RequireJwt::class.java) },
        )
        every { helper.obtainUserId() } returns "owner"
        every { syncs.previewImport("owner", "a", any(), any()) } returns StarInventoryImportPreview("a", "如鸢", 2, 7, false)
        every { syncs.importInventory("owner", "a", any(), any()) } returns
            StarInventorySyncResponse("11111111-1111-4111-8111-111111111111", "synced", "a", 3, 8, null, false)
        mvc.perform(post("/v1/star/inventory-sync/preview?account_id=a").contentType(MediaType.APPLICATION_JSON).content(body().toString()))
            .andExpect(status().isOk)
        mvc.perform(post("/v1/star/inventory-sync?account_id=a").contentType(MediaType.APPLICATION_JSON).content(body(true).toString()))
            .andExpect(status().isOk)
        verify(exactly = 1) {
            syncs.importInventory(
                "owner",
                "a",
                any(),
                match {
                    it.generation == 2L && it.revision == 7L && it.game == "如鸢" &&
                        !it.raw
                },
            )
        }
    }

    @Test fun `identity injection coercion and missing preview versions cannot reach a write`() {
        every { helper.obtainUserId() } returns "owner"
        for (bad in listOf(
            body(true).put("user_id", "other"),
            body(true).put("expected_revision", "7"),
            body(),
            body(true).apply { (get("document") as com.fasterxml.jackson.databind.node.ObjectNode).put("account_id", "other") },
        )) {
            mvc.perform(post("/v1/star/inventory-sync?account_id=a").contentType(MediaType.APPLICATION_JSON).content(bad.toString()))
                .andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 0) { syncs.importInventory(any(), any(), any(), any()) }
    }

    @Test fun `ownership and pending conflicts stay explicit`() {
        every { helper.obtainUserId() } returns "owner"
        every { syncs.importInventory("owner", "foreign", any(), any()) } throws
            InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "not owned")
        mvc.perform(
            post("/v1/star/inventory-sync?account_id=foreign").contentType(MediaType.APPLICATION_JSON).content(body(true).toString()),
        )
            .andExpect(status().isNotFound)
        every { syncs.importInventory("owner", "a", any(), any()) } throws
            InventoryApiException(HttpStatus.CONFLICT, "star_plan_inheritance_pending", "pending")
        mvc.perform(post("/v1/star/inventory-sync?account_id=a").contentType(MediaType.APPLICATION_JSON).content(body(true).toString()))
            .andExpect(status().isConflict)
    }

    @Test fun `anonymous imports cannot reach the service`() {
        every { helper.obtainUserId() } returns null
        for (suffix in listOf("", "/preview")) {
            mvc.perform(
                post("/v1/star/inventory-sync$suffix?account_id=a").contentType(MediaType.APPLICATION_JSON)
                    .content(body(suffix.isEmpty()).toString()),
            ).andExpect(status().isUnauthorized)
        }
        verify(exactly = 0) { syncs.importInventory(any(), any(), any(), any()) }
        verify(exactly = 0) { syncs.previewImport(any(), any(), any(), any()) }
    }
}
