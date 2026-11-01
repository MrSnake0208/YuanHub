package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.inventory.request.DrawResourceRequest
import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.inventory.response.InventoryCatalogResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.InventoryRevisionRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.Index
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class DrawResourceMongoTest {
    private val database = TestMongo.database("draw")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val accounts = factory.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val current = factory.getRepository(InventoryCurrentRepository::class.java)
    private val records = factory.getRepository(InventoryRecordRepository::class.java)
    private val deleted = factory.getRepository(InventoryDeletedRecordRepository::class.java)
    private val revisions = factory.getRepository(
        InventoryRevisionRepository::class.java,
        RepositoryFragments.just(InventoryRevisionRepositoryImpl(template)),
    )
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val catalog = mockk<EntityCatalogService>()
    private val inventory = InventoryService(accounts, current, records, deleted, catalog, template, tx, revisions)
    private val service = DrawResourceService(accounts, current, revisions, records, deleted, jacksonObjectMapper(), tx)

    @BeforeEach
    fun seed() {
        accounts.save(SubAccount(userId = "owner", accountId = "main", name = "Main"))
        every { catalog.exists(any(), any()) } returns true
        every { catalog.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        template.indexOps(InventoryRecord::class.java).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("recordId", Sort.Direction.ASC).unique(),
        )
        snapshot("base", "2026-01-01T00:00:00Z", listOf(InventoryEntryRequest("baijinbi", count = 10000)))
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `three fixed prices produce one signed record and reward gains remain separate`() {
        val first = service.execute("owner", request("standard", quantity = 10))
        assertEquals("resource_delta", first.recordType)
        assertEquals(listOf(-2000L, 10L), first.entries.map { it.count })
        service.execute("owner", request("monthly", ticket = "fuchuan", channel = "monthly-shop", quantity = 10))
        service.execute("owner", request("ordinary", ticket = "fuchuan"))
        service.execute("owner", request("reward", ticket = "fuchuan", action = "gain", channel = "活动奖励", quantity = 5))
        service.execute("owner", request("use", ticket = "fuchuan", action = "use", channel = "use", quantity = 3))
        assertEquals(
            mapOf("baijinbi" to 6200L, "fuchuan" to 13L, "tianjifuchuan" to 10L, "zhuyu" to 0L),
            service.context("owner", "main").balances,
        )
        val gains = records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("owner", "main").filter { it.recordType == "reward_delta" }
        assertEquals(1, gains.size)
        assertEquals(5L, gains.single().entries.single().count)
        assertEquals(
            mapOf("fuchuan" to 5L),
            inventory.acquired("owner", "main", "item", Instant.parse("2026-01-01T00:00:00Z"), Instant.now().plusSeconds(1)).acquired,
        )
        assertEquals(0, inventory.export("owner", "main", null, true, null, null).records.count { it.recordType == "resource_delta" })
    }

    @Test
    fun `zhuyu exchange is atomic idempotent and reversible`() {
        snapshot(
            "zhuyu-base",
            "2026-01-02T00:00:00Z",
            listOf(InventoryEntryRequest("baijinbi", count = 100), InventoryEntryRequest("zhuyu", count = 3)),
        )
        val command = request("zhuyu", ticket = "zhuyu", quantity = 2)
        val result = service.execute("owner", command)
        assertEquals(listOf(-2L, 100L), result.entries.map { it.count })
        assertEquals(result, service.execute("owner", command))
        assertEquals(1L, service.context("owner", "main").balances["zhuyu"])
        assertEquals(200L, service.context("owner", "main").balances["baijinbi"])
        assertCode("insufficient_inventory") { service.execute("owner", request("too-many", ticket = "zhuyu", quantity = 2)) }
        inventory.deleteRecord("owner", "main", result.recordId)
        assertEquals(3L, service.context("owner", "main").balances["zhuyu"])
        assertEquals(100L, service.context("owner", "main").balances["baijinbi"])
        inventory.restoreRecord("owner", "main", result.recordId)
        assertEquals(1L, service.context("owner", "main").balances["zhuyu"])
        assertEquals(200L, service.context("owner", "main").balances["baijinbi"])
    }

    @Test
    fun `durable retry returns original record without another deduction and changed bodies conflict`() {
        val command = request("retry")
        val result = service.execute("owner", command)
        assertEquals(result, service.execute("owner", command))
        assertEquals(9800L, service.context("owner", "main").balances["baijinbi"])
        assertEquals(2L, records.count())
        assertCode("record_conflict") { service.execute("owner", command.copy(quantity = 2)) }
        inventory.deleteRecord("owner", "main", result.recordId)
        assertCode("draw_resource_operation_deleted") { service.execute("owner", command) }
        inventory.restoreRecord("owner", "main", result.recordId)
        assertEquals(result, service.execute("owner", command))
    }

    @Test
    fun `invalid prices quantities unsupported rules and stale versions leave stock untouched`() {
        val original = service.context("owner", "main")
        listOf(
            request("bad-ticket", ticket = "zhuyu", action = "use", channel = "use"),
            request("zero", quantity = 0),
            request("fraction-pack", ticket = "fuchuan", channel = "monthly-shop", quantity = 11),
            request("special-pack", channel = "monthly-shop", quantity = 10),
            request("fake-price", channel = "discount"),
            request("overflow-cost", quantity = Int.MAX_VALUE.toLong()),
            request("wrong-action", action = "negative"),
            request("dispatch", action = "gain", channel = "派遣"),
        ).forEach { command ->
            assertEquals(422, assertThrows(InventoryApiException::class.java) { service.execute("owner", command) }.status.value())
        }
        assertCode("insufficient_inventory") { service.execute("owner", request("insufficient", quantity = 51)) }
        assertCode("insufficient_inventory") { service.execute("owner", request("empty-use", action = "use", channel = "use")) }
        assertCode("inventory_state_stale") {
            service.execute("owner", request("stale").copy(expectedInventoryRevision = 0))
        }
        assertCode("account_state_stale") { service.execute("owner", request("game").copy(game = "如鸢")) }
        assertEquals(original, service.context("owner", "main"))
        assertEquals(1L, records.count())
        assertEquals(0L, accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence)
    }

    @Test
    fun `unknown snapshot stock and destination overflow cannot deduct coins`() {
        template.dropCollection("inventory_current")
        assertCode("draw_resource_inventory_unknown") { service.execute("owner", request("unknown")) }
        snapshot(
            "max",
            "2026-01-02T00:00:00Z",
            listOf(
                InventoryEntryRequest("baijinbi", count = 10000),
                InventoryEntryRequest("tianjifuchuan", count = Int.MAX_VALUE.toLong()),
            ),
        )
        val before = service.context("owner", "main")
        assertEquals(422, assertThrows(InventoryApiException::class.java) { service.execute("owner", request("overflow")) }.status.value())
        assertEquals(before, service.context("owner", "main"))
    }

    @Test
    fun `owner account isolation and context reads never write`() {
        val count = records.count()
        val fence = accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence
        repeat(2) { service.context("owner", "main") }
        assertEquals(count, records.count())
        assertEquals(fence, accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence)
        assertEquals(404, assertThrows(InventoryApiException::class.java) { service.context("stranger", "main") }.status.value())
        assertEquals(
            404,
            assertThrows(InventoryApiException::class.java) {
                service.execute("stranger", request("foreign"))
            }.status.value(),
        )
        assertEquals(
            404,
            assertThrows(InventoryApiException::class.java) {
                service.execute("owner", request("missing").copy(accountId = "missing"))
            }.status.value(),
        )
    }

    @Test
    fun `failed record insertion rolls back stock revision and account fence`() {
        val failingRecords = mockk<InventoryRecordRepository>()
        every { failingRecords.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } answers {
            records.findByUserIdAndAccountIdAndRecordId(firstArg(), secondArg(), thirdArg())
        }
        every { failingRecords.insert(any<InventoryRecord>()) } throws IllegalStateException("forced insertion failure")
        val failingService = DrawResourceService(accounts, current, revisions, failingRecords, deleted, jacksonObjectMapper(), tx)
        val before = service.context("owner", "main")
        assertThrows(IllegalStateException::class.java) { failingService.execute("owner", request("rollback")) }
        assertEquals(before, service.context("owner", "main"))
        assertEquals(1L, records.count())
        assertEquals(0L, accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence)
    }

    @Test
    fun `whole exchange delete restore and later snapshot replay preserve both sides`() {
        val result = service.execute("owner", request("exchange", quantity = 10))
        inventory.deleteRecord("owner", "main", result.recordId)
        assertEquals(10000L, service.context("owner", "main").balances["baijinbi"])
        assertEquals(0L, service.context("owner", "main").balances["tianjifuchuan"])
        inventory.restoreRecord("owner", "main", result.recordId)
        assertEquals(8000L, service.context("owner", "main").balances["baijinbi"])
        val later = Instant.now().plusSeconds(5).toString()
        snapshot("later", later, listOf(InventoryEntryRequest("baijinbi", count = 7000), InventoryEntryRequest("tianjifuchuan", count = 8)))
        inventory.deleteRecord("owner", "main", result.recordId)
        inventory.restoreRecord("owner", "main", result.recordId)
        assertEquals(7000L, service.context("owner", "main").balances["baijinbi"])
        assertEquals(8L, service.context("owner", "main").balances["tianjifuchuan"])
    }

    @Test
    fun `dependent use blocks deleting its exchange and rolls back deleted backup`() {
        val exchange = service.execute("owner", request("exchange", quantity = 10))
        val use = service.execute("owner", request("use", action = "use", channel = "use", quantity = 10))
        // Force the supported Mongo millisecond tie to exercise revision ordering rather than random IDs.
        records.save(use.copy(effectiveAt = exchange.effectiveAt))
        val before = service.context("owner", "main")
        assertCode("resource_replay_conflict") { inventory.deleteRecord("owner", "main", exchange.recordId) }
        assertNotNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", exchange.recordId))
        assertNull(deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", exchange.recordId))
        assertEquals(before, service.context("owner", "main"))
        inventory.deleteRecord("owner", "main", use.recordId)
        inventory.restoreRecord("owner", "main", use.recordId)
        assertEquals(0L, service.context("owner", "main").balances["tianjifuchuan"])
    }

    @Test
    fun `same revision competing writes commit exactly once`() {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        val commands = listOf(request("race-a"), request("race-b"))
        try {
            val futures = commands.map { command ->
                pool.submit(
                    Callable {
                        start.await()
                        runCatching { service.execute("owner", command) }
                    },
                )
            }
            start.countDown()
            val results = futures.map { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertFalse(results.all { it.isSuccess })
            assertEquals(9800L, service.context("owner", "main").balances["baijinbi"])
            assertEquals(1L, service.context("owner", "main").balances["tianjifuchuan"])
            assertEquals(2L, records.count())
        } finally {
            pool.shutdownNow()
        }
    }

    private fun request(
        id: String,
        ticket: String = "tianjifuchuan",
        action: String = "exchange",
        channel: String = "standard",
        quantity: Long = 1,
    ) = DrawResourceRequest("main", "代号鸢", id, service.context("owner", "main").inventoryRevision, action, ticket, quantity, channel)

    private fun snapshot(id: String, time: String, entries: List<InventoryEntryRequest>) {
        inventory.import(
            "owner",
            InventoryImportRequest(
                "myshare-inventory-exchange",
                2,
                time,
                ProducerDto("test"),
                records = listOf(
                    InventoryRecordRequest(
                        recordId = id,
                        accountId = "main",
                        recordType = "stock_snapshot",
                        entityType = "item",
                        snapshotScope = "full",
                        effectiveAt = time,
                        entries = entries,
                    ),
                ),
            ),
        )
    }

    private fun assertCode(code: String, operation: () -> Unit) {
        assertEquals(code, assertThrows(InventoryApiException::class.java, operation).code)
    }
}
