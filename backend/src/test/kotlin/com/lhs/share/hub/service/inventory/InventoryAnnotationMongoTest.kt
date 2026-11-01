package com.lhs.share.hub.service.inventory

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
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
import java.time.LocalDate
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class InventoryAnnotationMongoTest {
    private val database = TestMongo.database("annotation")
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
    private val catalog = mockk<EntityCatalogService>()
    private val service = InventoryService(
        accounts,
        current,
        records,
        deleted,
        catalog,
        template,
        TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory)),
        revisions,
    )
    private val a = "char_001_yangxiu"
    private val b = "char_002_jiaxu"

    @BeforeEach
    fun seed() {
        accounts.save(SubAccount(userId = "owner", accountId = "main", name = "Main"))
        accounts.save(SubAccount(userId = "owner", accountId = "alt", name = "Alt"))
        accounts.save(SubAccount(userId = "other", accountId = "main", name = "Other"))
        every { catalog.exists(any(), any()) } returns true
        every { catalog.existsReadOnly(any(), any()) } returns true
        every { catalog.agentMatchesGame(any(), any()) } returns true
        every { catalog.agentMatchesGameReadOnly(any(), any()) } returns true
        every { catalog.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        template.indexOps(InventoryRecord::class.java).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("recordId", Sort.Direction.ASC).unique(),
        )
        service.import("owner", document(snapshot()))
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `preview is read only and accepted annotation retains complete report without changing stock or baselines`() {
        val request = document(reward())
        val stock = stock()
        val beforeRevision = revision()
        val beforeAccount = accounts.findByUserIdAndAccountId("owner", "main")
        repeat(2) {
            val preview = service.previewRewardAnnotations("owner", request)
            assertEquals(beforeRevision, preview.expectedInventoryRevision)
            assertEquals(listOf(a, b), preview.entries.map { it.id })
            assertEquals(listOf(true, true), preview.entries.map { it.historyOnly })
            assertEquals(true, preview.canConfirm)
        }
        assertEquals(beforeAccount, accounts.findByUserIdAndAccountId("owner", "main"))
        assertEquals(beforeRevision, revision())
        assertEquals(1L, records.count())
        val result = service.annotateRewards("owner", request, beforeRevision)
        assertEquals(1, result.historyOnly)
        assertEquals(stock, stock())
        assertEquals(beforeRevision + 1, revision())
        val stored = checkNotNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "annotation"))
        assertEquals("history_only", stored.stockEffect)
        assertEquals(20L, stored.staminaCost)
        assertEquals(listOf(3L, 2L), stored.entries.map { it.count })
        val summary = service.acquiredSummary("owner", "main", "agent", LocalDate.parse("2026-10-23"), LocalDate.parse("2026-10-24"), "UTC")
        assertEquals(3L, summary.items[a]?.acquired)
        assertEquals(2L, summary.items[b]?.acquired)
        assertEquals(1, summary.items[a]?.activeDays)
        val exported = service.export("owner", "main", null, true, null, null)
        assertEquals(2, exported.version)
        val exportedReward = exported.records.single { it.recordType == "reward_delta" }
        assertEquals("annotation", exportedReward.recordId)
        assertEquals(20L, exportedReward.staminaCost)
        assertEquals(listOf(3L, 2L), exportedReward.entries.map { it.count })
        assertEquals(1, service.annotateRewards("owner", request, beforeRevision).duplicates)
        assertEquals(beforeRevision + 1, revision())
        assertEquals(stock, stock())
        assertEquals(2L, records.count())
    }

    @Test
    fun `one uncovered fragment rejects all records and rolls back revision and account fence`() {
        service.deleteRecord("owner", "main", "baseline")
        service.import("owner", document(snapshot().copy(recordId = "partial", entries = listOf(InventoryEntryRequest(a, count = 10)))))
        val request = document(reward("covered").copy(entries = listOf(InventoryEntryRequest(a, count = 3))), reward("mixed"))
        val stock = stock()
        val revision = revision()
        val account = accounts.findByUserIdAndAccountId("owner", "main")
        val preview = service.previewRewardAnnotations("owner", request)
        assertFalse(preview.canConfirm)
        assertEquals(b, preview.entries.last().id)
        assertNull(preview.entries.last().baselineAt)
        val error = assertCode("annotation_baseline_missing") { service.annotateRewards("owner", request, revision) }
        assertEquals("mixed", error.recordId)
        assertEquals(b, error.entryId)
        assertEquals(stock, stock())
        assertEquals(revision, revision())
        assertEquals(account, accounts.findByUserIdAndAccountId("owner", "main"))
        assertNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "covered"))
        assertNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "mixed"))
    }

    @Test
    fun `late actual time cannot be forced to history and ordinary import still applies it`() {
        val request = document(reward().copy(effectiveAt = "2026-10-23T11:00:00Z"))
        assertFalse(service.previewRewardAnnotations("owner", request).canConfirm)
        val revision = revision()
        assertCode("annotation_would_change_stock") { service.annotateRewards("owner", request, revision) }
        assertEquals(revision, revision())
        assertEquals(1L, records.count())
        assertEquals(1, service.import("owner", request).accepted)
        assertEquals(13L, stock()?.entries?.get(a)?.count)
        assertCode("annotation_would_change_stock") { service.annotateRewards("owner", request, revision) }
    }

    @Test
    fun `same key changed body conflicts and partial duplicates validate only new records`() {
        val original = document(reward())
        service.annotateRewards("owner", original, revision())
        assertCode("record_conflict") {
            service.annotateRewards("owner", document(reward().copy(staminaCost = 21)), revision())
        }
        val before = revision()
        val result = service.annotateRewards("owner", document(reward(), reward("second")), before)
        assertEquals(1, result.duplicates)
        assertEquals(1, result.historyOnly)
        assertEquals(before + 1, revision())
        assertEquals(10L, stock()?.entries?.get(a)?.count)
        assertCode("annotation_would_change_stock") {
            service.annotateRewards("owner", document(reward(), reward("late").copy(effectiveAt = "2026-10-23T11:00:00Z")), revision())
        }
        assertEquals(3L, records.count())
    }

    @Test
    fun `owner account and game boundaries are checked without cross account writes`() {
        assertCode("unknown_account_id") { service.previewRewardAnnotations("intruder", document(reward())) }
        assertCode("annotation_baseline_missing") { service.annotateRewards("other", document(reward()), 0) }
        assertCode("annotation_baseline_missing") { service.annotateRewards("owner", document(reward().copy(accountId = "alt")), 0) }
        every { catalog.agentMatchesGame(any(), any()) } returns false
        assertCode("agent_game_mismatch") { service.annotateRewards("owner", document(reward()), revision()) }
        assertEquals(1L, records.count())
        assertNull(revisions.findByUserIdAndAccountId("other", "main"))
        assertNull(revisions.findByUserIdAndAccountId("owner", "alt"))
    }

    @Test
    fun `deleting baseline after preview invalidates revision and restoring follows existing replay semantics`() {
        val request = document(reward())
        val preview = service.previewRewardAnnotations("owner", request)
        service.deleteRecord("owner", "main", "baseline")
        assertCode("inventory_state_stale") { service.annotateRewards("owner", request, preview.expectedInventoryRevision) }
        assertEquals(0L, records.count())
        service.restoreRecord("owner", "main", "baseline")
        service.annotateRewards("owner", request, revision())
        service.deleteRecord("owner", "main", "baseline")
        assertEquals("applied", records.findByUserIdAndAccountIdAndRecordId("owner", "main", "annotation")?.stockEffect)
        assertEquals(3L, stock()?.entries?.get(a)?.count)
        service.restoreRecord("owner", "main", "baseline")
        // Replay applies the reward first, then the later snapshot resets the quantity.
        assertEquals("applied", records.findByUserIdAndAccountIdAndRecordId("owner", "main", "annotation")?.stockEffect)
        assertEquals(10L, stock()?.entries?.get(a)?.count)
    }

    @Test
    fun `new snapshot after preview rejects stale confirmation even if reward remains covered`() {
        val request = document(reward())
        val preview = service.previewRewardAnnotations("owner", request)
        service.import("owner", document(snapshot().copy(recordId = "new-baseline", effectiveAt = "2026-10-23T11:00:00Z")))
        val stock = stock()
        val revision = revision()
        assertCode("inventory_state_stale") { service.annotateRewards("owner", request, preview.expectedInventoryRevision) }
        assertEquals(stock, stock())
        assertEquals(revision, revision())
        assertNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "annotation"))
    }

    @Test
    fun `concurrent exact retries settle to one annotation and never require a new record key`() {
        val expected = revision()
        val stock = stock()
        val request = document(reward())
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = (1..2).map {
                pool.submit(
                    Callable {
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching { service.annotateRewards("owner", request, expected) }
                    },
                )
            }
            start.countDown()
            val results = futures.map { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.getOrNull()?.accepted == 1 })
            results.filter { it.isFailure }.forEach {
                assertEquals("annotation_result_unknown", (it.exceptionOrNull() as InventoryApiException).code)
            }
            assertEquals(1, service.annotateRewards("owner", request, expected).duplicates)
            assertEquals(expected + 1, revision())
            assertEquals(stock, stock())
            assertEquals(2L, records.count())
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `concurrent confirmations sharing a revision allow one report and never add stock`() {
        val revision = revision()
        val stock = stock()
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = (1..2).map { id ->
                pool.submit(
                    Callable {
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching { service.annotateRewards("owner", document(reward("concurrent-$id")), revision) }
                    },
                )
            }
            start.countDown()
            val results = futures.map { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            results.forEachIndexed { index, result ->
                if (result.isFailure) {
                    val error = result.exceptionOrNull() as InventoryApiException
                    assertEquals(true, error.code in setOf("inventory_state_stale", "annotation_result_unknown"))
                    assertCode("inventory_state_stale") {
                        service.annotateRewards("owner", document(reward("concurrent-${index + 1}")), revision)
                    }
                }
            }
            assertEquals(stock, stock())
            assertEquals(revision + 1, revision())
            assertEquals(2L, records.count())
        } finally {
            pool.shutdownNow()
        }
    }

    private fun stock(): InventoryCurrent? = current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent")

    private fun revision(): Long = revisions.findByUserIdAndAccountId("owner", "main")?.revision ?: 0L

    private fun assertCode(code: String, action: () -> Unit): InventoryApiException =
        assertThrows(InventoryApiException::class.java, action).also { assertEquals(code, it.code) }

    private fun snapshot() = reward("baseline").copy(
        recordType = "stock_snapshot",
        acquisitionChannel = null,
        staminaCost = null,
        effectiveAt = "2026-10-23T10:00:00Z",
        snapshotScope = "listed",
        entries = listOf(InventoryEntryRequest(a, count = 10), InventoryEntryRequest(b, count = 20)),
    )

    private fun reward(id: String = "annotation") = InventoryRecordRequest(
        "main",
        id,
        "reward_delta",
        "agent",
        "派遣-寿春",
        20,
        "2026-10-23T09:00:00Z",
        entries = listOf(InventoryEntryRequest(a, count = 3), InventoryEntryRequest(b, count = 2)),
    )

    private fun document(vararg items: InventoryRecordRequest) = InventoryImportRequest(
        "myshare-inventory-exchange",
        2,
        "2026-10-23T12:00:00Z",
        ProducerDto("yuanhub"),
        records = items.toList(),
    )
}
