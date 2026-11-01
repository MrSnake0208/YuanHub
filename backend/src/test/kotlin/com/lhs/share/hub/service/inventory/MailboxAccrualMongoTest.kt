package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
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
import com.lhs.share.hub.repository.MailboxReserveHistoryRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.MailboxDelivery
import com.lhs.share.hub.repository.entity.MailboxReserveHistory
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
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
import org.springframework.http.HttpStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.Callable
import java.util.concurrent.Executors

@Tag("integration")
class MailboxAccrualMongoTest {
    private val database = TestMongo.database("mail_accrual")
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
    private val historyRepository = factory.getRepository(MailboxReserveHistoryRepository::class.java)
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val accountService = mockk<SubAccountService>()
    private val catalog = mockk<EntityCatalogService>()
    private val history = MailboxHistoryService(accountService, historyRepository, template, tx)
    private var time = Instant.parse("2026-11-01T06:00:00Z")
    private val clock = object : Clock() {
        override fun instant(): Instant = time
        override fun getZone(): ZoneId = ZoneId.of("UTC")
        override fun withZone(zone: ZoneId): Clock = Clock.fixed(time, zone)
    }
    private val accrual = MailboxAccrualService(accounts, records, deleted, history, template, tx, clock)
    private val inventory = InventoryService(accounts, current, records, deleted, catalog, template, tx, revisions, accrual)
    private val service = MailboxReserveService(accountService, accounts, history, tx, clock, accrual)
    private val claims = MailboxClaimService(accounts, records, deleted, inventory, history, tx, accrual)
    private val mapper = jacksonObjectMapper()

    @BeforeEach
    fun seed() {
        every { accountService.requireAccount(any(), any()) } answers {
            accounts.findByUserIdAndAccountId(firstArg(), secondArg())
                ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        }
        every { catalog.exists(any(), any()) } returns true
        every { catalog.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        for (type in listOf(InventoryRecord::class.java, MailboxDelivery::class.java, MailboxReserveHistory::class.java)) {
            val index = Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC)
            when (type) {
                InventoryRecord::class.java -> index.on("recordId", Sort.Direction.ASC)
                MailboxDelivery::class.java -> index.on("type", Sort.Direction.ASC).on("day", Sort.Direction.ASC)
                else -> index.on("version", Sort.Direction.ASC)
            }
            template.indexOps(type).ensureIndex(index.unique())
        }
        accounts.save(SubAccount(userId = "owner", accountId = "a", name = "A"))
        accounts.save(SubAccount(userId = "owner", accountId = "b", name = "B"))
        accounts.save(SubAccount(userId = "other", accountId = "a", name = "Other"))
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun config(
        version: Long = 0,
        count: Int = 0,
        schedule: String = """{"start_date":"2026-11-01","end_date":"2026-11-03","coins_per_mail":90}""",
    ) = mapper.readTree(
        """{"expected_version":$version,"white_coin_mails":[{"count":$count,"coins_per_mail":90}],"fu_chuan_mail_count":0,"white_coin_schedule":$schedule,"fu_chuan_schedule":null}""",
    )
    private fun daily(day: String = "2026-11-01", amount: Long = 90) = InventoryImportRequest(
        "myshare-inventory-exchange",
        2,
        time.toString(),
        ProducerDto("yuanhub"),
        records = listOf(
            InventoryRecordRequest(
                "a",
                MailboxAccrualService.dailyId(day),
                "reward_delta",
                "item",
                effectiveAt = "${day}T06:00:00Z",
                entries = listOf(InventoryEntryRequest("baijinbi", count = amount)),
            ),
        ),
    )
    private fun claim(version: Long) = mapper.readTree("""{"expected_version":$version,"operation_id":"claim-test"}""")
    private fun balance(): Long = current.findByUserIdAndAccountIdAndEntityType("owner", "a", "item")?.entries?.get("baijinbi")?.count ?: 0L

    @Test
    fun `business boundary end inclusive offline catchup and pure reads`() {
        val saved = service.save("owner", "a", config())
        assertEquals(1, saved.whiteCoinMails.single().count)
        time = Instant.parse("2026-11-02T20:59:59Z")
        assertEquals(1, service.get("owner", "a").whiteCoinMails.single().count)
        assertEquals(2, accrual.sync("owner", "a").whiteCoinMails.single().count)
        time = Instant.parse("2026-11-02T21:00:00Z")
        assertEquals(3, accrual.sync("owner", "a").whiteCoinMails.single().count)
        val version = accrual.sync("owner", "a").version
        time = Instant.parse("2026-11-10T06:00:00Z")
        assertEquals(version, accrual.sync("owner", "a").version)
        assertEquals(3, template.findAll(MailboxDelivery::class.java).size)
        assertEquals(0L, balance())
        assertEquals(
            listOf("2026-11-01", "2026-11-02", "2026-11-03"),
            historyRepository.findAll().filter {
                it.kind == "accrual"
            }.sortedBy { it.version }.map { it.effectiveAt.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().toString() },
        )
    }

    @Test
    fun `daily record consumes mail atomically retry is duplicate and bulk does not consume it again`() {
        service.save("owner", "a", config(count = 2))
        inventory.import("owner", daily())
        assertEquals(90L, balance())
        assertEquals(2, service.get("owner", "a").whiteCoinMails.single().count)
        assertEquals(1, inventory.import("owner", daily()).duplicates)
        assertEquals(true, accrual.dailyStatus("owner", "a", "2026-11-01")["monthly_claimed"])
        val version = service.get("owner", "a").version
        claims.claim("owner", "a", claim(version))
        claims.claim("owner", "a", claim(version))
        assertEquals(270L, balance())
    }

    @Test
    fun `bulk claimed day cannot be claimed in daily entry and rollback preserves reserve`() {
        service.save("owner", "a", config())
        val before = service.get("owner", "a")
        assertThrows(InventoryApiException::class.java) { inventory.import("owner", daily(amount = 60)) }
        assertEquals(before.version, service.get("owner", "a").version)
        assertEquals("pending", template.findAll(MailboxDelivery::class.java).single().state)
        claims.claim("owner", "a", claim(before.version))
        assertThrows(InventoryApiException::class.java) { inventory.import("owner", daily()) }
        assertEquals(90L, balance())
    }

    @Test
    fun `manual correction disable resume never refills removed or paused days`() {
        service.save("owner", "a", config())
        val corrected = service.save("owner", "a", config(service.get("owner", "a").version, 0, "null"))
        assertEquals(0, corrected.whiteCoinMails.single().count)
        service.save("owner", "a", config(corrected.version))
        assertEquals(0, accrual.sync("owner", "a").whiteCoinMails.single().count)
        service.save("owner", "a", config(service.get("owner", "a").version, 0, "null"))
        time = Instant.parse("2026-11-03T06:00:00Z")
        val schedule = """{"start_date":"2026-11-03","end_date":"2026-11-03","coins_per_mail":90}"""
        service.save("owner", "a", config(service.get("owner", "a").version, 0, schedule))
        assertEquals(1, accrual.sync("owner", "a").whiteCoinMails.single().count)
        assertEquals(listOf("2026-11-01", "2026-11-03"), template.findAll(MailboxDelivery::class.java).map { it.day }.sorted())
    }

    @Test
    fun `existing daily receipt is not recreated as a pending mail and ownership is checked`() {
        inventory.import("owner", daily())
        service.save("owner", "a", config())
        assertEquals(0, service.get("owner", "a").whiteCoinMails.single().count)
        assertEquals(0, service.get("owner", "b").whiteCoinMails.size)
        assertEquals(0, service.get("other", "a").whiteCoinMails.size)
        assertThrows(InventoryApiException::class.java) { accrual.sync("stranger", "a") }
        assertThrows(InventoryApiException::class.java) { accrual.dailyStatus("stranger", "a", "2026-11-01") }
    }

    @Test
    fun `concurrent sync produces one delivery per day`() {
        service.save("owner", "a", config())
        time = Instant.parse("2026-11-03T06:00:00Z")
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = executor.invokeAll((1..2).map { Callable { accrual.sync("owner", "a") } }).map { it.get() }
            assertTrue(results.all { it.whiteCoinMails.single().count == 3 })
            assertEquals(3, template.findAll(MailboxDelivery::class.java).size)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `failed inventory import rolls back delivery consumption reserve and history`() {
        service.save("owner", "a", config())
        val before = service.get("owner", "a")
        val entries = historyRepository.count()
        every { catalog.exists(any(), any()) } returns false
        assertThrows(InventoryApiException::class.java) { claims.claim("owner", "a", claim(before.version)) }
        assertEquals(before, service.get("owner", "a"))
        assertEquals("pending", template.findAll(MailboxDelivery::class.java).single().state)
        assertEquals(entries, historyRepository.count())
        assertEquals(0L, balance())
    }
}
