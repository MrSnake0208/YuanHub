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
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.repository.entity.WhiteCoinMail
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
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
@Tag("integration")
class MailboxClaimMongoTest {
    private val reserve = MailboxReserve(listOf(WhiteCoinMail(2, 65), WhiteCoinMail(1, 90)), 2, 1, Instant.parse("2026-10-22T00:00:00Z"))
    private val database = TestMongo.database("mail_claim")
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
    private val accountService = mockk<com.lhs.share.hub.service.account.SubAccountService>()
    private val historyRepository = factory.getRepository(com.lhs.share.hub.repository.MailboxReserveHistoryRepository::class.java)
    private val history = MailboxHistoryService(accountService, historyRepository, template, tx)
    private val service = MailboxClaimService(accounts, records, deleted, inventory, history, tx)
    private val mapper = jacksonObjectMapper()

    @BeforeEach
    fun seed() {
        every { accountService.requireAccount(any(), any()) } answers {
            accounts.findByUserIdAndAccountId(firstArg(), secondArg())
                ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "not found")
        }
        template.indexOps(com.lhs.share.hub.repository.entity.MailboxReserveHistory::class.java).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("version", Sort.Direction.ASC).unique(),
        )
        accounts.save(SubAccount(userId = "owner", accountId = "main", name = "Main", mailboxReserve = reserve))
        every { catalog.exists(any(), any()) } returns true
        every { catalog.catalog() } returns InventoryCatalogResponse(catalogVersion = "test", entities = emptyList())
        template.indexOps(InventoryRecord::class.java).ensureIndex(
            Index().on("userId", Sort.Direction.ASC).on("accountId", Sort.Direction.ASC).on("recordId", Sort.Direction.ASC).unique(),
        )
        snapshot("base", "2026-01-01T00:00:00Z")
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun body(operation: String = "receipt", version: Long = 1) =
        mapper.readTree("""{"expected_version":$version,"operation_id":"$operation"}""")

    private fun snapshot(id: String, time: String) = inventory.import(
        "owner",
        InventoryImportRequest(
            format = "myshare-inventory-exchange",
            version = 2,
            exportedAt = time,
            producer = ProducerDto("test"),
            records = listOf(
                InventoryRecordRequest(
                    accountId = "main",
                    recordId = id,
                    recordType = "stock_snapshot",
                    entityType = "item",
                    effectiveAt = time,
                    snapshotScope = "full",
                    entries = listOf(InventoryEntryRequest("baijinbi", count = 10000)),
                ),
            ),
        ),
    )

    private fun balance(id: String) = current.findByUserIdAndAccountIdAndEntityType("owner", "main", "item")!!.entries[id]?.count ?: 0L

    private fun selected(coins: String = "1,0", tickets: String = "1", operation: String = "partial", version: Long = 1) = mapper.readTree(
        """{"expected_version":$version,"operation_id":"$operation","selection":{"white_coin_mail_counts":[$coins],"fu_chuan_mail_count":$tickets}}""",
    )

    @Test
    fun `partial claim keeps unclaimed groups and retries cannot increase stock twice`() {
        val command = selected(operation = "a".repeat(64))
        val response = service.claim("owner", "main", command)
        assertEquals(listOf(1, 1), response.whiteCoinMails.map { it.count })
        assertEquals(listOf(65, 90), response.whiteCoinMails.map { it.coinsPerMail })
        assertEquals(1, response.fuChuanMailCount)
        assertEquals(10065L, balance("baijinbi"))
        assertEquals(3L, balance("fuchuan"))
        repeat(2) { service.claim("owner", "main", command) }
        assertEquals(10065L, balance("baijinbi"))
        val receipt = records.findAll().single { it.recordType == "reward_delta" }
        assertTrue(receipt.recordId.length <= 128)
        assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", selected("0,1", operation = "a".repeat(64))) }
        assertEquals(10065L, balance("baijinbi"))
        service.claim("owner", "main", selected("1,1", "1", version = 2))
        assertEquals(10220L, balance("baijinbi"))
        assertEquals(6L, balance("fuchuan"))
        assertEquals(listOf(0, 0), accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve!!.whiteCoinMails.map { it.count })
    }

    @Test
    fun `invalid selections cannot alter stock or reserves`() {
        listOf(
            selected("3,0"), selected("1"), selected("1,0,0"), selected("-1,0"), selected("0.5,0"),
            selected("0,0", "0"), selected(tickets = "3"), selected(tickets = "null"),
            mapper.readTree("""{"expected_version":1,"operation_id":"bad","selection":null}"""),
            mapper.readTree(
                """{"expected_version":1,"operation_id":"bad","selection":{"white_coin_mail_counts":[1,0],"fu_chuan_mail_count":1,"extra":1}}""",
            ),
        ).forEach { invalid -> assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", invalid) } }
        assertEquals(reserve, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve)
        assertEquals(10000L, balance("baijinbi"))
        assertEquals(1L, records.count())
    }

    @Test
    fun `claim atomically clears reserve and records real amounts and retries never apply twice`() {
        val response = service.claim("owner", "main", body())
        assertEquals(2L, response.version)
        assertEquals(listOf(0, 0), response.whiteCoinMails.map { it.count })
        assertEquals(0, response.fuChuanMailCount)
        assertEquals(10220L, balance("baijinbi"))
        assertEquals(6L, balance("fuchuan"))
        repeat(2) { service.claim("owner", "main", body()) }
        assertEquals(10220L, balance("baijinbi"))
        assertEquals(2L, records.count())
        val refilled = reserve.copy(version = 3)
        accounts.replaceMailboxReserve("owner", "main", 2, refilled)
        service.claim("owner", "main", body())
        assertEquals(refilled, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve)
        assertEquals(6L, balance("fuchuan"))
    }

    @Test
    fun `inventory failure rolls back reserve and leaves no partial receipt`() {
        every { catalog.exists("item", "fuchuan") } returns false
        assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", body()) }
        assertEquals(reserve, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve)
        assertEquals(10000L, balance("baijinbi"))
        assertEquals(0L, balance("fuchuan"))
        assertEquals(1L, records.count())
        assertEquals(0L, historyRepository.count())
    }

    @Test
    fun `ownership stale versions and invalid fields cannot mutate reserve or stock`() {
        for (owner in listOf("stranger", "owner")) {
            val account = if (owner == "owner") "missing" else "main"
            val error = assertThrows(InventoryApiException::class.java) { service.claim(owner, account, body()) }
            assertEquals(HttpStatus.NOT_FOUND, error.status)
        }
        for (invalid in listOf(
            """{"expected_version":1,"operation_id":"receipt","user_id":"stranger"}""",
            """{"expected_version":1.5,"operation_id":"receipt"}""",
            """{"expected_version":-1,"operation_id":"receipt"}""",
            """{"expected_version":1,"operation_id":""}""",
        )) {
            assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", mapper.readTree(invalid)) }
        }
        assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", body(version = 0)) }
        assertEquals(reserve, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve)
        assertEquals(1L, records.count())
    }

    @Test
    fun `parallel claims have one winner and retry confirms the same receipt`() {
        val start = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val results = pool.invokeAll(
                (1..2).map {
                    Callable {
                        start.await()
                        runCatching { service.claim("owner", "main", body()) }
                    }
                },
            ).map { it.get() }
            assertTrue(results.any { it.isSuccess })
            service.claim("owner", "main", body())
            assertEquals(10220L, balance("baijinbi"))
            assertEquals(6L, balance("fuchuan"))
            assertEquals(2L, records.count())
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `deleted claim requires explicit restore and newer baseline remains authoritative`() {
        snapshot("newer", Instant.now().plusSeconds(3600).toString())
        service.claim("owner", "main", body())
        assertEquals(10000L, balance("baijinbi"))
        assertEquals(0L, balance("fuchuan"))
        val id = "yuanhub:mail:1:receipt"
        inventory.deleteRecord("owner", "main", id)
        assertThrows(InventoryApiException::class.java) { service.claim("owner", "main", body()) }
        inventory.restoreRecord("owner", "main", id)
        service.claim("owner", "main", body())
        assertEquals(10000L, balance("baijinbi"))
        assertEquals(0, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve!!.fuChuanMailCount)
    }

    private fun historyPage(cursor: String? = null, limit: Int = 100) =
        history.list("owner", "main", Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"), cursor, limit)

    @Test
    fun `legacy reads are pure then claim preserves baseline and history with deleted status`() {
        repeat(2) {
            val page = historyPage()
            assertEquals(listOf(1L), page.entries.map { it.version })
            assertEquals("baseline", page.entries.single().kind)
            assertEquals(0L, historyRepository.count())
        }
        service.claim("owner", "main", selected())
        repeat(2) { service.claim("owner", "main", selected()) }
        assertEquals(2L, historyRepository.count())
        val first = historyPage(limit = 1)
        val second = historyPage(first.nextCursor, 1)
        assertEquals(listOf(1L, 2L), (first.entries + second.entries).map { it.version })
        assertEquals(null, second.nextCursor)
        val receipt = second.entries.single()
        assertEquals("claim", receipt.kind)
        assertEquals(false, receipt.claimDeleted)
        val marker = history.current("owner", "main")
        inventory.deleteRecord("owner", "main", receipt.recordId!!)
        assertEquals(true, historyPage().entries.last().claimDeleted)
        assertTrue(history.current("owner", "main").inventoryRevision!! > marker.inventoryRevision!!)
        assertEquals(1, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve!!.fuChuanMailCount)
        inventory.restoreRecord("owner", "main", receipt.recordId)
        assertEquals(false, historyPage().entries.last().claimDeleted)
        assertEquals(2L, historyRepository.count())
        assertThrows(InventoryApiException::class.java) { history.list("other", "main", Instant.EPOCH, Instant.now(), null, 10) }
        assertThrows(InventoryApiException::class.java) { historyPage("invalid!") }
        assertThrows(InventoryApiException::class.java) { historyPage(limit = 101) }
        assertThrows(InventoryApiException::class.java) { history.list("owner", "main", Instant.EPOCH, Instant.now(), first.nextCursor, 1) }
    }

    @Test
    fun `save creates zero baseline without reward and history failure rolls back all claim effects`() {
        accounts.save(SubAccount(userId = "owner", accountId = "empty", name = "Empty"))
        val saver = MailboxReserveService(accountService, accounts, history, tx)
        val zero = mapper.readTree("""{"expected_version":0,"white_coin_mails":[],"fu_chuan_mail_count":0}""")
        assertEquals(1L, saver.save("owner", "empty", zero).version)
        assertEquals(1L, historyRepository.count())
        assertEquals(1L, records.count())
        saver.save("owner", "empty", mapper.readTree("""{"expected_version":1,"white_coin_mails":[],"fu_chuan_mail_count":0}"""))
        assertEquals(1L, historyRepository.count())
        val failingHistory = mockk<MailboxHistoryService>()
        every { failingHistory.record(any(), any(), any(), any(), any(), any()) } throws IllegalStateException("history unavailable")
        val failingClaim = MailboxClaimService(accounts, records, deleted, inventory, failingHistory, tx)
        assertThrows(IllegalStateException::class.java) { failingClaim.claim("owner", "main", selected()) }
        assertEquals(reserve, accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve)
        assertEquals(10000L, balance("baijinbi"))
        assertEquals(1L, records.count())
        val failingSave = MailboxReserveService(accountService, accounts, failingHistory, tx)
        assertThrows(IllegalStateException::class.java) {
            failingSave.save("owner", "empty", mapper.readTree("""{"expected_version":1,"white_coin_mails":[],"fu_chuan_mail_count":1}"""))
        }
        assertEquals(0, accounts.findByUserIdAndAccountId("owner", "empty")!!.mailboxReserve!!.fuChuanMailCount)
    }

    @Test
    fun `history-only import changes report marker even without stock revision`() {
        val before = history.current("owner", "main")
        inventory.import(
            "owner",
            InventoryImportRequest(
                format = "myshare-inventory-exchange",
                version = 2,
                exportedAt = "2025-12-01T00:00:00Z",
                producer = ProducerDto("test"),
                records = listOf(
                    InventoryRecordRequest(
                        accountId = "main",
                        recordId = "old-reward",
                        recordType = "reward_delta",
                        entityType = "item",
                        effectiveAt = "2025-12-01T00:00:00Z",
                        entries = listOf(InventoryEntryRequest("baijinbi", count = 50)),
                    ),
                ),
            ),
        )
        val after = history.current("owner", "main")
        assertEquals(before.inventoryRevision, after.inventoryRevision)
        assertEquals(before.inventoryRecordCount!! + 1, after.inventoryRecordCount)
        assertEquals(10000L, balance("baijinbi"))
    }

    @Test
    fun `history cleanup is account scoped and duplicate versions are rejected`() {
        service.claim("owner", "main", selected())
        val entry = historyRepository.findAll().first()
        assertThrows(org.springframework.dao.DuplicateKeyException::class.java) { historyRepository.insert(entry.copy(id = null)) }
        historyRepository.insert(entry.copy(id = null, accountId = "other"))
        historyRepository.insert(entry.copy(id = null, userId = "other"))
        historyRepository.deleteAllByUserIdAndAccountId("owner", "main")
        assertEquals(2L, historyRepository.count())
        assertTrue(historyRepository.findAll().none { it.userId == "owner" && it.accountId == "main" })
    }

    @Test
    fun `concurrent adjustments commit one current value and one matching history`() {
        val saver = MailboxReserveService(accountService, accounts, history, tx)
        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val results = pool.invokeAll(
                (3..4).map { count ->
                    Callable {
                        barrier.await()
                        runCatching {
                            saver.save(
                                "owner",
                                "main",
                                mapper.readTree(
                                    """{"expected_version":1,"white_coin_mails":[],"fu_chuan_mail_count":$count}""",
                                ),
                            )
                        }
                    }
                },
            ).map { it.get() }
            assertEquals(1, results.count { it.isSuccess })
            val saved = accounts.findByUserIdAndAccountId("owner", "main")!!.mailboxReserve!!
            assertEquals(2L, saved.version)
            assertEquals(2L, historyRepository.count())
            val latest = historyPage().entries.last()
            assertEquals("adjustment", latest.kind)
            assertEquals(saved.fuChuanMailCount, latest.fuChuanMailCount)
            assertEquals(1L, records.count())
        } finally {
            pool.shutdownNow()
        }
    }
}
