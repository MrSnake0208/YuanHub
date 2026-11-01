package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorScanReview
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Tag("integration")
class OperatorScanReviewMongoTest {
    private val database = TestMongo.database("scanreview")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val reviews = MongoRepositoryFactory(template).getRepository(OperatorScanReviewRepository::class.java)
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `historical backlog is read without writes and completed once within its owner account and operator`() {
        val backlog = (1..112).map { review("old:$it", it.toLong()) }
        val latest = review("latest", 200)
        val otherScopes = listOf(
            review("latest", 200).copy(userId = "other"),
            review("latest", 200).copy(accountId = "other"),
            review("latest", 200).copy(operatorId = "other"),
        )
        reviews.insert(backlog + latest + otherScopes)
        val service = service()

        repeat(2) {
            val pending = service.listScanReviews("owner", "account")
            assertEquals(2, pending.size)
            assertEquals("latest", pending.single { it.operatorId == "op1" }.recordId)
            assertEquals(116L, reviews.count())
        }
        service.closeScanReview("owner", "account", "latest", "op1")
        service.closeScanReview("owner", "account", "latest", "op1")

        assertEquals(3L, reviews.count())
        assertEquals(
            emptyList<OperatorScanReview>(),
            reviews.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("owner", "account", "op1"),
        )
        assertEquals(1, service.listScanReviews("owner", "account").size)
    }

    @Test
    fun `closing an old review preserves newer records including one arriving after the query`() {
        reviews.insert(listOf(review("older", 1), review("selected", 2), review("newer", 3)))
        val interleaved = object : OperatorScanReviewRepository by reviews {
            override fun deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(
                userId: String,
                accountId: String,
                operatorId: String,
                recordIds: Collection<String>,
            ) {
                reviews.insert(review("arriving", 4))
                reviews.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(userId, accountId, operatorId, recordIds)
            }
        }
        service(interleaved).closeScanReview("owner", "account", "selected", "op1")
        service().closeScanReview("owner", "account", "selected", "op1")

        assertEquals(
            listOf("arriving", "newer"),
            reviews.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("owner", "account", "op1").map { it.recordId },
        )
        assertEquals("arriving", service().listScanReviews("owner", "account").single().recordId)
    }

    @Test
    fun `new pending scan replaces old records transactionally without touching other scopes`() {
        reviews.insert(
            listOf(review("old:1", 1), review("old:2", 2), review("old:1", 1).copy(accountId = "other")),
        )
        val service = service()

        repeat(2) { assertEquals(1, service.commitScan("owner", "account", scanDocument()).rejected) }

        val latest = reviews.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("owner", "account", "op1").single()
        assertEquals("scan:new", latest.recordId)
        assertEquals("scan:new", mapper.readTree(latest.document).path("records")[0].path("record_id").asText())
        assertEquals(2L, reviews.count())
    }

    @Test
    fun `failed replacement cleanup rolls back the newly saved pending result`() {
        reviews.insert(review("old", 1))
        val failing = object : OperatorScanReviewRepository by reviews {
            override fun deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(
                userId: String,
                accountId: String,
                operatorId: String,
                recordIds: Collection<String>,
            ) {
                error("injected cleanup failure")
            }
        }

        assertThrows(IllegalStateException::class.java) { service(failing).commitScan("owner", "account", scanDocument()) }

        assertEquals(listOf("old"), reviews.findAll().map { it.recordId })
    }

    private fun service(repository: OperatorScanReviewRepository = reviews): OperatorV3ImportService {
        val accounts = mockk<SubAccountRepository>()
        every { accounts.findByUserIdAndAccountId("owner", "account") } returns
            SubAccount(userId = "owner", accountId = "account", name = "isolated", game = "如鸢")
        val catalog = mockk<OperatorCatalogService>()
        every { catalog.getOperator("op1") } returns null
        val imports = mockk<OperatorV3ImportRecordRepository>()
        every { imports.findByUserIdAndAccountIdAndRecordId("owner", "account", "scan:new") } returns null
        return OperatorV3ImportService(
            mapper, OperatorV3SchemaValidator(mapper), accounts, catalog, mockk(relaxed = true),
            imports, mockk(relaxed = true), repository,
            transactionTemplate = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory)),
        )
    }

    private fun review(recordId: String, time: Long) = OperatorScanReview(
        userId = "owner", accountId = "account", operatorId = "op1", recordId = recordId, status = "review",
        document = "{}", warnings = emptyList(), blockingErrors = emptyList(), updatedAt = Instant.ofEpochSecond(time),
    )

    private fun scanDocument() = mapper.readTree(
        """
        {
          "format":"myshare-operator-exchange","version":3,"exported_at":"2026-10-23T10:30:00+08:00",
          "producer":{"platform":"collector","version":"1"},
          "accounts":[{"id":"local","name":"test","game_scope":"如鸢"}],
          "records":[{
            "account_id":"local","record_id":"scan:new","record_type":"operator_snapshot","game":"如鸢",
            "effective_at":"2026-10-23T10:30:00+08:00","snapshot_scope":"listed","source_kind":"scan",
            "entries":[{"operator_id":"op1","name":"test","level":90,"section_status":{"basic":"review"}}]
          }]
        }
        """.trimIndent(),
    )
}
