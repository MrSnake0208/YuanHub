package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import java.time.Instant
import java.time.LocalDate
import java.util.Date

@Tag("integration")
class InventoryAcquiredSummaryMongoTest {
    private val database = TestMongo.database("inventory")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val accounts = MongoRepositoryFactory(template).getRepository(
        SubAccountRepository::class.java,
        org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val service = InventoryService(accounts, mockk(), mockk(), mockk(), mockk(), template, mockk())

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `aggregation uses all positive rewards and local active days with exclusive end and account isolation`() {
        accounts.insert(SubAccount(userId = "owner", accountId = "account", name = "isolated"))
        fun record(at: String, count: Int, type: String = "reward_delta", user: String = "owner", account: String = "account") = Document(
            mapOf(
                "userId" to user,
                "accountId" to account,
                "recordType" to type,
                "entityType" to "agent",
                "effectiveAt" to Date.from(Instant.parse(at)),
                "entries" to listOf(Document(mapOf("id" to "char_001_yangxiu", "count" to count))),
            ),
        )
        template.getCollection("inventory_records").insertMany(
            listOf(
                record("2026-09-11T15:59:59Z", 99), // Before start in Shanghai.
                record("2026-09-11T16:00:00Z", 2),
                record("2026-09-12T15:59:59Z", 3), // Same acquisition day as previous.
                record("2026-09-12T16:00:00Z", 7),
                record("2026-09-13T16:00:00Z", 99), // Exclusive end.
                record("2026-09-12T16:00:00Z", 99, "stock_snapshot"),
                record("2026-09-12T16:00:00Z", 99, "consumption_delta"),
                record("2026-09-12T16:00:00Z", 99, user = "other"),
                record("2026-09-12T16:00:00Z", 99, account = "other"),
                record("2026-09-12T16:00:00Z", -2),
            ) + (1..5001).map { record("2026-09-12T17:00:00Z", 1) },
        )
        val result = service.acquiredSummary(
            "owner",
            "account",
            "agent",
            LocalDate.parse("2026-09-12"),
            LocalDate.parse("2026-09-14"),
            "Asia/Shanghai",
        )
        assertEquals(5013L, result.items["char_001_yangxiu"]!!.acquired)
        assertEquals(2, result.items["char_001_yangxiu"]!!.activeDays)
        assertFalse(result.items.containsKey("_id"))
        assertThrows(InventoryApiException::class.java) {
            service.acquiredSummary(
                "other",
                "account",
                "agent",
                LocalDate.parse("2026-09-12"),
                LocalDate.parse("2026-09-14"),
                "Asia/Shanghai",
            )
        }
        assertThrows(InventoryApiException::class.java) {
            service.acquiredSummary("owner", "account", "agent", LocalDate.parse("2026-09-12"), LocalDate.parse("2026-09-14"), "invalid")
        }
    }

    @Test
    fun `local date boundaries account for daylight saving transition`() {
        accounts.insert(SubAccount(userId = "owner", accountId = "account", name = "isolated"))
        val result = service.acquiredSummary(
            "owner",
            "account",
            "agent",
            LocalDate.parse("2026-03-08"),
            LocalDate.parse("2026-03-09"),
            "America/New_York",
        )
        assertEquals(Instant.parse("2026-03-08T05:00:00Z"), result.from)
        assertEquals(Instant.parse("2026-03-09T04:00:00Z"), result.to)
    }
}
