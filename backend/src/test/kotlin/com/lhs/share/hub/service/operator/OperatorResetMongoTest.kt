package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.inventory.response.InventoryCatalogResponse
import com.lhs.share.hub.controller.operator.request.OperatorResetExecuteRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetPreviewRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetUndoRequest
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.InventoryRevisionRepositoryImpl
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorCurrentRepositoryImpl
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.OperatorResetTransactionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.OperatorRecord
import com.lhs.share.hub.repository.entity.OperatorRecordEntry
import com.lhs.share.hub.repository.entity.OperatorResetTransaction
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.inventory.InventoryService
import com.lhs.share.hub.service.star.StarStateService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
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
class OperatorResetMongoTest {
    private val database = TestMongo.database("reset")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val accounts = factory.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val operators = factory.getRepository(
        OperatorCurrentRepository::class.java,
        RepositoryFragments.just(OperatorCurrentRepositoryImpl(template)),
    )
    private val stock = factory.getRepository(InventoryCurrentRepository::class.java)
    private val records = factory.getRepository(InventoryRecordRepository::class.java)
    private val corrections = factory.getRepository(OperatorCorrectionRecordRepository::class.java)
    private val receipts = factory.getRepository(OperatorResetTransactionRepository::class.java)
    private val revisions = factory.getRepository(
        InventoryRevisionRepository::class.java,
        RepositoryFragments.just(InventoryRevisionRepositoryImpl(template)),
    )
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val catalog = mockk<OperatorCatalogService>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val base =
        OperatorCatalogEntity(
            operatorId = "op", name = "密探", rarity = 5,
            prof = listOf(
                "火",
            ),
            subProf = listOf("pojun"), games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
        )
    private fun service(recordRepository: InventoryRecordRepository = records) =
        OperatorResetService(accounts, catalog, operators, stock, revisions, recordRepository, corrections, receipts, events, tx)
    private val baseline = Instant.parse("2026-01-01T00:00:00Z")

    @BeforeEach
    fun seed() {
        accounts.save(SubAccount(userId = "owner", accountId = "main", name = "账号", game = "如鸢"))
        every { catalog.getOperator("op") } returns base
        every { catalog.getOperator("sp") } returns base.copy(operatorId = "sp", spOf = "op")
        every { catalog.spFormsOf("op") } returns listOf("sp")
        operators.save(
            OperatorCurrent(
                id = "owner:main:如鸢",
                userId = "owner",
                accountId = "main",
                game = "如鸢",
                fullBaselineAt = baseline,
                entries = mapOf(
                    "op" to
                        OperatorEntry(
                            level = 40,
                            elite = 2,
                            starLevel = 5,
                            revision = 7,
                            levelBreakthroughStage = 3,
                            combatStats = OperatorCombatStats(
                                manualAttack = 123,
                                oddities = mapOf(
                                    "attack" to OperatorOddityValue(12.0),
                                ),
                            ),
                        ),
                    "sp" to OperatorEntry(level = 40, elite = 2, starLevel = 0, revision = 8, levelBreakthroughStage = 3),
                ),
            ),
        )
        stock.save(InventoryCurrent(id = "stock", userId = "owner", accountId = "main", entityType = "item", fullBaselineAt = baseline))
        template.indexOps(
            OperatorResetTransaction::class.java,
        ).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("idempotencyKey", Sort.Direction.ASC).unique(),
        )
        template.indexOps(
            InventoryRecord::class.java,
        ).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("recordId", Sort.Direction.ASC).unique(),
        )
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun current() = operators.findByUserIdAndAccountIdAndGame("owner", "main", "如鸢")!!
    private fun inventory() = stock.findByUserIdAndAccountIdAndEntityType("owner", "main", "item")!!
    private fun preview() = OperatorResetPreviewRequest("main", "如鸢", "op")
    private fun execute(service: OperatorResetService = service(), key: String = "reset") =
        service.execute("owner", key, OperatorResetExecuteRequest("main", "如鸢", service.preview("owner", preview()).previewToken, true))
    private fun undo(service: OperatorResetService, id: String) =
        service.undo("owner", id, OperatorResetUndoRequest("main", "如鸢", service.undoPreview("owner", "main", "如鸢", id).previewToken))
    private fun code(expected: String, action: () -> Unit) =
        assertEquals(expected, assertThrows(OperatorApiException::class.java, action).code)

    @Test
    fun `inventory commit between preview reads cannot bind an old balance to a new revision`() {
        var changed = false
        val interleavedStock = object : InventoryCurrentRepository by stock {
            override fun findByUserIdAndAccountIdAndEntityType(userId: String, accountId: String, entityType: String): InventoryCurrent? {
                val snapshot = stock.findByUserIdAndAccountIdAndEntityType(userId, accountId, entityType)!!
                if (!changed) {
                    changed = true
                    tx.execute {
                        assertNotNull(revisions.compareAndIncrement(userId, accountId, 0L, Instant.now()))
                        stock.save(snapshot.copy(entries = snapshot.entries + ("bingshuquanjuan" to StockEntry(count = 5))))
                    }
                }
                return snapshot
            }
        }
        val service =
            OperatorResetService(accounts, catalog, operators, interleavedStock, revisions, records, corrections, receipts, events, tx)
        val stale = service.preview("owner", preview())
        assertEquals(0L, stale.resources.first { it.id == "bingshuquanjuan" }.balanceBefore)
        code("reset_inventory_conflict") {
            service.execute("owner", "stale", OperatorResetExecuteRequest("main", "如鸢", stale.previewToken, true))
        }
        assertEquals(0L, receipts.count())
        assertEquals(40, current().entries.getValue("op").level)
        assertEquals(5L, inventory().entries.getValue("bingshuquanjuan").count)
        val fresh = service.preview("owner", preview())
        val resource = fresh.resources.first { it.id == "bingshuquanjuan" }
        assertEquals(5L, resource.balanceBefore)
        assertEquals(70L, resource.balanceAfter)
        service.execute("owner", "fresh", OperatorResetExecuteRequest("main", "如鸢", fresh.previewToken, true))
        assertEquals(resource.balanceAfter, inventory().entries.getValue("bingshuquanjuan").count)
    }

    @Test
    fun `read and preview never write and reset undo survive service recreation with shared growth and exact refunds`() {
        val first = service()
        val original = current()
        assertTrue(first.preview("owner", preview()).blockers.isEmpty())
        assertTrue(first.history("owner", "main", "如鸢", "op", null).items.isEmpty())
        assertEquals(0L, receipts.count())
        assertEquals(0L, corrections.count())
        assertEquals(0L, accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence)
        val result = execute(first)
        assertEquals(setOf("op", "sp"), result.after.keys)
        assertTrue(current().entries.values.all { it.level == 1 && it.elite == 1 && it.levelBreakthroughStage == 0 })
        assertEquals(65L, inventory().entries["bingshuquanjuan"]!!.count)
        assertEquals(original.entries["op"]!!.combatStats, current().entries["op"]!!.combatStats)
        assertEquals(0, current().entries["sp"]!!.starLevel)
        assertEquals("resource_delta", records.findAll().single().recordType)
        val restarted = service()
        assertEquals(result.id, restarted.history("owner", "main", "如鸢", "sp", null).items.single().id)
        assertNotNull(undo(restarted, result.id).undoneAt)
        assertEquals(40, current().entries["op"]!!.level)
        assertEquals(3, current().entries["op"]!!.levelBreakthroughStage)
        assertEquals(2, current().entries["sp"]!!.elite)
        assertEquals(0L, inventory().entries["bingshuquanjuan"]!!.count)
        assertEquals(2L, records.count())
        assertNotNull(restarted.undo("owner", result.id, OperatorResetUndoRequest("main", "如鸢", "expired")).undoneAt)
        assertEquals(2L, records.count())
    }

    @Test
    fun `durable reset retries including after undo never apply twice and changed identity conflicts`() {
        val first = service()
        val request = OperatorResetExecuteRequest("main", "如鸢", first.preview("owner", preview()).previewToken, true)
        val result = first.execute("owner", "same", request)
        assertEquals(result.id, service().execute("owner", "same", request).id)
        code("idempotency_conflict") { first.execute("owner", "same", request.copy(previewToken = "different")) }
        undo(first, result.id)
        assertNotNull(service().execute("owner", "same", request).undoneAt)
        assertEquals(0L, inventory().entries["bingshuquanjuan"]!!.count)
    }

    @Test
    fun `unknown stocks future baselines and unknown breakthrough cannot be silently treated as zero`() {
        stock.save(inventory().copy(fullBaselineAt = null))
        assertTrue(service().preview("owner", preview()).blockers.any { it.contains("盘点") })
        stock.save(inventory().copy(fullBaselineAt = Instant.now().plusSeconds(30)))
        assertTrue(service().preview("owner", preview()).blockers.any { it.contains("尚未过去") })
        stock.save(inventory().copy(fullBaselineAt = baseline))
        operators.save(current().copy(entries = current().entries.mapValues { it.value.copy(levelBreakthroughStage = null) }))
        assertTrue(service().preview("owner", preview()).breakthroughRequired)
        assertTrue(service().preview("owner", preview().copy(levelBreakthroughStage = 4)).blockers.isEmpty())
        assertEquals(0L, receipts.count())
    }

    @Test
    fun `later unrelated gains survive undo but insufficient stock blocks the whole operation`() {
        val service = service()
        val result = execute(service)
        val entries = inventory().entries.toMutableMap()
        entries["bingshuquanjuan"] = entries.getValue("bingshuquanjuan").copy(count = 85)
        entries["unrelated"] = StockEntry(20)
        stock.save(inventory().copy(entries = entries))
        revisions.compareAndIncrement("owner", "main", 1, Instant.now())
        undo(service, result.id)
        assertEquals(20L, inventory().entries["bingshuquanjuan"]!!.count)
        assertEquals(20L, inventory().entries["unrelated"]!!.count)
        val next = execute(service, "again")
        stock.save(inventory().copy(entries = inventory().entries + ("bingshuquanjuan" to StockEntry(1))))
        val before = current()
        assertTrue(service.undoPreview("owner", "main", "如鸢", next.id).blockers.any { it.contains("不足") })
        code("reset_preview_expired") { undo(service, next.id) }
        assertEquals(before, current())
        assertNull(receipts.findById(next.id).get().undoneAt)
    }

    @Test
    fun `changed shared form or covered inventory blocks undo and old previews are rejected`() {
        val service = service()
        val result = execute(service)
        val token = service.undoPreview("owner", "main", "如鸢", result.id).previewToken
        operators.save(current().copy(entries = current().entries + ("sp" to current().entries.getValue("sp").copy(revision = 10))))
        assertTrue(service.undoPreview("owner", "main", "如鸢", result.id).blockers.any { it.contains("关联密探") })
        code("reset_operator_conflict") { service.undo("owner", result.id, OperatorResetUndoRequest("main", "如鸢", token)) }
        stock.save(inventory().copy(fullBaselineAt = Instant.now()))
        assertTrue(service.undoPreview("owner", "main", "如鸢", result.id).blockers.any { it.contains("盘点") })
        assertEquals(1L, records.count())
    }

    @Test
    fun `foreign owners accounts games and unconfirmed or invalid requests never mutate`() {
        val service = service()
        assertEquals(404, assertThrows(OperatorApiException::class.java) { service.preview("stranger", preview()) }.status.value())
        code("account_state_stale") { service.preview("owner", preview().copy(game = "代号鸢")) }
        code("invalid_reset") { service.preview("owner", preview().copy(refunds = mapOf("whip" to 1))) }
        code("invalid_reset") { service.execute("owner", "bad", OperatorResetExecuteRequest("main", "如鸢", "any", false)) }
        val result = execute(service)
        assertEquals(
            404,
            assertThrows(OperatorApiException::class.java) {
                service.undoPreview("stranger", "main", "如鸢", result.id)
            }.status.value(),
        )
        assertEquals(1L, receipts.count())
    }

    @Test
    fun `stock record insertion failure rolls back growth corrections inventory receipt and account fence`() {
        val failing = mockk<InventoryRecordRepository>()
        every { failing.insert(any<InventoryRecord>()) } throws IllegalStateException("forced failure")
        val before = current()
        assertThrows(IllegalStateException::class.java) { execute(service(failing)) }
        assertEquals(before, current())
        assertTrue(inventory().entries.isEmpty())
        assertEquals(0L, corrections.count())
        assertEquals(0L, receipts.count())
        assertNull(revisions.findByUserIdAndAccountId("owner", "main"))
        assertEquals(0L, accounts.findByUserIdAndAccountId("owner", "main")!!.recruitmentFence)
    }

    @Test
    fun `undo failure rolls back growth stock and receipt then exact retry succeeds`() {
        val original = execute()
        val before = current()
        val balance = inventory()
        val failing = mockk<InventoryRecordRepository>()
        every { failing.insert(any<InventoryRecord>()) } throws IllegalStateException("forced undo failure")
        val broken = service(failing)
        val request = OperatorResetUndoRequest("main", "如鸢", broken.undoPreview("owner", "main", "如鸢", original.id).previewToken)
        assertThrows(IllegalStateException::class.java) { broken.undo("owner", original.id, request) }
        assertEquals(before, current())
        assertEquals(balance, inventory())
        assertNull(receipts.findById(original.id).get().undoneAt)
        assertEquals(1L, revisions.findByUserIdAndAccountId("owner", "main")!!.revision)
        assertNotNull(undo(service(), original.id).undoneAt)
    }

    @Test
    fun `manual checked counts are frozen and a later baseline invalidates an already issued undo token`() {
        val service = service()
        val suggested = service.preview("owner", preview()).resources.associate { it.id to it.count }.toMutableMap()
        suggested["bingshuquanjuan"] = 61
        suggested["bingshucanjuan"] = 9
        val token = service.preview("owner", preview().copy(refunds = suggested)).previewToken
        val result = service.execute("owner", "manual", OperatorResetExecuteRequest("main", "如鸢", token, true))
        assertEquals(61L, inventory().entries["bingshuquanjuan"]!!.count)
        assertEquals(9L, result.refunds["bingshucanjuan"])
        val undoToken = service.undoPreview("owner", "main", "如鸢", result.id).previewToken
        stock.save(
            inventory().copy(
                entries =
                inventory().entries +
                    ("bingshuquanjuan" to inventory().entries.getValue("bingshuquanjuan").copy(listedBaselineAt = Instant.now())),
            ),
        )
        code("reset_inventory_conflict") { service.undo("owner", result.id, OperatorResetUndoRequest("main", "如鸢", undoToken)) }
        assertNull(receipts.findById(result.id).get().undoneAt)
    }

    @Test
    fun `linked stock records cannot be deleted independently`() {
        execute()
        val entities = mockk<EntityCatalogService>()
        every { entities.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        val inventory =
            InventoryService(
                accounts,
                stock,
                records,
                factory.getRepository(InventoryDeletedRecordRepository::class.java),
                entities,
                template,
                tx,
                revisions,
            )
        assertEquals(
            "reset_record_delete_forbidden",
            assertThrows(InventoryApiException::class.java) {
                inventory.deleteRecord("owner", "main", records.findAll().single().recordId)
            }.code,
        )
        assertEquals(1L, records.count())
    }

    @Test
    fun `ledger replay preserves growth and inventory after reset and undo at the same millisecond`() {
        val operatorRecords = factory.getRepository(OperatorRecordRepository::class.java)
        val snapshot = OperatorRecord(
            recordId = "test:baseline", userId = "owner", accountId = "main", recordType = "operator_snapshot",
            game = "如鸢", snapshotScope = "full", effectiveAt = baseline, receivedAt = baseline,
            producer = ProducerInfo("test"),
            entries = current().entries.map { (id, entry) ->
                OperatorRecordEntry(id = id, elite = entry.elite, starLevel = entry.starLevel, level = entry.level)
            },
        )
        operatorRecords.save(snapshot)
        val inventorySnapshot = InventoryRecord(
            recordId = "test:baseline", userId = "owner", accountId = "main", recordType = "stock_snapshot",
            entityType = "item", snapshotScope = "full", effectiveAt = baseline, receivedAt = baseline,
            producer = ProducerInfo("test"), entries = emptyList(),
        )
        records.save(inventorySnapshot)
        val result = execute()
        undo(service(), result.id)
        corrections.findAll().filter { ":undo:" in it.id.orEmpty() }.forEach {
            corrections.save(it.copy(createdAt = result.createdAt))
        }
        records.findAll().filter { ":undo" in it.recordId }.forEach {
            records.save(it.copy(effectiveAt = result.createdAt, receivedAt = result.createdAt))
        }
        operatorRecords.save(snapshot.copy(recordId = "test:delete", entries = emptyList()))
        OperatorService(
            accounts,
            operators,
            operatorRecords,
            mockk<OperatorCatalogRepository>(),
            catalog,
            tx,
            corrections,
            mockk<StarStateService>(relaxed = true),
        ).deleteRecord("owner", "main", "test:delete")
        assertTrue(current().entries.values.all { it.level == 40 && it.elite == 2 && it.levelBreakthroughStage == 3 })
        val entities = mockk<EntityCatalogService>()
        every { entities.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        records.save(inventorySnapshot.copy(recordId = "test:delete", entries = emptyList()))
        InventoryService(
            accounts,
            stock,
            records,
            factory.getRepository(InventoryDeletedRecordRepository::class.java),
            entities,
            template,
            tx,
            revisions,
        ).deleteRecord("owner", "main", "test:delete")
        assertTrue(inventory().entries.values.all { it.count == 0L })
        assertEquals(0L, inventory().entries["bingshuquanjuan"]!!.count)
    }

    @Test
    fun `competing resets on the same shared group commit once`() {
        val service = service()
        val token = service.preview("owner", preview()).previewToken
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = listOf("first", "second").map { key ->
                pool.submit(
                    Callable {
                        start.await()
                        runCatching { service.execute("owner", key, OperatorResetExecuteRequest("main", "如鸢", token, true)) }
                    },
                )
            }
            start.countDown()
            assertEquals(1, futures.map { it.get(30, TimeUnit.SECONDS) }.count { it.isSuccess })
            assertEquals(1L, receipts.count())
            assertEquals(65L, inventory().entries["bingshuquanjuan"]!!.count)
        } finally {
            pool.shutdownNow()
        }
    }
}
