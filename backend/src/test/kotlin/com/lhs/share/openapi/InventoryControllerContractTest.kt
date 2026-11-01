package com.lhs.share.openapi

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.account.AccountController
import com.lhs.share.hub.controller.inventory.InventoryController
import com.lhs.share.hub.controller.inventory.response.InventoryAcquiredSummaryItem
import com.lhs.share.hub.controller.inventory.response.InventoryAcquiredSummaryResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAgentFavoriteListResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAgentFavoriteResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAnnotationEntry
import com.lhs.share.hub.controller.inventory.response.InventoryAnnotationPreview
import com.lhs.share.hub.controller.inventory.response.InventoryImportEvent
import com.lhs.share.hub.controller.inventory.response.InventoryImportResult
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.hub.service.inventory.InventoryAgentFavoriteService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.inventory.InventoryService
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import java.time.Instant
import java.time.LocalDate

class InventoryControllerContractTest {
    private val inventoryService = mockk<InventoryService>()
    private val subAccountService = mockk<SubAccountService>()
    private val favoriteService = mockk<InventoryAgentFavoriteService>()
    private val tokenService = mockk<OpenApiTokenService>()
    private val catalogService = mockk<EntityCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val eventService = mockk<AccountEventService>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        val validator = LocalValidatorFactoryBean().apply { afterPropertiesSet() }
        mockMvc = MockMvcBuilders
            .standaloneSetup(
                InventoryController(inventoryService, favoriteService, catalogService, helper),
                OpenApiInventoryController(tokenService, inventoryService, subAccountService, eventService),
                AccountController(subAccountService, helper, eventService),
            )
            .setControllerAdvice(InventoryExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .setValidator(validator)
            .build()
        every { eventService.publish(any(), any(), any(), any(), any()) } just runs
    }

    @Test
    fun `reward annotation routes bind JWT owner and revision and preserve entry diagnostics`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { inventoryService.previewRewardAnnotations("jwt-user", any()) } returns InventoryAnnotationPreview(
            7,
            listOf(
                InventoryAnnotationEntry(
                    "test:1",
                    "item",
                    "baijinbi",
                    Instant.parse("2026-08-16T11:00:00Z"),
                    Instant.parse("2026-08-16T10:00:00Z"),
                    true,
                ),
            ),
            true,
        )
        every { inventoryService.annotateRewards("jwt-user", any(), 7) } returns InventoryImportResult(accepted = 1, historyOnly = 1)
        mockMvc.perform(post("/v1/inventory/reward-annotations/preview").contentType(MediaType.APPLICATION_JSON).content(validDocument))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.expected_inventory_revision").value(7))
            .andExpect(jsonPath("$.data.can_confirm").value(true))
            .andExpect(jsonPath("$.data.entries[0].history_only").value(true))
            .andExpect(jsonPath("$.data.entries[0].record_id").value("test:1"))
        mockMvc.perform(
            post("/v1/inventory/reward-annotations").contentType(MediaType.APPLICATION_JSON)
                .content("""{"document":$validDocument,"expected_inventory_revision":7}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.history_only").value(1))
        verify(exactly = 1) { inventoryService.annotateRewards("jwt-user", any(), 7) }
        verify(exactly = 0) { inventoryService.import(any(), any()) }
    }

    @Test
    fun `reward annotation command rejects invalid revisions and exposes located stock errors`() {
        every { helper.requireUserId() } returns "jwt-user"
        for (revision in listOf("-1", "9007199254740991", "null")) {
            mockMvc.perform(
                post("/v1/inventory/reward-annotations").contentType(MediaType.APPLICATION_JSON)
                    .content("""{"document":$validDocument,"expected_inventory_revision":$revision}"""),
            )
                .andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 0) { inventoryService.annotateRewards(any(), any(), any()) }
        mockMvc.perform(
            post("/v1/inventory/reward-annotations").contentType(MediaType.APPLICATION_JSON)
                .content("""{"document":$validDocument}"""),
        )
            .andExpect(status().isUnprocessableEntity)
        every { inventoryService.annotateRewards("jwt-user", any(), 7) } throws InventoryApiException(
            HttpStatus.CONFLICT,
            "annotation_baseline_missing",
            "请核对盘点",
            "test:1",
            "baijinbi",
        )
        mockMvc.perform(
            post("/v1/inventory/reward-annotations").contentType(MediaType.APPLICATION_JSON)
                .content("""{"document":$validDocument,"expected_inventory_revision":7}"""),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.record_id").value("test:1"))
            .andExpect(jsonPath("$.error.entry_id").value("baijinbi"))
        mockMvc.perform(post("/open-api/inventory/reward-annotations").contentType(MediaType.APPLICATION_JSON).content(validDocument))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `restore record uses authenticated owner and requested account`() {
        every { helper.requireUserId() } returns "owner"
        every { inventoryService.restoreRecord("owner", "main", "record:1") } just runs

        mockMvc.perform(post("/v1/inventory/records/record:1/restore").param("account_id", "main"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").value(true))
        verify(exactly = 1) { inventoryService.restoreRecord("owner", "main", "record:1") }
    }

    @Test
    fun `summary binds ISO local dates timezone and authenticated owner and returns active days`() {
        every { helper.requireUserId() } returns "owner"
        every {
            inventoryService.acquiredSummary(
                "owner",
                "main",
                "agent",
                LocalDate.parse("2026-09-01"),
                LocalDate.parse("2026-09-14"),
                "Asia/Shanghai",
            )
        } returns InventoryAcquiredSummaryResponse(
            "main",
            "agent",
            Instant.parse("2026-08-31T16:00:00Z"),
            Instant.parse("2026-09-13T16:00:00Z"),
            "Asia/Shanghai",
            mapOf("char_001_yangxiu" to InventoryAcquiredSummaryItem(18, 3)),
        )
        mockMvc.perform(
            get("/v1/inventory/acquired-summary")
                .param("account_id", "main").param("entity_type", "agent")
                .param("from_date", "2026-09-01").param("to_date", "2026-09-14").param("timezone", "Asia/Shanghai"),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items.char_001_yangxiu.acquired").value(18))
            .andExpect(jsonPath("$.data.items.char_001_yangxiu.active_days").value(3))
    }

    @Test
    fun `API token with inventory write can import`() {
        every { tokenService.validateAuthorization("Bearer write-token", OpenApiPermission.INVENTORY_WRITE) } returns
            OpenApiPrincipal("token-user", "main")
        every {
            tokenService.connectionIdForAuthorization("Bearer write-token", OpenApiPrincipal("token-user", "main"))
        } returns "connection-id"
        every { inventoryService.importFromConnection("token-user", "main", "connection-id", any()) } returns
            InventoryImportResult(accepted = 1, warnings = listOf("已忽略如鸢不支持的零值密探：周忠"))

        mockMvc.perform(
            post("/open-api/inventory/import")
                .header("Authorization", "Bearer write-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDocument),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.accepted").value(1))
            .andExpect(jsonPath("$.data.warnings[0]").value("已忽略如鸢不支持的零值密探：周忠"))

        verify {
            inventoryService.importFromConnection(
                "token-user",
                "main",
                "connection-id",
                match { it.records.single().let { record -> record.recordId == "test:1" && record.staminaCost == 80L } },
            )
        }
        verify {
            eventService.publish(
                "token-user",
                "main",
                OpenApiInventoryController.INVENTORY_EVENT_NAME,
                any(),
                match<InventoryImportEvent> {
                    it.accountId == "main" &&
                        it.accepted == 1 &&
                        it.records.single().entries.single().id == "baijinbi"
                },
            )
        }
    }

    @Test
    fun `API token exposes its bound account without an account selector`() {
        every { tokenService.authenticateAuthorization("Bearer account-token") } returns OpenApiPrincipal("token-user", "main")
        every { subAccountService.requireAccount("token-user", "main") } returns
            SubAccount(id = "a1", userId = "token-user", accountId = "main", name = "大号")

        mockMvc.perform(
            get("/open-api/inventory/account")
                .header("Authorization", "Bearer account-token"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("main"))
            .andExpect(jsonPath("$.data.name").value("大号"))
    }

    @Test
    fun `missing invalid and under-scoped API tokens return 401 or 403`() {
        every { tokenService.validateAuthorization(null, OpenApiPermission.INVENTORY_WRITE) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")
        every { tokenService.validateAuthorization("Bearer invalid", OpenApiPermission.INVENTORY_WRITE) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is invalid")
        every { tokenService.validateAuthorization("Bearer read-only", OpenApiPermission.INVENTORY_WRITE) } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")

        mockMvc.perform(post("/open-api/inventory/import").contentType(MediaType.APPLICATION_JSON).content(validDocument))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))
        mockMvc.perform(
            post("/open-api/inventory/import")
                .header("Authorization", "Bearer invalid")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDocument),
        )
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))
        mockMvc.perform(
            post("/open-api/inventory/import")
                .header("Authorization", "Bearer read-only")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDocument),
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))
    }

    @Test
    fun `JWT inventory import remains available`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { inventoryService.import("jwt-user", any()) } returns
            InventoryImportResult(accepted = 1, warnings = listOf("已忽略如鸢不支持的零值密探：周忠"))

        mockMvc.perform(post("/v1/inventory/import").contentType(MediaType.APPLICATION_JSON).content(validDocument))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.accepted").value(1))
            .andExpect(jsonPath("$.data.warnings[0]").value("已忽略如鸢不支持的零值密探：周忠"))

        verify { inventoryService.import("jwt-user", any()) }
    }

    @Test
    fun `JWT agent favorite endpoints use snake case responses and authenticated owner`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { favoriteService.list("jwt-user", "acc_a") } returns
            InventoryAgentFavoriteListResponse("acc_a", listOf("char_038_luxun", "char_102_jianyong"))
        every { favoriteService.add("jwt-user", "acc_a", "char_102_jianyong") } returns
            InventoryAgentFavoriteResponse("acc_a", "char_102_jianyong", true)
        every { favoriteService.remove("jwt-user", "acc_a", "char_102_jianyong") } returns
            InventoryAgentFavoriteResponse("acc_a", "char_102_jianyong", false)

        mockMvc.perform(get("/v1/inventory/agent-favorites").param("account_id", "acc_a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.account_id").value("acc_a"))
            .andExpect(jsonPath("$.data.agent_ids[0]").value("char_038_luxun"))
        mockMvc.perform(put("/v1/inventory/agent-favorites/char_102_jianyong").param("account_id", "acc_a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.agent_id").value("char_102_jianyong"))
            .andExpect(jsonPath("$.data.favorite").value(true))
        mockMvc.perform(delete("/v1/inventory/agent-favorites/char_102_jianyong").param("account_id", "acc_a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.favorite").value(false))

        verify { favoriteService.list("jwt-user", "acc_a") }
        verify { favoriteService.add("jwt-user", "acc_a", "char_102_jianyong") }
        verify { favoriteService.remove("jwt-user", "acc_a", "char_102_jianyong") }
        verify(exactly = 0) { inventoryService.current(any(), any(), any()) }
        verify(exactly = 0) { inventoryService.acquired(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { inventoryService.listRecords(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { inventoryService.export(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `agent inventory ignores forged catalog metadata fields`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { inventoryService.import("jwt-user", any()) } returns InventoryImportResult(accepted = 1)
        val forgedDocument =
            """
            {
              "format": "myshare-inventory-exchange",
              "version": 2,
              "exported_at": "2026-08-16T10:00:00Z",
              "producer": { "platform": "test" },
              "records": [{
                "account_id": "acc_a",
                "record_id": "agent:forged",
                "record_type": "stock_snapshot",
                "entity_type": "agent",
                "effective_at": "2026-08-16T10:00:00Z",
                "snapshot_scope": "full",
                "entries": [{
                  "id": "char_102_jianyong",
                  "name": "伪造名称",
                  "count": 12,
                  "rarity": 1,
                  "prof": "伪造属性",
                  "sub_prof": "伪造职业"
                }]
              }]
            }
            """.trimIndent()

        mockMvc.perform(post("/v1/inventory/import").contentType(MediaType.APPLICATION_JSON).content(forgedDocument))
            .andExpect(status().isOk)

        verify {
            inventoryService.import(
                "jwt-user",
                match { request ->
                    request.records.single().entries.single().let { entry ->
                        entry.id == "char_102_jianyong" && entry.name == "伪造名称" && entry.count == 12L
                    }
                },
            )
        }
        verify(exactly = 0) { catalogService.catalog() }
    }

    @Test
    fun `malformed JSON and schema violations use inventory errors`() {
        val missingAccountId = jacksonObjectMapper().readTree(validDocument)
        (missingAccountId["records"][0] as com.fasterxml.jackson.databind.node.ObjectNode).remove("account_id")

        mockMvc.perform(post("/v1/inventory/import").contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error.code").value("invalid_json"))

        mockMvc.perform(
            post("/v1/inventory/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDocument.replace("\"baijinbi\"", "\"\"")),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))

        mockMvc.perform(
            post("/v1/inventory/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content(missingAccountId.toString()),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))

        verify(exactly = 0) { inventoryService.import(any(), any()) }

        mockMvc.perform(
            post("/v1/inventory/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDocument.replace("\"version\": 2,", "\"version\": 2, \"user_id\": \"other\",")),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    private val validDocument =
        """
        {
          "format": "myshare-inventory-exchange",
          "version": 2,
          "exported_at": "2026-08-16T10:00:00Z",
          "producer": { "platform": "test" },
          "records": [{
            "account_id": "main",
            "record_id": "test:1",
            "record_type": "reward_delta",
            "entity_type": "item",
            "acquisition_channel": "派遣",
            "stamina_cost": 80,
            "effective_at": "2026-08-16T10:00:00Z",
            "entries": [{ "id": "baijinbi", "count": 1 }]
          }]
        }
        """.trimIndent()
}
