package com.lhs.share.hub.service.ledger

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.LedgerCatalogExceptionHandler
import com.lhs.share.hub.controller.ledger.AdminLedgerCatalogController
import com.lhs.share.hub.controller.ledger.LedgerCatalogController
import com.lhs.share.hub.repository.AdminAuditLogRepository
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.setup.MockMvcBuilders

/** Exercises real HTTP JSON -> controller -> service -> owned Mongo -> public JSON and persisted audit. */
@Tag("integration")
class LedgerCatalogHttpMongoTest {
    private val database = TestMongo.database("ledger_http")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = LedgerCatalogRepository(template)
    private val auditRepository = MongoRepositoryFactory(template).getRepository(AdminAuditLogRepository::class.java)
    private val authorization = mockk<AdminAuthorizationService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val service = LedgerCatalogService(repository, AdminAuditService(auditRepository, authorization))
    private val mvc = MockMvcBuilders.standaloneSetup(
        LedgerCatalogController(service),
        AdminLedgerCatalogController(service, helper, authorization, mapper),
    ).setControllerAdvice(LedgerCatalogExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun write(path: String, body: String, update: Boolean = false, status: Int = 200): JsonNode {
        val request = if (update) put(path) else post(path)
        val result = mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().response
        assertEquals(status, result.status, result.contentAsString)
        return mapper.readTree(result.contentAsString).path("data")
    }
    private fun publicCatalog(): JsonNode {
        val result = mvc.perform(get("/hub/ledger/catalog")).andReturn().response
        assertEquals(200, result.status)
        assertEquals("no-store", result.getHeader("Cache-Control"))
        return mapper.readTree(result.contentAsString)["data"]
    }

    @Test
    fun `web maintenance round trips both games campaigns settings disable conflict and audit`() {
        LedgerCatalogSeed(repository, mapper).initialize()
        every { helper.requireUserId() } returns "synthetic-editor"
        every { authorization.hasPermission("synthetic-editor", AdminPermission.LEDGER_CATALOG_WRITE) } returns true
        for (game in listOf("daihao", "ru")) {
            val currency = if (game == "daihao") "usd" else "cny"
            val body = """
                {"game":"$game","name":"网页新礼包","points":66,"draws":0.6,
                 "limit":2,"price_$currency":3.5,"category":"测试"}
            """.trimIndent()
            val created = write("/v1/admin/ledger/packages", body)
            assertEquals(1000000L, created["content_id"].asLong())
            assertTrue(publicCatalog()["packages"].any { it["id"] == created["id"] && it["draws"].asDouble() == 0.6 })
            val id = created["id"].asText()
            val changed = body.replace("66", "88").replace("0.6", "1.2").replace("3.5", "4.5").replace("{", "{\"expected_version\":0,")
            val edited = write("/v1/admin/ledger/packages/$id", changed, true)
            assertEquals(88, edited["points"].asInt())
            assertEquals(1.2, edited["draws"].asDouble())
            write("/v1/admin/ledger/packages/$id", changed, true, 409)
            write(
                "/v1/admin/ledger/packages/$id",
                changed.replace("\"expected_version\":0", "\"expected_version\":1,\"enabled\":false"),
                true,
            )
            assertFalse(publicCatalog()["packages"].any { it["id"].asText() == id })
            assertTrue(repository.findPackage(id) != null)
        }
        val campaign = """
            {"game":"ru",
            "name":"任意新一期",
            "starts_at":"2026-10-01T00:00:00+08:00",
            "ends_at":"2026-10-30T23:59:59+08:00",
            "time_zone":"Asia/Shanghai",
            "status":"draft",
            "tiers":[{"points":100,
            "rewards":[{"name":"符传",
            "count":2}]},{"points":200,
            "sort_id":1,
            "rewards":[{"name":"五铢钱",
            "count":100}]}]}
        """.trimIndent()
        val before = repository.campaigns().size
        write("/v1/admin/ledger/campaigns/preview", campaign)
        assertEquals(before, repository.campaigns().size)
        val created = write("/v1/admin/ledger/campaigns", campaign)
        val id = created["id"].asText()
        assertFalse(publicCatalog()["campaigns"].any { it["id"].asText() == id })
        write(
            "/v1/admin/ledger/campaigns/$id",
            campaign.replace("\"draft\"", "\"published\"").replaceFirst("{", "{\"expected_version\":0,"),
            true,
        )
        assertEquals(2, publicCatalog()["campaigns"].first { it["id"].asText() == id }["tiers"].size())
        write("/v1/admin/ledger/settings", """{"exchange_rate":7.5,"expected_version":0}""", true)
        assertEquals(7.5, publicCatalog()["settings"]["exchange_rate"].asDouble())
        val logs = auditRepository.findAll()
        assertEquals(9, logs.size)
        assertTrue(
            logs.all {
                it.actorUserId == "synthetic-editor" && it.targetResource!!.startsWith("ledger:") &&
                    it.after?.ledger?.get("value")?.isNotBlank() == true
            },
        )
        every { authorization.hasPermission("synthetic-editor", AdminPermission.LEDGER_CATALOG_WRITE) } returns false
        write("/v1/admin/ledger/settings", """{"exchange_rate":8,"expected_version":1}""", true, 403)
        assertEquals(9L, auditRepository.count())
    }
}
