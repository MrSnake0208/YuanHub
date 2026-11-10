package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarInventorySyncResponse
import com.lhs.share.hub.service.star.StarInventorySyncService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OpenApiStarInventorySyncControllerContractTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val body = """
        {
          "format": "maayuan-star-inventory", "version": 1,
          "scan_id": "11111111-1111-4111-8111-111111111111", "complete": true,
          "counts": {"main": 2, "support": 0},
          "inventory": [
            {"kind": "main", "name": "天府", "quality": "orange", "level": 60},
            {"kind": "main", "name": "天府", "quality": "orange", "level": 60}
          ],
          "experience": {"orange": 0, "purple": 525, "white": 91}
        }
    """.trimIndent()

    @Test fun `wire schema rejects unknown identity fields missing counts and coerced values`() {
        val valid = mapper.readTree(body)
        StarInventorySyncService.validate(StarInventorySyncRequest.fromWire(valid), "如鸢")
        val bad = listOf<(ObjectNode) -> Unit>(
            { it.put("account_id", "another") },
            { it.put("game_version", "ruyuan") },
            { it.put("complete", "true") },
            { (it["experience"] as ObjectNode).put("orange", "0") },
            { (it["experience"] as ObjectNode).put("orange", 0.5) },
            { (it["experience"] as ObjectNode).put("orange", 0.0) },
            { (it["experience"] as ObjectNode).put("orange", false) },
            { (it["experience"] as ObjectNode).put("orange", 2147483648L) },
            { (it["experience"] as ObjectNode).remove("white") },
            { (it["counts"] as ObjectNode).remove("support") },
            { (it["inventory"][0] as ObjectNode).put("instance_id", "client") },
        )
        bad.forEach { mutate ->
            val value = mapper.readTree(body) as ObjectNode
            mutate(value)
            assertThrows(InventoryApiException::class.java) { StarInventorySyncRequest.fromWire(value) }
        }
    }

    @Test fun `wire accepts explicit unknown counts independently of zero and confirmed counts`() {
        val valid = mapper.readTree(body) as ObjectNode
        val samples = listOf(
            """{"orange":null,"purple":0,"white":2147483647}""",
            """{"orange":0,"purple":null,"white":91}""",
            """{"orange":0,"purple":525,"white":null}""",
            """{"orange":null,"purple":null,"white":null}""",
        )
        for (sample in samples) {
            val expected = mapper.readTree(sample)
            valid.set<ObjectNode>("experience", expected)
            val request = StarInventorySyncRequest.fromWire(valid)
            StarInventorySyncService.validate(request, "如鸢")
            assertEquals(expected, mapper.readTree(mapper.writeValueAsString(request))["experience"])
        }
    }

    @Test fun `optional bag is strictly typed bounded and legacy receipt payload stays unchanged`() {
        val legacy = StarInventorySyncRequest.fromWire(mapper.readTree(body))
        assertEquals(mapper.readTree(body), mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(legacy))
        assertEquals(mapper.readTree(body).toString(), mapper.writeValueAsString(legacy))
        for (capacity in listOf("270", "null")) {
            val wire = mapper.readTree(body) as ObjectNode
            wire.set<ObjectNode>("bag", mapper.readTree("""{"current_count":2,"capacity":$capacity}"""))
            val request = StarInventorySyncRequest.fromWire(wire)
            StarInventorySyncService.validate(request, "如鸢")
            assertEquals(mapper.readTree(wire.toString()), mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(request))
        }
        for (bag in listOf(
            "null",
            "{}",
            """{"current_count":2}""",
            """{"current_count":"2","capacity":270}""",
            """{"current_count":2,"capacity":2.5}""",
            """{"current_count":2,"capacity":true}""",
            """{"current_count":2,"capacity":270,"extra":1}""",
        )) {
            val wire = mapper.readTree(body) as ObjectNode
            wire.set<ObjectNode>("bag", mapper.readTree(bag))
            assertThrows(InventoryApiException::class.java) { StarInventorySyncRequest.fromWire(wire) }
        }
        for (bag in listOf(
            """{"current_count":1,"capacity":270}""",
            """{"current_count":2,"capacity":1}""",
            """{"current_count":2,"capacity":0}""",
            """{"current_count":2,"capacity":-1}""",
        )) {
            val wire = mapper.readTree(body) as ObjectNode
            wire.set<ObjectNode>("bag", mapper.readTree(bag))
            assertThrows(InventoryApiException::class.java) {
                StarInventorySyncService.validate(StarInventorySyncRequest.fromWire(wire), "如鸢")
            }
        }
    }

    @Test fun `validation uses canonical kinds quality limits count integrity and real experience`() {
        val valid = StarInventorySyncRequest.fromWire(mapper.readTree(body))
        val bad = listOf(
            valid.copy(complete = false),
            valid.copy(counts = valid.counts.copy(main = 3)),
            valid.copy(experience = valid.experience.copy(orange = -1)),
            valid.copy(inventory = valid.inventory.map { it.copy(kind = "support") }),
            valid.copy(inventory = valid.inventory.map { it.copy(quality = "white", level = 60) }),
            valid.copy(inventory = valid.inventory.map { it.copy(name = "不存在") }),
        )
        bad.forEach { request -> assertThrows(InventoryApiException::class.java) { StarInventorySyncService.validate(request, "如鸢") } }
        assertThrows(InventoryApiException::class.java) { StarInventorySyncService.validate(valid, "unknown") }
        StarInventorySyncService.validate(valid, "代号鸢")
    }

    @Test fun `HTTP uses dedicated permission and only the token bound owner`() {
        val tokens = mockk<OpenApiTokenService>()
        val service = mockk<StarInventorySyncService>()
        val principal = OpenApiPrincipal("owner", "bound")
        every { tokens.validateAuthorization("Bearer sync", OpenApiPermission.STAR_SYNC_WRITE) } returns principal
        every { tokens.validateAuthorization("Bearer old-scope", OpenApiPermission.STAR_SYNC_WRITE) } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "Missing sync scope")
        every { tokens.validateAuthorization(null, OpenApiPermission.STAR_SYNC_WRITE) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Missing token")
        val receipt = StarInventorySyncResponse("11111111-1111-4111-8111-111111111111", "synced", "bound", 2, 5, "point", true)
        every { service.sync("owner", "bound", any()) } returns receipt
        every { service.status("owner", "bound", receipt.scanId) } returns receipt
        val mvc = MockMvcBuilders.standaloneSetup(OpenApiStarInventorySyncController(tokens, service))
            .setControllerAdvice(InventoryExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        val mixed = (mapper.readTree(body) as ObjectNode).also { (it["experience"] as ObjectNode).putNull("purple") }
        val response = mvc.perform(
            post("/open-api/star/inventory-sync").header("Authorization", "Bearer sync")
                .contentType(MediaType.APPLICATION_JSON).content(mixed.toString()),
        ).andExpect(status().isOk).andReturn()
        assertEquals("bound", mapper.readTree(response.response.contentAsString)["data"]["account_id"].asText())
        mvc.perform(get("/open-api/star/inventory-sync/${receipt.scanId}").header("Authorization", "Bearer sync")).andExpect(status().isOk)
        mvc.perform(
            post("/open-api/star/inventory-sync").header("Authorization", "Bearer old-scope")
                .contentType(MediaType.APPLICATION_JSON).content(body),
        ).andExpect(status().isForbidden)
        mvc.perform(
            post("/open-api/star/inventory-sync").contentType(MediaType.APPLICATION_JSON).content(body),
        ).andExpect(status().isUnauthorized)
        verify(exactly = 1) {
            service.sync("owner", "bound", match { it.experience.orange == 0 && it.experience.purple == null && it.experience.white == 91 })
        }
        assertEquals(30003, OpenApiPermission.codeByKey("star:sync:write"))
    }
}
