package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryDeletedRecord
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

/** Uses only an owned disposable Mongo replica set and database. */
@Tag("integration")
class InventoryRestoreMongoTest {
    private val database = TestMongo.database("inventory")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val accounts = factory.getRepository(
        SubAccountRepository::class.java,
        org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val current = factory.getRepository(InventoryCurrentRepository::class.java)
    private val records = factory.getRepository(InventoryRecordRepository::class.java)
    private val deleted = factory.getRepository(InventoryDeletedRecordRepository::class.java)
    private val catalog = mockk<EntityCatalogService>()
    private val service = InventoryService(
        accounts,
        current,
        records,
        deleted,
        catalog,
        template,
        TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory)),
    )

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `first connection receipt survives fresh reads and isolates owner account source and effect`() {
        prepare()
        every { catalog.exists(any(), any()) } returns true
        val request = InventoryImportRequest(
            format = "myshare-inventory-exchange",
            version = 2,
            exportedAt = "2026-10-08T00:00:00Z",
            producer = ProducerDto("maayuan"),
            records = listOf(
                InventoryRecordRequest(
                    recordId = "connection:inventory",
                    accountId = "main",
                    recordType = "reward_delta",
                    entityType = "item",
                    effectiveAt = "2026-10-08T00:00:00Z",
                    entries = listOf(InventoryEntryRequest("baijinbi", count = 5)),
                ),
            ),
        )
        service.importFromConnection("owner", "main", "connection", request)
        val receipt = checkNotNull(service.firstConnectionSync("owner", "main", "connection"))
        assertEquals("connection:inventory", receipt.recordId)
        assertNotNull(receipt.receivedAt)
        assertNull(service.firstConnectionSync("other", "main", "connection"))
        assertNull(service.firstConnectionSync("owner", "other", "connection"))
        assertNull(service.firstConnectionSync("owner", "main", "other"))
        assertEquals(1, service.importFromConnection("owner", "main", "other", request).duplicates)
        assertNull(service.firstConnectionSync("owner", "main", "other"))
        records.save(receipt.copy(stockEffect = "history_only"))
        assertNull(service.firstConnectionSync("owner", "main", "connection"))
        records.save(receipt.copy(stockEffect = "superseded"))
        assertNull(service.firstConnectionSync("owner", "main", "connection"))
    }

    @Test
    fun `delete and restore persist original record and rebuilt current atomically`() {
        prepare()
        records.save(reward("reward", 5).copy(sourceConnectionId = "connection"))
        val original = checkNotNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "reward"))
        current.save(
            InventoryCurrent(
                userId = "owner",
                accountId = "main",
                entityType = "item",
                entries = mapOf("baijinbi" to StockEntry(5)),
            ),
        )

        service.deleteRecord("owner", "main", "reward")
        assertNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "reward"))
        assertNull(current.findByUserIdAndAccountIdAndEntityType("owner", "main", "item"))
        assertEquals(original, deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", "reward")?.record)

        service.restoreRecord("owner", "main", "reward")
        assertEquals(original, records.findByUserIdAndAccountIdAndRecordId("owner", "main", "reward"))
        assertEquals(5, current.findByUserIdAndAccountIdAndEntityType("owner", "main", "item")?.entries?.get("baijinbi")?.count)
        assertNull(deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", "reward"))
    }

    @Test
    fun `failed replay rolls back archived record deletion and current stock`() {
        prepare()
        records.save(reward("remove", 1))
        records.save(reward("remaining", 1))
        records.save(reward("consume", 3).copy(recordType = "consumption_delta"))
        current.save(
            InventoryCurrent(
                userId = "owner",
                accountId = "main",
                entityType = "item",
                entries = mapOf("baijinbi" to StockEntry(7)),
            ),
        )

        assertThrows(IllegalStateException::class.java) { service.deleteRecord("owner", "main", "remove") }
        assertNotNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "remove"))
        assertNull(deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", "remove"))
        assertEquals(7, current.findByUserIdAndAccountIdAndEntityType("owner", "main", "item")?.entries?.get("baijinbi")?.count)
    }

    @Test
    fun `failed restore leaves record archived and current stock untouched`() {
        prepare()
        deleted.save(
            InventoryDeletedRecord(
                userId = "owner",
                accountId = "main",
                recordId = "restore",
                record = reward("restore", 1),
            ),
        )
        records.save(reward("consume", 3).copy(recordType = "consumption_delta"))
        current.save(
            InventoryCurrent(
                userId = "owner",
                accountId = "main",
                entityType = "item",
                entries = mapOf("baijinbi" to StockEntry(7)),
            ),
        )

        assertThrows(IllegalStateException::class.java) { service.restoreRecord("owner", "main", "restore") }
        assertNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "restore"))
        assertNotNull(deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", "restore"))
        assertEquals(7, current.findByUserIdAndAccountIdAndEntityType("owner", "main", "item")?.entries?.get("baijinbi")?.count)
    }

    @Test
    fun `zero padding persists only in original records and remains filtered after restore`() {
        prepare()
        accounts.save(checkNotNull(accounts.findByUserIdAndAccountId("owner", "main")).copy(game = "如鸢"))
        every { catalog.exists(any(), any()) } returns true
        every { catalog.agentMatchesGame(any(), "如鸢") } answers { firstArg<String>() != "char_100_zhouzhong" }
        val snapshot = InventoryRecordRequest(
            accountId = "main",
            recordId = "padded",
            recordType = "stock_snapshot",
            entityType = "agent",
            snapshotScope = "full",
            effectiveAt = "2026-09-27T10:00:00Z",
            entries = listOf(
                InventoryEntryRequest("char_038_luxun", count = 4),
                InventoryEntryRequest("char_100_zhouzhong", "周忠", 0),
            ),
        )
        val request = InventoryImportRequest(
            format = "myshare-inventory-exchange",
            version = 2,
            exportedAt = "2026-09-27T11:00:00Z",
            producer = ProducerDto("test"),
            records = listOf(snapshot),
        )

        assertEquals(listOf("已忽略如鸢不支持的零值密探：周忠"), service.import("owner", "main", request).warnings)
        val original = checkNotNull(records.findByUserIdAndAccountIdAndRecordId("owner", "main", "padded"))
        assertEquals(snapshot.entries.map { RecordEntry(it.id, it.name, it.count) }, original.entries)
        assertEquals(setOf("char_038_luxun"), current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent")?.entries?.keys)
        assertEquals(1, service.import("owner", request).duplicates)

        val invalid = snapshot.copy(recordId = "nonzero", entries = snapshot.entries.map { it.copy(count = 1) })
        val validFirst = snapshot.copy(recordId = "valid-first", entries = listOf(InventoryEntryRequest("char_038_luxun", count = 9)))
        val error = assertThrows(InventoryApiException::class.java) {
            service.import("owner", request.copy(records = listOf(validFirst, invalid)))
        }
        assertEquals("agent_game_mismatch", error.code)
        assertEquals(1L, records.count())
        assertEquals(4, current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent")?.entries?.get("char_038_luxun")?.count)

        service.deleteRecord("owner", "main", "padded")
        assertNull(current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent"))
        assertEquals(original, deleted.findByUserIdAndAccountIdAndRecordId("owner", "main", "padded")?.record)
        service.restoreRecord("owner", "main", "padded")
        assertEquals(original, records.findByUserIdAndAccountIdAndRecordId("owner", "main", "padded"))
        assertEquals(setOf("char_038_luxun"), current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent")?.entries?.keys)
        assertEquals(4, current.findByUserIdAndAccountIdAndEntityType("owner", "main", "agent")?.entries?.get("char_038_luxun")?.count)
    }

    private fun prepare() {
        listOf("sub_accounts", "inventory_current", "inventory_records", "inventory_deleted_records").forEach {
            template.createCollection(it)
        }
        accounts.insert(SubAccount(userId = "owner", accountId = "main", name = "owned"))
    }

    private fun reward(id: String, count: Long) = InventoryRecord(
        recordId = id,
        userId = "owner",
        accountId = "main",
        recordType = "reward_delta",
        entityType = "item",
        effectiveAt = Instant.parse("2026-09-27T10:00:00Z"),
        producer = ProducerInfo("test"),
        entries = listOf(RecordEntry("baijinbi", count = count)),
    )
}
