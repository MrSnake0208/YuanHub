package com.lhs.share.hub.service.ledger

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.ledger.request.LedgerCampaignWrite
import com.lhs.share.hub.controller.ledger.request.LedgerPackageWrite
import com.lhs.share.hub.controller.ledger.request.LedgerSettingsWrite
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.repository.entity.LedgerReward
import com.lhs.share.hub.repository.entity.LedgerTier
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.Executors

@Tag("integration")
class LedgerCatalogMongoTest {
    private val database = TestMongo.database("ledger")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = LedgerCatalogRepository(template)
    private val service = LedgerCatalogService(repository, mockk<AdminAuditService>(relaxed = true))
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val seed = LedgerCatalogSeed(repository, mapper)
    private val request = LedgerPackageWrite("ru", "测试礼包", 60, 0.6, 2, priceCny = 6.0, category = "其他")

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `seed is exact repeatable preserves edits and historical dates and duplicate game IDs`() {
        seed.initialize()
        assertEquals(101, repository.packages().count { it.game == "daihao" })
        assertEquals(41, repository.packages().count { it.game == "ru" })
        assertEquals(4, repository.campaigns().size)
        assertEquals(6.7, repository.settings()!!.exchangeRate)
        assertEquals(1580.0, repository.findPackage("ru:96")!!.priceCny)
        assertEquals(0.6, repository.findPackage("ru:18")!!.draws)
        assertNotEquals(repository.findPackage("ru:1")!!.priceCny, repository.findPackage("daihao:1")!!.priceUsd)
        val old = repository.findPackage("ru:1")!!
        repository.save(old.copy(name = "人工改名", enabled = false))
        seed.initialize()
        seed.initialize()
        assertEquals(142, repository.packages().size)
        assertEquals("人工改名", repository.findPackage("ru:1")!!.name)
        assertFalse(repository.findPackage("ru:1")!!.enabled)
        assertEquals(
            setOf(Instant.parse("2026-04-29T15:59:59Z"), Instant.parse("2026-05-13T15:59:59Z")),
            repository.campaigns().map {
                it.endsAt
            }.toSet(),
        )
        assertTrue(repository.campaigns().all { it.startsAt == null && it.sourceNote.isNotBlank() && it.tiers.size == 14 })
    }

    @Test
    fun `atomic IDs are unique never recycled and soft disable retains source and CAS`() {
        seed.initialize()
        val pool = Executors.newFixedThreadPool(4)
        try {
            val ids = pool.invokeAll((1..20).map { Callable { service.savePackage("editor", null, request).contentId } }).map { it.get() }
            assertEquals(20, ids.toSet().size)
            assertTrue(ids.all { it in 1000000..999999999 && it < 1000000000000L })
            val created = repository.findPackage("ru:${ids.first()}")!!
            val stale = repository.findPackage(created.id)!!
            service.savePackage("editor", created.id, request.copy(enabled = false, expectedVersion = created.version))
            assertThrows(org.springframework.dao.OptimisticLockingFailureException::class.java) {
                repository.save(stale.copy(name = "lost update"))
            }
            assertEquals(
                409,
                assertThrows(LedgerCatalogException::class.java) {
                    service.savePackage("other", created.id, request.copy(expectedVersion = created.version))
                }.status.value(),
            )
            assertFalse(service.catalog().packages.any { it.id == created.id })
            seed.initialize()
            assertTrue(service.savePackage("editor", null, request).contentId > ids.max())
            assertEquals(
                1000000L,
                service.savePackage("editor", null, request.copy(game = "daihao", priceCny = null, priceUsd = 1.0)).contentId,
            )
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `campaign publish disable tiers and settings CAS persist and public reads have no writes`() {
        seed.initialize()
        val request =
            LedgerCampaignWrite(
                "ru",
                "新一期",
                Instant.parse("2026-10-01T00:00:00Z"),
                Instant.parse("2026-10-30T00:00:00Z"),
                "Asia/Shanghai",
                "draft",
                listOf(LedgerTier(100, listOf(LedgerReward("符传", 2))), LedgerTier(200, listOf(LedgerReward("未公开", 1)), enabled = false)),
            )
        val draft = service.saveCampaign("editor", null, request)
        assertFalse(service.catalog().campaigns.any { it.id == draft.id })
        val live = service.saveCampaign("editor", draft.id, request.copy(status = "published", expectedVersion = draft.version))
        assertEquals(1, service.catalog().campaigns.first { it.id == live.id }.tiers.size)
        assertEquals(
            409,
            assertThrows(LedgerCatalogException::class.java) {
                service.saveCampaign("other", draft.id, request.copy(expectedVersion = draft.version))
            }.status.value(),
        )
        service.saveCampaign("editor", live.id, request.copy(status = "disabled", expectedVersion = live.version))
        assertFalse(service.catalog().campaigns.any { it.id == live.id })
        val settings = repository.settings()!!
        service.saveSettings("editor", LedgerSettingsWrite(7.5, settings.version!!))
        assertEquals(
            409,
            assertThrows(LedgerCatalogException::class.java) {
                service.saveSettings("other", LedgerSettingsWrite(8.0, settings.version!!))
            }.status.value(),
        )
        val before = template.getCollection("hub_ledger_settings").find().into(mutableListOf())
        repeat(2) { assertEquals(7.5, service.catalog().settings.exchangeRate) }
        assertEquals(before, template.getCollection("hub_ledger_settings").find().into(mutableListOf()))
    }
}
