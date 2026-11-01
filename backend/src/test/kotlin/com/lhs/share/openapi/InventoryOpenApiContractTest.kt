package com.lhs.share.openapi

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.SpringDocConfig
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.controller.inventory.InventoryController
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.hub.service.inventory.InventoryAgentFavoriteService
import com.lhs.share.hub.service.inventory.InventoryService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springdoc.core.configuration.SpringDocConfiguration
import org.springdoc.core.configuration.SpringDocKotlinConfiguration
import org.springdoc.core.properties.SpringDocConfigProperties
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@WebMvcTest(controllers = [InventoryController::class, OpenApiInventoryController::class, OpenApiTokenController::class])
@AutoConfigureMockMvc(addFilters = false)
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SpringDocConfig::class,
    SpringDocConfiguration::class,
    SpringDocConfigProperties::class,
    SpringDocKotlinConfiguration::class,
    SpringDocWebMvcConfiguration::class,
)
@TestPropertySource(properties = ["share.info.public-base-url=https://inventory.example.test"])
class InventoryOpenApiContractTest {
    @MockitoBean
    lateinit var authorization: com.lhs.share.hub.service.admin.AdminAuthorizationService

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @MockitoBean
    lateinit var recruitmentAccessService: com.lhs.share.hub.service.recruitment.RecruitmentAccessService

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @MockitoBean
    lateinit var inventoryService: InventoryService

    @MockitoBean
    lateinit var subAccountService: SubAccountService

    @MockitoBean
    lateinit var accountEventService: AccountEventService

    @MockitoBean
    lateinit var inventoryAgentFavoriteService: InventoryAgentFavoriteService

    @MockitoBean
    lateinit var tokenService: OpenApiTokenService

    @MockitoBean
    lateinit var catalogService: EntityCatalogService

    @MockitoBean
    lateinit var authenticationHelper: AuthenticationHelper

    @MockitoBean
    lateinit var stringRedisTemplate: StringRedisTemplate

    @MockitoBean
    lateinit var dataTransferService: DataTransferService

    @MockitoBean
    lateinit var jwtService: JwtService

    @Test
    fun `generated OpenAPI publishes inventory exchange contract`() {
        val response = mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val root = objectMapper.readTree(response)

        val scheme = root.at("/components/securitySchemes/OpenApiToken")
        assertEquals("http", scheme["type"].asText())
        assertEquals("bearer", scheme["scheme"].asText())
        assertTrue(root["servers"].first()["url"].asText().startsWith("https://"))

        listOf(
            "/open-api/inventory/account",
            "/open-api/inventory/current",
            "/open-api/inventory/import",
            "/open-api/inventory/export",
        ).forEach { path ->
            val operation = root["paths"][path].properties().first().value
            assertTrue(operation["security"].any { it.has("OpenApiToken") })
            assertFalse(operation.path("parameters").any { it.path("name").asText() == "Authorization" })
            operation["responses"].properties().forEach { responseEntry ->
                val content = responseEntry.value.path("content")
                if (!content.isMissingNode) assertFalse(content.has("*/*"))
            }
        }

        val jwtImport = root.at("/paths/~1v1~1inventory~1import/post")
        assertTrue(jwtImport["security"].any { it.has("Jwt") })
        assertTrue(jwtImport["responses"].has("400"))
        assertTrue(jwtImport["responses"].has("409"))
        assertTrue(jwtImport["responses"].has("422"))
        listOf(
            "/v1/inventory/agent-favorites",
            "/v1/inventory/agent-favorites/{agentId}",
        ).forEach { assertTrue(root["paths"].has(it)) }

        val favoritePath = root.at("/paths/~1v1~1inventory~1agent-favorites~1{agentId}")
        assertTrue(favoritePath["put"]["security"].any { it.has("Jwt") })
        assertTrue(favoritePath["delete"]["security"].any { it.has("Jwt") })
        assertFalse(favoritePath["put"]["security"].any { it.has("OpenApiToken") })

        val exportSchema = root.at("/paths/~1v1~1inventory~1export/get/responses/200/content/application~1json/schema")
        assertTrue(exportSchema["\$ref"].asText().endsWith("/InventoryExportResponse"))
        assertFalse(exportSchema["\$ref"].asText().contains("ApiResult"))
        assertTrue(root.at("/components/schemas/InventoryExportResponse/required").any { it.asText() == "producer" })
        val exportVersion = root.at("/components/schemas/InventoryExportResponse/properties/version")
        assertEquals(2, exportVersion["minimum"].asInt())
        assertEquals(2, exportVersion["maximum"].asInt())
        assertEquals(2, exportVersion["default"].asInt())
        assertEquals(listOf(2), exportVersion["enum"].map { it.asInt() })

        assertEquals("date-time", root.at("/components/schemas/InventoryImportRequest/properties/exported_at/format").asText())
        assertEquals(2, root.at("/components/schemas/InventoryImportRequest/properties/version/minimum").asInt())
        assertEquals(1, root.at("/components/schemas/InventoryImportRequest/properties/accounts/minItems").asInt())
        assertFalse(root.at("/components/schemas/InventoryImportRequest/required").any { it.asText() == "accounts" })
        val importAccountRequired = root.at("/components/schemas/InventoryExchangeAccountDto/required")
        assertTrue(importAccountRequired.any { it.asText() == "id" })
        assertFalse(importAccountRequired.any { it.asText() == "name" })
        val exportAccountRequired = root.at("/components/schemas/InventoryExportAccountDto/required")
        assertTrue(exportAccountRequired.any { it.asText() == "id" })
        assertTrue(exportAccountRequired.any { it.asText() == "name" })
        val catalogItem = root.at("/components/schemas/EntityCatalogItemDto")
        assertEquals("string", catalogItem.at("/properties/category/type").asText())
        assertFalse(catalogItem["required"].any { it.asText() == "category" })
        assertEquals(
            setOf("item", "agent"),
            root.at("/components/schemas/InventoryRecordRequest/properties/entity_type/enum").map { it.asText() }.toSet(),
        )
        assertEquals(
            setOf("reward_delta", "stock_snapshot"),
            root.at("/components/schemas/InventoryRecordRequest/properties/record_type/enum").map { it.asText() }.toSet(),
        )
        val recordsOperation = root.at("/paths/~1v1~1inventory~1records/get")
        val limitSchema = recordsOperation["parameters"].first { it["name"].asText() == "limit" }["schema"]
        assertEquals("integer", limitSchema["type"].asText())
        assertEquals("int32", limitSchema["format"].asText())
        assertEquals(1, limitSchema["minimum"].asInt())
        assertEquals(100, limitSchema["maximum"].asInt())
        assertEquals(50, limitSchema["default"].asInt())

        val recordsSchema = root.at("/components/schemas/InventoryImportRequest/properties/records")
        assertEquals(1, recordsSchema["minItems"].asInt())
        assertEquals(1000, recordsSchema["maxItems"].asInt())
        assertTrue(recordsSchema.at("/items/\$ref").asText().endsWith("/InventoryRecordRequest"))
        assertEquals(
            setOf("InventoryRewardRecord", "InventoryFullSnapshotRecord", "InventoryListedSnapshotRecord"),
            root.at("/components/schemas/InventoryRecordRequest/oneOf")
                .map { it["\$ref"].asText().substringAfterLast('/') }
                .toSet(),
        )

        val rewardRecord = root.at("/components/schemas/InventoryRewardRecord")
        assertTrue(rewardRecord["required"].any { it.asText() == "account_id" })
        assertEquals(listOf("reward_delta"), rewardRecord.at("/properties/record_type/enum").map { it.asText() })
        assertEquals(1, rewardRecord.at("/properties/entries/minItems").asInt())
        assertTrue(rewardRecord["not"]["\$ref"].asText().endsWith("/InventorySnapshotScopePresent"))
        assertEquals(0, rewardRecord.at("/properties/stamina_cost/minimum").asInt())
        assertFalse(root.at("/components/schemas/InventoryFullSnapshotRecord/properties").has("stamina_cost"))
        assertEquals(1, root.at("/components/schemas/InventoryRewardEntry/properties/count/minimum").asInt())

        val fullSnapshot = root.at("/components/schemas/InventoryFullSnapshotRecord")
        assertEquals(listOf("full"), fullSnapshot.at("/properties/snapshot_scope/enum").map { it.asText() })
        assertFalse(fullSnapshot.at("/properties/entries").has("minItems"))
        assertTrue(fullSnapshot["required"].any { it.asText() == "snapshot_scope" })
        assertEquals(0, root.at("/components/schemas/InventorySnapshotEntry/properties/count/minimum").asInt())

        val listedSnapshot = root.at("/components/schemas/InventoryListedSnapshotRecord")
        assertEquals(listOf("listed"), listedSnapshot.at("/properties/snapshot_scope/enum").map { it.asText() })
        assertEquals(1, listedSnapshot.at("/properties/entries/minItems").asInt())
        val exportParameters = root.at("/paths/~1v1~1inventory~1export/get/parameters")
        assertTrue(exportParameters.any { it["name"].asText() == "account_id" })
        assertTrue(exportParameters.any { it["name"].asText() == "scope" })
        val openApiCurrentParameters = root.at("/paths/~1open-api~1inventory~1current/get/parameters")
        assertFalse(openApiCurrentParameters.any { it["name"].asText() == "account_id" })
        val openApiExportParameters = root.at("/paths/~1open-api~1inventory~1export/get/parameters")
        assertFalse(openApiExportParameters.any { it["name"].asText() == "account_id" || it["name"].asText() == "scope" })
        val scopeItems = root.at("/components/schemas/OpenApiTokenGenerateRequest/properties/scopes/items")
        assertEquals("string", scopeItems["type"].asText())
        assertEquals(
            setOf(
                "inventory:read",
                "inventory:write",
                "inventory:export",
                "operator:read",
                "operator:write",
                "operator:export",
                "operator:scan:write",
            ),
            scopeItems["enum"].map { it.asText() }.toSet(),
        )
        val tokenList = root.at("/components/schemas/OpenApiTokenListItemDto/properties")
        assertTrue(tokenList.has("token_id"))
        assertTrue(tokenList.has("account_id"))
        assertTrue(tokenList.has("account_name"))
        assertTrue(tokenList.has("remark"))
        assertTrue(tokenList.has("scopes"))
        assertTrue(tokenList.has("created_at"))
        assertFalse(tokenList.has("last_used_at"))
        assertFalse(tokenList.has("token"))
        val tokenGenerateResponses = root.at("/paths/~1user~1open-api~1token/post/responses")
        listOf("200", "400", "401", "404", "429", "500").forEach { assertTrue(tokenGenerateResponses.has(it)) }
        val tokenListResponses = root.at("/paths/~1user~1open-api~1tokens/get/responses")
        listOf("200", "401", "500").forEach { assertTrue(tokenListResponses.has(it)) }
        val tokenDelete = root.at("/paths/~1user~1open-api~1tokens~1{tokenId}/delete")
        assertTrue(tokenDelete.isObject)
        listOf("200", "401", "404", "500").forEach { assertTrue(tokenDelete["responses"].has(it)) }
        val tokenScopesUpdate = root.at("/paths/~1user~1open-api~1tokens~1{tokenId}~1scopes/patch")
        assertTrue(tokenScopesUpdate.isObject)
        assertTrue(tokenScopesUpdate["security"].any { it.has("Jwt") })
        listOf("200", "400", "401", "404", "500").forEach { assertTrue(tokenScopesUpdate["responses"].has(it)) }
        val updateScopeItems = root.at("/components/schemas/OpenApiTokenScopesUpdateRequest/properties/scopes/items")
        assertEquals(scopeItems["enum"].toSet(), updateScopeItems["enum"].toSet())
        val updateResponse = tokenScopesUpdate.at("/responses/200/content/application~1json/schema")
        assertFalse(updateResponse.toString().contains("OpenApiTokenCreatedResponse"))
        assertLocalReferencesResolve(root, root)
    }

    private fun assertLocalReferencesResolve(root: com.fasterxml.jackson.databind.JsonNode, node: com.fasterxml.jackson.databind.JsonNode) {
        if (node.isObject) {
            node.properties().forEach { (name, value) ->
                if (name == "\$ref" && value.asText().startsWith("#/")) {
                    assertFalse(
                        root.at("/" + value.asText().removePrefix("#/").replace("/", "/")).isMissingNode,
                        "Unresolved OpenAPI reference: ${value.asText()}",
                    )
                } else {
                    assertLocalReferencesResolve(root, value)
                }
            }
        } else if (node.isArray) {
            node.forEach { child -> assertLocalReferencesResolve(root, child) }
        }
    }
}
