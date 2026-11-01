package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCommandRequest
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentRequestRecord
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.junit.jupiter.api.parallel.Resources
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Owns a disposable replica-set DB; never uses application configuration or an existing service. */
@Tag("integration")
class RecruitmentMongoTest {
    private val database = TestMongo.database("recruitment")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val accounts = MongoRepositoryFactory(
        template,
    ).getRepository(SubAccountRepository::class.java, RepositoryFragments.just(SubAccountRepositoryImpl(template)))
    private val store = RecruitmentRepository(template)
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val operators = mockk<OperatorCatalogRepository>()
    private val catalogStore = RecruitmentCatalogRepository(template)
    private val catalog = RecruitmentCatalog(mapper, catalogStore, operators)
    private val mutation = RecruitmentMutation(store, catalog, mapper)
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val publisher = spyk(AccountEventService(mockk(relaxed = true), mockk(relaxed = true)))
    private val accountService = lifecycle(accounts)
    private val service = RecruitmentService(store, accountService, accounts, mutation, publisher, mapper, tx)

    @BeforeEach fun setup() {
        every { operators.findByOperatorId(any()) } returns null
        every { operators.count() } returns 0L
        every { operators.findAllByOrderByOperatorIdAsc() } returns emptyList()
        listOf(
            SubAccount::class.java,
            RecruitmentCatalogPool::class.java,
            RecruitmentArchive::class.java,
            RecruitmentEvent::class.java,
            RecruitmentBatch::class.java,
            RecruitmentRequestRecord::class.java,
        ).forEach { type ->
            template.createCollection(type)
            MongoPersistentEntityIndexResolver(template.converter.mappingContext).resolveIndexFor(type).forEach {
                template.indexOps(type).ensureIndex(it)
            }
        }
        template.insert(
            RecruitmentCatalogPool(
                "catalog_p",
                "如鸢",
                "管理员池",
                revision = 1,
                upAgents = listOf(RecruitmentUpAgent("catalog_p:up:A", "A")),
            ),
        )
        template.insert(RecruitmentCatalogPool("catalog_d", "代号鸢", "合成代号鸢卡池", revision = 1))
        accounts.insert(SubAccount(userId = "u", accountId = "a", name = "A", game = "如鸢"))
        accounts.insert(SubAccount(userId = "u", accountId = "b", name = "B", game = "如鸢"))
    }

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun request(revision: Long, operation: String, json: String, id: String = UUID.randomUUID().toString()) =
        RecruitmentCommandRequest("a", revision, id, operation, mapper.readTree(json))
    private fun command(operation: String, json: String) =
        service.command("u", request(store.archive("u", "a")?.archiveRevision ?: 0, operation, json))
    private fun initialize() {
        command("pool_create", """{"pool_id":"p","catalog_pool_id":"catalog_p","progress":0}""")
    }

    @Test fun `wishlist saves lazily with CAS and idempotency and isolates user and game account`() {
        template.insert(RecruitmentCatalogPool("wishlist", "如鸢", "心愿池", allowCustomUp = true))
        accounts.insert(SubAccount(userId = "other", accountId = "c", name = "C", game = "如鸢"))
        val input = request(
            0,
            "pool_records_save",
            """{"pool_id":"catalog:wishlist","remaining_pulls":null,"entries":[],"wish_agent_ids":["char_001_yangxiu","char_002_jiaxu"]}""",
            "wish-request",
        )
        val response = service.command("u", input)
        assertEquals(response, service.command("u", input))
        assertEquals(1L, service.archive("u", "a").archiveRevision)
        assertEquals(listOf("char_001_yangxiu", "char_002_jiaxu"), store.archive("u", "a")!!.pools.single().wishAgentIds)
        val projected = service.archive("u", "a")
        assertEquals(
            listOf("char_001_yangxiu", "char_002_jiaxu"),
            projected.pools.single {
                it.poolId == "catalog:wishlist"
            }.snapshot.upAgentIds,
        )
        assertEquals(
            mapOf("char_001_yangxiu" to 0L, "char_002_jiaxu" to 0L),
            projected.poolSummaries.getValue("catalog:wishlist").upAgentCounts,
        )
        assertTrue(service.archive("u", "b").pools.all { it.wishAgentIds.isEmpty() })
        assertTrue(service.archive("other", "c").pools.all { it.wishAgentIds.isEmpty() })
        assertThrows(RecruitmentApiException::class.java) { service.command("u", input.copy(requestId = "stale")) }
        assertThrows(InventoryApiException::class.java) { service.command("other", input.copy(requestId = "foreign")) }
        assertNull(store.archive("other", "a"))
        assertThrows(RecruitmentApiException::class.java) {
            service.command(
                "u",
                request(
                    1,
                    "pool_records_save",
                    """{"pool_id":"catalog:wishlist","remaining_pulls":1,"entries":[{"event_id":"bad","agent_id":"char_001_yangxiu","pull_span":17}],"wish_agent_ids":["char_001_yangxiu","char_043_xiaoqiao"]}""",
                ),
            )
        }
        assertEquals(1L, store.archive("u", "a")!!.archiveRevision)
        assertNull(store.event("u", "a", "bad"))
    }

    @Test fun `four star summary counts acquisitions without unknown interval or pity changes and isolates accounts`() {
        initialize()
        command("progress_set", """{"pool_id":"p","progress":9}""")
        command(
            "event_create",
            """{"pool_id":"p","mode":"current","entries":[{"agent_id":"char_043_xiaoqiao","pull_span":null}]}""",
        )
        val archive = service.archive("u", "a")
        assertEquals(9L, archive.summary.knownTotalPulls)
        assertEquals(1L, archive.summary.eventCount)
        assertEquals(1L, archive.summary.fourStarCount)
        assertEquals(0L, archive.summary.unknownEventCount)
        assertEquals(0L, archive.summary.exactEventCount)
        assertFalse(archive.summary.hasUnknown)
        assertEquals(1L, archive.poolSummaries.getValue("p").fourStarCount)
        assertEquals(0L, service.archive("u", "b").summary.fourStarCount)
    }
    private fun lifecycle(repository: SubAccountRepository) = SubAccountService(
        repository, mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
        mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
        mockk(relaxed = true), tx, recruitmentRepository = store, accountEvents = publisher,
    )

    @Test fun `UP summaries aggregate live results across pools with owner isolation and stable slot binding`() {
        val managed = template.findById("catalog_p", RecruitmentCatalogPool::class.java)!!
        template.save(
            managed.copy(
                upAgents = listOf(
                    RecruitmentUpAgent("catalog_p:up:A", "A", operatorId = "formal-a"),
                    RecruitmentUpAgent("catalog_p:up:B", "占位B"),
                    RecruitmentUpAgent("catalog_p:up:C", "C"),
                    RecruitmentUpAgent("catalog_p:up:retired", "退役", active = false),
                ),
            ),
        )
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null},{"event_id":"repeat","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        command(
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"batch","total_pull_count":20,"entries":[{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":10}]}""",
        )
        val seed = store.event("u", "a", "A")!!
        fun insert(id: String, agent: String, owner: String = "u", account: String = "a", pool: String = "p") {
            store.insertEvent(
                seed.copy(
                    id = "$owner:$account:$id",
                    userId = owner,
                    accountId = account,
                    eventId = id,
                    poolId = pool,
                    agentSnapshot = RecruitmentAgentSnapshot(agent, agent),
                ),
            )
        }
        insert("legacy", "formal-a")
        insert("off", "non-up")
        insert("retired", "catalog_p:up:retired")
        insert("other-account", "catalog_p:up:A", account = "b")
        insert("other-owner", "catalog_p:up:A", owner = "other")
        insert("other-pool", "catalog_p:up:A", pool = "other-pool")
        val before = store.archive("u", "a")!!
        fun counts() = service.archive("u", "a").poolSummaries.getValue("p").upAgentCounts
        assertEquals(mapOf("catalog_p:up:A" to 3L, "catalog_p:up:B" to 1L, "catalog_p:up:C" to 0L), counts())
        assertEquals(1L, store.poolAgentCounts("u", "b").getValue("p").getValue("catalog_p:up:A"))
        assertEquals(before, store.archive("u", "a"))
        command("event_delete", """{"event_id":"A"}""")
        assertEquals(2L, counts()?.get("catalog_p:up:A"))
        command("event_restore", """{"event_id":"A"}""")
        assertEquals(3L, counts()?.get("catalog_p:up:A"))
        command("batch_delete", """{"batch_id":"batch","confirm_total_pull_count":20}""")
        assertEquals(0L, counts()?.get("catalog_p:up:B"))
        command("batch_restore", """{"batch_id":"batch"}""")
        assertEquals(1L, counts()?.get("catalog_p:up:B"))
        val emptyPool = service.archive("u", "b").pools.single().poolId
        assertEquals(
            mapOf("catalog_p:up:A" to 0L, "catalog_p:up:B" to 0L, "catalog_p:up:C" to 0L),
            service.archive("u", "b").poolSummaries.getValue(emptyPool).upAgentCounts,
        )
    }

    @Test fun `first archive computes all gold statistics with stable order isolation and no read writes`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"seed","agent_id":"catalog_p:up:A","pull_span":39}]}""",
        )
        val seed = store.event("u", "a", "seed")!!
        store.saveEvent(seed.copy(pullSpan = 999, deletedAt = seed.createdAt))
        template.insert(RecruitmentBatch("u:a:batch", "u", "a", "batch", "p", 999))
        // Reverse insertion and duplicate sortOrder require the same eventId tie-break as event pagination.
        (0 until 120).reversed().forEach { index ->
            val id = "e" + index.toString().padStart(3, '0')
            store.insertEvent(
                seed.copy(
                    id = "u:a:$id",
                    eventId = id,
                    sortOrder = (index / 2).toLong(),
                    upStatus = if (index % 3 == 0) "non_up" else "up",
                    pullSpan = when (index % 3) {
                        0 -> 39
                        1 -> 38
                        else -> null
                    },
                    batchId = if (index % 3 == 1) "batch" else null,
                ),
            )
        }
        store.insertEvent(
            seed.copy(id = "u:a:four", eventId = "four", agentSnapshot = seed.agentSnapshot.copy(rarity = 4), upStatus = "unknown"),
        )
        store.insertEvent(seed.copy(id = "u:b:foreign", accountId = "b", eventId = "foreign", pullSpan = 99, upStatus = "unknown"))
        store.insertEvent(seed.copy(id = "other:a:foreign", userId = "other", eventId = "foreign", pullSpan = 777, upStatus = "unknown"))
        store.insertEvent(
            seed.copy(id = "u:a:other-pool", eventId = "other-pool", poolId = "other-pool", pullSpan = 1, upStatus = "unknown"),
        )
        val before = store.archive("u", "a")
        val eventsBefore = store.exchangeEvents("u", "a", 1000)
        val batchesBefore = store.exchangeBatches("u", "a", 1000)
        repeat(2) {
            val archive = service.archive("u", "a")
            assertEquals(38.0, archive.summary.averageGoldPulls)
            assertEquals(0L, archive.summary.permanentKnownTotalPulls)
            assertEquals("catalog_p:up:A", archive.summary.mostObtainedGoldAgents?.single()?.agentId)
            assertEquals(121L, archive.summary.mostObtainedGoldAgents?.single()?.count)
            assertEquals(40L, archive.summary.mostNonUpGoldAgents?.single()?.count)
            val summary = archive.poolSummaries.getValue("p")
            assertEquals(38.5, summary.averageGoldPulls)
            assertEquals(50.0, summary.smallPityWinRate)
            assertEquals(121L, summary.eventCount)
            assertEquals(1L, summary.fourStarCount)
        }
        assertEquals(before, store.archive("u", "a"))
        assertEquals(eventsBefore, store.exchangeEvents("u", "a", 1000))
        assertEquals(batchesBefore, store.exchangeBatches("u", "a", 1000))
        val otherArchive = service.archive("u", "b")
        assertEquals(99.0, otherArchive.summary.averageGoldPulls)
        assertEquals(1L, otherArchive.summary.mostObtainedGoldAgents?.single()?.count)
        val other = otherArchive.poolSummaries.values.single()
        assertNull(other.averageGoldPulls)
        assertNull(other.smallPityWinRate)
        assertThrows(InventoryApiException::class.java) { service.archive("not-owner", "a") }
        command("event_delete", """{"event_id":"e119"}""")
        assertEquals(49.4, service.archive("u", "a").poolSummaries.getValue("p").smallPityWinRate)
        command("event_restore", """{"event_id":"e119"}""")
        assertEquals(50.0, service.archive("u", "a").poolSummaries.getValue("p").smallPityWinRate)
    }

    @Test fun `dialog saves repeated agents counts and progress atomically and retries without duplication`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        val input = request(
            store.archive("u", "a")!!.archiveRevision,
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":12}]}""",
            "dialog-retry",
        )
        val first = service.command("u", input)
        assertEquals(first, service.command("u", input))
        assertEquals(2, store.poolEvents("u", "a", "p", 10).size)
        assertEquals(listOf(20L, 12L), service.page("u", "a", "p", null, 10, null, null, "asc").items.map { it.pullSpan })
        assertEquals(53L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(21L, service.archive("u", "a").pools.single().progress)
        assertEquals(2L, service.archive("u", "a").summary.eventCount)
        assertTrue(store.poolEvents("u", "b", "p", 10).isEmpty())
        assertThrows(InventoryApiException::class.java) { service.command("other", input) }
        command("pool_records_save", """{"pool_id":"p","remaining_pulls":19,"entries":[],"deleted_event_ids":["A"]}""")
        assertEquals(33L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(12L, store.event("u", "a", "B")!!.pullSpan)
    }

    @Test fun `dialog null pity saves five star results without inventing progress and retries without duplication`() {
        initialize()
        command("progress_set", """{"pool_id":"p","progress":null}""")
        val input = request(
            store.archive("u", "a")!!.archiveRevision,
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":null}]}""",
            "optional-pity-retry",
        )
        val first = service.command("u", input)
        assertEquals(first, service.command("u", input))
        val archive = service.archive("u", "a")
        assertNull(archive.pools.single().progress)
        assertEquals(20L, archive.summary.knownTotalPulls)
        assertEquals(2L, archive.summary.eventCount)
        assertEquals(1L, archive.summary.unknownEventCount)
        assertEquals(1, archive.summary.unknownProgressCount)
        assertTrue(archive.summary.hasUnknown)
        assertEquals(20.0, archive.poolSummaries.getValue("p").averageGoldPulls)
        assertEquals(first.archiveRevision, archive.archiveRevision)
        assertTrue(store.poolEvents("u", "b", "p", 10).isEmpty())
        assertThrows(InventoryApiException::class.java) { service.command("other", input) }
        assertEquals(archive.archiveRevision, service.archive("u", "a").archiveRevision)
    }

    @Test fun `dialog failure rolls back edits additions removals progress and account fence together`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":31}]}""",
        )
        val archive = store.archive("u", "a")!!
        val records = store.poolEvents("u", "a", "p", 10)
        val fence = accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence
        val failing = spyk(store)
        every { failing.insertRequest(any()) } throws IllegalStateException("synthetic dialog failure")
        val failureService = RecruitmentService(failing, accountService, accounts, mutation, publisher, mapper, tx)
        assertThrows(IllegalStateException::class.java) {
            failureService.command(
                "u",
                request(
                    archive.archiveRevision,
                    "pool_records_save",
                    """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"C","agent_id":"catalog_p:up:A","pull_span":12}],"deleted_event_ids":["B"],"ordered_event_ids":["C","A"]}""",
                    "failed-dialog",
                ),
            )
        }
        assertEquals(archive, store.archive("u", "a"))
        assertEquals(records, store.poolEvents("u", "a", "p", 10))
        assertNull(store.event("u", "a", "C"))
        assertNull(store.request("u", "a", "failed-dialog"))
        assertEquals(fence, accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence)
        verify(exactly = 0) {
            publisher.publish(
                "u",
                "a",
                "recruitment_changed",
                any(),
                match {
                    (it as Map<*, *>).entries.any { entry ->
                        entry.key == "archive_revision" && entry.value == archive.archiveRevision + 1
                    }
                },
            )
        }
    }

    @Test fun `administrator binding and retirement inherit personal facts without rewriting archive or event documents`() {
        initialize()
        command("progress_set", """{"pool_id":"p","progress":8}""")
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17,"note":"原始备注","acquired_date":"2026-10-01"}]}""",
        )
        val archive = store.archive("u", "a")!!
        val event = store.event("u", "a", "A")!!
        catalog.update(
            "admin",
            "catalog_p",
            RecruitmentCatalogWriteRequest(
                "catalog_p",
                "如鸢",
                "管理员池",
                1,
                upAgents = listOf(RecruitmentUpAgent("catalog_p:up:A", "占位", "char_001_yangxiu")),
            ),
        )
        assertEquals(archive, store.archive("u", "a"))
        assertEquals(event, store.event("u", "a", "A"))
        val shown = service.page("u", "a", "p", null, 10, null, null).items.single()
        assertEquals("杨修", shown.agentSnapshot.name)
        assertEquals("catalog_p:up:A", shown.agentSnapshot.agentId)
        assertEquals(17L, shown.pullSpan)
        assertEquals(event.acquiredDate, shown.acquiredDate)
        assertEquals("原始备注", shown.note)
        assertEquals(25L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(archive.archiveRevision, service.archive("u", "a").archiveRevision)
        catalog.update("admin", "catalog_p", RecruitmentCatalogWriteRequest("catalog_p", "如鸢", "管理员池", 2, upAgents = emptyList()))
        assertFalse(catalog.findPool("如鸢", "catalog_p")!!.upAgents.single().active)
        assertEquals("杨修", service.page("u", "a", "p", null, 10, null, null).items.single().agentSnapshot.name)
        assertThrows(RecruitmentApiException::class.java) {
            command("event_create", """{"pool_id":"p","mode":"historical","entries":[{"agent_id":"catalog_p:up:A","pull_span":17}]}""")
        }
        assertEquals(archive, store.archive("u", "a"))
        assertEquals(event, store.event("u", "a", "A"))
    }

    @Test fun `catalog CAS permits one concurrent administrator update and retains all retired identities`() {
        val input = RecruitmentCatalogWriteRequest("catalog_p", "如鸢", "更新", 1, upAgents = emptyList())
        val executor = Executors.newFixedThreadPool(2)
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        try {
            val results = (1..2).map { index ->
                executor.submit(
                    Callable {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching { catalog.update("admin$index", "catalog_p", input) }
                    },
                )
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            val completed = results.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, completed.count { it.isSuccess })
            assertEquals(409, (completed.single { it.isFailure }.exceptionOrNull() as RecruitmentApiException).status.value())
            val stored = catalog.findPool("如鸢", "catalog_p")!!
            assertEquals(2L, stored.revision)
            assertEquals("catalog_p:up:A", stored.upAgents.single().id)
            assertFalse(stored.upAgents.single().active)
            assertEquals(0L, template.getCollection("recruitment_archives").countDocuments())
            assertEquals(0L, template.getCollection("recruitment_events").countDocuments())
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun `real transaction consumes progress once retries old revision and preserves owner isolation`() {
        initialize()
        command("progress_set", """{"pool_id":"p","progress":21}""")
        val revision = store.archive("u", "a")!!.archiveRevision
        val input =
            request(
                revision,
                "event_create",
                """{"pool_id":"p","mode":"current","tail_progress":0,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":27}]}""",
                "retry",
            )
        val first = service.command("u", input)
        val retry = service.command("u", input)
        assertEquals(first, retry)
        assertEquals(27L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(0L, store.archive("u", "a")!!.pools.single().progress)
        assertEquals(1L, service.archive("u", "a").summary.eventCount)
        assertEquals(27L, service.archive("u", "a").poolSummaries.getValue("p").knownTotalPulls)
        assertEquals(0L, service.archive("u", "b").summary.knownTotalPulls)
        assertThrows(InventoryApiException::class.java) { service.archive("foreign", "a") }
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                service.command("u", input.copy(data = mapper.readTree("""{"baseline":1}""")))
            }.status.value(),
        )
        verify(exactly = 1) {
            publisher.publish(
                "u",
                "a",
                "recruitment_changed",
                any(),
                match {
                    (it as Map<*, *>).entries.any { entry -> entry.key == "archive_revision" && entry.value == first.archiveRevision }
                },
            )
        }
    }

    @Test fun `failure after event and archive writes rolls back every collection and fence`() {
        initialize()
        val previous = store.archive("u", "a")!!
        val fence = accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence
        val failing = spyk(store)
        every { failing.insertRequest(any()) } throws IllegalStateException("synthetic response storage failure")
        val failureService = RecruitmentService(failing, accountService, accounts, mutation, publisher, mapper, tx)
        assertThrows(IllegalStateException::class.java) {
            failureService.command(
                "u",
                request(
                    previous.archiveRevision,
                    "event_create",
                    """{"pool_id":"p","mode":"historical","entries":[{"event_id":"failed","agent_id":"catalog_p:up:A","pull_span":17}]}""",
                ),
            )
        }
        assertNull(store.event("u", "a", "failed"))
        assertEquals(previous, store.archive("u", "a"))
        assertEquals(fence, accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence)
        verify(exactly = 0) {
            publisher.publish(
                "u",
                "a",
                "recruitment_changed",
                any(),
                match {
                    (it as Map<*, *>).entries.any { entry ->
                        entry.key == "archive_revision" && entry.value == previous.archiveRevision + 1
                    }
                },
            )
        }
    }

    @Test fun `two writes with same expected revision have exactly one winner and no duplicate result`() {
        initialize()
        val ready = CountDownLatch(2)
        val competing = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean {
                ready.countDown()
                check(ready.await(10, TimeUnit.SECONDS))
                return accounts.fenceRecruitmentWrite(userId, accountId, expectedGame)
            }
        }
        val racing = RecruitmentService(store, accountService, competing, mutation, publisher, mapper, tx)
        val revision = store.archive("u", "a")!!.archiveRevision
        val executor = Executors.newFixedThreadPool(2)
        try {
            val calls = (1..2).map { index ->
                executor.submit(
                    Callable {
                        runCatching {
                            racing.command(
                                "u",
                                request(
                                    revision,
                                    "event_create",
                                    """{"pool_id":"p","mode":"historical","entries":[{"event_id":"e$index","agent_id":"catalog_p:up:A","pull_span":17}]}""",
                                ),
                            )
                        }
                    },
                )
            }.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, calls.count { it.isSuccess })
            assertTrue(calls.single { it.isFailure }.exceptionOrNull() is RecruitmentApiException)
            assertEquals(17L, service.archive("u", "a").summary.knownTotalPulls)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test fun `first recruitment write contends with game change and later tombstone locks game`() {
        val fenced = CountDownLatch(1)
        val release = CountDownLatch(1)
        val lifecycleAttempt = CountDownLatch(1)
        val holding = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean =
                accounts.fenceRecruitmentWrite(userId, accountId, expectedGame).also {
                    fenced.countDown()
                    check(release.await(10, TimeUnit.SECONDS))
                }
        }
        val competing = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean {
                lifecycleAttempt.countDown()
                return accounts.fenceRecruitmentWrite(userId, accountId, expectedGame)
            }
        }
        val firstWrite = RecruitmentService(store, accountService, holding, mutation, publisher, mapper, tx)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val write = executor.submit(
                Callable {
                    runCatching {
                        firstWrite.command("u", request(0, "pool_create", """{"pool_id":"p","catalog_pool_id":"catalog_p","progress":0}"""))
                    }
                },
            )
            assertTrue(fenced.await(10, TimeUnit.SECONDS))
            val gameChange = executor.submit(Callable { runCatching { lifecycle(competing).update("u", "a", null, "代号鸢") } })
            assertTrue(lifecycleAttempt.await(10, TimeUnit.SECONDS))
            release.countDown()
            assertTrue(write.get(15, TimeUnit.SECONDS).isSuccess)
            assertTrue(gameChange.get(15, TimeUnit.SECONDS).isFailure)
            assertEquals("如鸢", accounts.findByUserIdAndAccountId("u", "a")!!.game)
            command(
                "event_create",
                """{"pool_id":"p","mode":"historical","entries":[{"event_id":"e","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
            command("event_delete", """{"event_id":"e"}""")
            assertEquals(
                "recruitment_game_locked",
                assertThrows(InventoryApiException::class.java) {
                    accountService.update("u", "a", null, "代号鸢")
                }.code,
            )
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun `account deletion wins first-write race and leaves no recruitment orphan`() {
        val fenced = CountDownLatch(1)
        val release = CountDownLatch(1)
        val writing = CountDownLatch(1)
        val holding = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean =
                accounts.fenceRecruitmentWrite(userId, accountId, expectedGame).also {
                    fenced.countDown()
                    check(release.await(10, TimeUnit.SECONDS))
                }
        }
        val competing = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean {
                writing.countDown()
                return accounts.fenceRecruitmentWrite(userId, accountId, expectedGame)
            }
        }
        val race = RecruitmentService(store, accountService, competing, mutation, publisher, mapper, tx)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val deletion = executor.submit(Callable { runCatching { lifecycle(holding).delete("u", "a") } })
            assertTrue(fenced.await(10, TimeUnit.SECONDS))
            val create = executor.submit(
                Callable {
                    runCatching { race.command("u", request(0, "pool_create", """{"catalog_pool_id":"catalog_p","progress":0}""")) }
                },
            )
            assertTrue(writing.await(10, TimeUnit.SECONDS))
            release.countDown()
            assertTrue(deletion.get(15, TimeUnit.SECONDS).isSuccess)
            assertTrue(create.get(15, TimeUnit.SECONDS).isFailure)
            assertNull(accounts.findByUserIdAndAccountId("u", "a"))
            assertNull(store.archive("u", "a"))
            assertEquals(0L, template.getCollection("recruitment_requests").countDocuments())
            assertNotNull(accounts.findByUserIdAndAccountId("u", "b"))
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun `automatic catalog reads and filters are pure and first history write stays account scoped and idempotent`() {
        val exchange = RecruitmentExchangeService(store, accountService, accounts, service, catalog, publisher, mapper, tx)
        val visible = service.archive("u", "a")
        val id = visible.pools.single().poolId
        assertEquals("catalog_p", visible.pools.single().snapshot.catalogPoolId)
        assertNull(visible.pools.single().progress)
        assertTrue(service.page("u", "a", id, null, 10, null, null).items.isEmpty())
        assertTrue(service.batches("u", "a", id, null, 10).items.isEmpty())
        assertEquals(id, service.archive("u", "b").pools.single().poolId)
        assertNull(store.archive("u", "a"))
        assertNull(store.archive("u", "b"))
        assertTrue(exchange.export("u", "a").pools.isEmpty())
        assertFalse(store.hasSubstantiveData("u", "a"))
        assertEquals(0L, accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence)
        val input =
            request(
                0,
                "event_create",
                """{"pool_id":"$id","mode":"historical","entries":[{"event_id":"first","agent_id":"catalog_p:up:A","pull_span":17}]}""",
                "auto-first",
            )
        val result = service.command("u", input)
        assertEquals(result, service.command("u", input))
        assertEquals(id, store.archive("u", "a")!!.pools.single().poolId)
        assertEquals(17L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(listOf(id), exchange.export("u", "a").pools.map { it.poolId })
        assertEquals(0L, service.archive("u", "b").summary.knownTotalPulls)
        assertNull(store.archive("u", "b"))
        assertEquals(404, assertThrows(InventoryApiException::class.java) { service.archive("foreign", "a") }.status.value())
    }

    @Test fun `empty GETs are pure and zero baseline public pool preference permits game change`() {
        repeat(3) {
            service.archive("u", "a")
            service.page("u", "a", null, null, 10, null, null)
        }
        assertEquals(0L, template.getCollection("recruitment_archives").countDocuments())
        assertEquals(0L, accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence)
        command("baseline_set", """{"baseline":0}""")
        assertFalse(store.hasSubstantiveData("u", "a"))
        accountService.update("u", "a", null, "代号鸢")
        assertNull(store.archive("u", "a"))
        val id = catalog.catalog("代号鸢").path("pools").first().path("pool_id").asText()
        command("pool_create", """{"catalog_pool_id":"$id","progress":0}""")
        assertFalse(store.hasSubstantiveData("u", "a"))
        accountService.update("u", "a", null, "如鸢")
        assertFalse(service.archive("u", "a").gameMismatch)
        assertEquals(0L, service.archive("u", "a").archiveRevision)
    }

    @Test fun `atomic historical insertion persists across 100 item pages retries conflicts and isolated pools`() {
        initialize()
        val entries = (0..104).map { index ->
            mapper.createObjectNode().put("event_id", "e$index").put("agent_id", "catalog_p:up:A").put("pull_span", 1)
        }
        command("event_create", mapper.writeValueAsString(mapOf("pool_id" to "p", "mode" to "historical", "entries" to entries)))
        val otherCatalog = catalogStore.find("catalog_p")!!.copy(
            poolId = "catalog_q",
            upAgents = listOf(RecruitmentUpAgent("catalog_q:up:A", "A")),
        )
        assertTrue(catalogStore.save(otherCatalog))
        command("pool_create", """{"pool_id":"q","catalog_pool_id":"catalog_q","progress":9}""")
        command(
            "event_create",
            """{"pool_id":"q","mode":"historical","entries":[{"event_id":"other","agent_id":"catalog_q:up:A","pull_span":7}]}""",
        )
        val other = store.event("u", "a", "other")
        val old = service.page("u", "a", "p", null, 100, null, null, "asc")
        val before = service.archive("u", "a")
        val ids = (0..104).map { "e$it" }.toMutableList().also { it.add(50, "lu") }
        val data = mapper.writeValueAsString(
            mapOf(
                "pool_id" to "p",
                "remaining_pulls" to 40,
                "entries" to listOf(mapOf("event_id" to "lu", "agent_id" to "catalog_p:up:A", "pull_span" to null)),
                "ordered_event_ids" to ids,
            ),
        )
        val input = request(before.archiveRevision, "pool_records_save", data, "insert-middle")
        val receipt = service.command("u", input)
        assertEquals(receipt, service.command("u", input))
        val first = service.page("u", "a", "p", null, 100, null, null, "asc")
        val last = service.page("u", "a", "p", first.nextCursor, 100, null, null, "asc")
        assertEquals(ids, (first.items + last.items).map { it.eventId })
        assertNull(last.nextCursor)
        assertEquals(before.summary.knownTotalPulls, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(other, store.event("u", "a", "other"))
        assertTrue(store.poolEvents("u", "b", "p", 200).isEmpty())
        assertThrows(RecruitmentApiException::class.java) { service.page("u", "a", "p", old.nextCursor, 100, null, null, "asc") }
        assertThrows(RecruitmentApiException::class.java) { service.command("u", input.copy(requestId = "stale")) }
        assertThrows(InventoryApiException::class.java) { service.command("other", input) }
        assertEquals(106, store.poolEvents("u", "a", "p", 200).size)
    }

    @Test fun `concurrent dialog order changes allow exactly one revision winner`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"C","agent_id":"catalog_p:up:A","pull_span":20}]}""",
        )
        val revision = store.archive("u", "a")!!.archiveRevision
        val before = service.archive("u", "a").summary
        val orders = listOf(listOf("C", "A", "B"), listOf("B", "C", "A"))
        val executor = Executors.newFixedThreadPool(2)
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        try {
            val futures = orders.mapIndexed { index, ids ->
                executor.submit(
                    Callable {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching {
                            service.command(
                                "u",
                                request(
                                    revision,
                                    "pool_records_save",
                                    """{"pool_id":"p","remaining_pulls":null,"entries":[],"ordered_event_ids":${mapper.writeValueAsString(
                                        ids,
                                    )}}""",
                                    "order-$index",
                                ),
                            )
                        }
                    },
                )
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            val results = futures.map { it.get(20, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertEquals(409, (results.single { it.isFailure }.exceptionOrNull() as RecruitmentApiException).status.value())
            assertEquals(orders[results.indexOfFirst { it.isSuccess }], store.poolEvents("u", "a", "p", 10).map { it.eventId })
            assertEquals(before, service.archive("u", "a").summary)
            assertEquals(revision + 1, store.archive("u", "a")!!.archiveRevision)
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun `keyset pages are complete scoped and reject stale cursor after reorder`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":31},{"event_id":"C","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        val first = service.page("u", "a", "p", null, 2, null, null)
        val second = service.page("u", "a", "p", first.nextCursor, 2, null, null)
        assertEquals(listOf("C", "B", "A"), (first.items + second.items).map { it.eventId })
        val ascending = service.page("u", "a", "p", null, 2, null, null, "asc")
        val ascendingLast = service.page("u", "a", "p", ascending.nextCursor, 2, null, null, "asc")
        assertEquals(listOf("A", "B", "C"), (ascending.items + ascendingLast.items).map { it.eventId })
        assertNull(ascendingLast.nextCursor)
        assertThrows(RecruitmentApiException::class.java) { service.page("u", "a", "p", first.nextCursor, 2, null, null, "asc") }
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                service.page("u", "a", "p", null, 2, null, null, "invalid")
            }.status.value(),
        )
        assertThrows(RecruitmentApiException::class.java) { service.page("u", "b", null, first.nextCursor, 2, null, null) }
        command("event_reorder", """{"pool_id":"p","event_ids":["C","B","A"]}""")
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                service.page("u", "a", "p", first.nextCursor, 2, null, null)
            }.status.value(),
        )
        assertEquals(65L, service.archive("u", "a").summary.knownTotalPulls)
    }

    @Test fun `event keyset ID ties use the same direction as the primary order in both sorts`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":31},{"event_id":"C","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        template.updateMulti(
            org.springframework.data.mongodb.core.query.Query.query(
                org.springframework.data.mongodb.core.query.Criteria.where("userId").`is`("u").and("accountId").`is`("a"),
            ),
            org.springframework.data.mongodb.core.query.Update().set("sortOrder", 1L),
            RecruitmentEvent::class.java,
        )
        for ((order, expected) in listOf("asc" to listOf("A", "B", "C"), "desc" to listOf("C", "B", "A"))) {
            val first = service.page("u", "a", "p", null, 2, null, null, order)
            val last = service.page("u", "a", "p", first.nextCursor, 2, null, null, order)
            assertEquals(expected, (first.items + last.items).map { it.eventId })
            assertNull(last.nextCursor)
        }
    }

    @Test fun `Mongo aggregates batch total once through node deletion and complete batch delete undo`() {
        initialize()
        command(
            "batch_create",
            """{"batch_id":"batch","pool_id":"p","mode":"historical","total_pull_count":10,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null},{"event_id":"B","agent_id":"catalog_p:up:A","pull_span":null}]}""",
        )
        assertEquals(10L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(2L, service.archive("u", "a").poolSummaries.getValue("p").eventCount)
        command("event_delete", """{"event_id":"A"}""")
        assertEquals(10L, service.archive("u", "a").poolSummaries.getValue("p").knownTotalPulls)
        assertEquals(1L, service.archive("u", "a").summary.eventCount)
        val page = service.batches("u", "a", "p", null, 1)
        assertEquals("batch", page.items.single().batchId)
        assertEquals(store.archive("u", "a")!!.archiveRevision, page.archiveRevision)
        command("batch_delete", """{"batch_id":"batch","confirm_total_pull_count":10}""")
        assertEquals(0L, service.archive("u", "a").summary.knownTotalPulls)
        command("batch_restore", """{"batch_id":"batch"}""")
        assertEquals(10L, service.archive("u", "a").summary.knownTotalPulls)
        assertEquals(1L, service.archive("u", "a").summary.eventCount)
        assertNotNull(store.event("u", "a", "A")!!.deletedAt)
    }

    @Test fun `account cascade removes all recruitment scopes including tombstones and keeps other accounts`() {
        initialize()
        command(
            "batch_create",
            """{"batch_id":"batch","pool_id":"p","mode":"historical","total_pull_count":10,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null}]}""",
        )
        command("event_delete", """{"event_id":"A"}""")
        service.command("u", RecruitmentCommandRequest("b", 0, "other", "baseline_set", mapper.readTree("""{"baseline":55}""")))
        accountService.delete("u", "a")
        listOf("recruitment_archives", "recruitment_events", "recruitment_batches", "recruitment_requests").forEach {
            assertEquals(0L, template.getCollection(it).countDocuments(org.bson.Document("userId", "u").append("accountId", "a")))
        }
        assertEquals(55L, service.archive("u", "b").summary.knownTotalPulls)
        assertNotNull(store.request("u", "b", "other"))
        verify(exactly = 1) { publisher.publish("u", "a", "account_deleted", any(), any()) }
    }

    @Test fun `batch pagination handles tied dates keeps scopes and rejects old revision`() {
        initialize()
        (1..3).forEach { index ->
            command(
                "batch_create",
                """{"batch_id":"b$index","pool_id":"p","mode":"historical","total_pull_count":10,"entries":[{"agent_id":"catalog_p:up:A","pull_span":null}]}""",
            )
        }
        template.updateMulti(
            org.springframework.data.mongodb.core.query.Query(),
            org.springframework.data.mongodb.core.query.Update().set("createdAt", java.time.Instant.parse("2026-10-01T00:00:00Z")),
            RecruitmentBatch::class.java,
        )
        val first = service.batches("u", "a", "p", null, 2)
        val second = service.batches("u", "a", "p", first.nextCursor, 2)
        assertEquals(listOf("b3", "b2", "b1"), (first.items + second.items).map { it.batchId })
        assertNull(second.nextCursor)
        assertThrows(RecruitmentApiException::class.java) { service.batches("u", "b", null, first.nextCursor, 2) }
        command("baseline_set", """{"baseline":1}""")
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                service.batches("u", "a", "p", first.nextCursor, 2)
            }.status.value(),
        )
    }

    @Test fun `new public pool with unknown progress is not silently zero or preference-only`() {
        accountService.update("u", "a", null, "代号鸢")
        val id = catalog.catalog("代号鸢").path("pools").first().path("pool_id").asText()
        command("pool_create", """{"catalog_pool_id":"$id","progress":null}""")
        val archive = service.archive("u", "a")
        assertNull(archive.pools.single { it.snapshot.catalogPoolId == id }.progress)
        assertEquals(0L, archive.summary.knownTotalPulls)
        assertEquals(1, archive.summary.unknownProgressCount)
        assertTrue(archive.summary.hasUnknown)
        assertTrue(store.hasSubstantiveData("u", "a"))
        assertEquals(
            "recruitment_game_locked",
            assertThrows(InventoryApiException::class.java) {
                accountService.update("u", "a", null, "如鸢")
            }.code,
        )
    }

    @Test
    @ResourceLock(Resources.TIME_ZONE)
    fun `calendar dates are raw ISO strings and remain stable across server time zones`() {
        val originalZone = TimeZone.getDefault()
        val date = LocalDate.parse("2026-10-01")
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati"))
            template.save(catalogStore.find("catalog_p")!!.copy(startDate = date.minusDays(2), endDate = date.plusDays(2)))
            initialize()
            command(
                "event_create",
                """{"pool_id":"p","mode":"historical","entries":[{"event_id":"dated","agent_id":"catalog_p:up:A","pull_span":17,"acquired_date":"2026-10-01"}]}""",
            )
            val current = store.archive("u", "a")!!
            val snapshot = current.pools.single().snapshot.copy(startDate = date.minusDays(2), endDate = date.plusDays(2))
            assertTrue(
                store.saveArchive(
                    current.copy(
                        archiveRevision = current.archiveRevision + 1,
                        pools = listOf(current.pools.single().copy(snapshot = snapshot)),
                    ),
                    true,
                ),
            )
            store.saveEvent(store.event("u", "a", "dated")!!.copy(poolSnapshot = snapshot))
            val rawEvent = template.getCollection("recruitment_events").find(org.bson.Document("eventId", "dated")).first()!!
            assertEquals("2026-10-01", rawEvent["acquiredDate"])
            val rawSnapshot = rawEvent.get("poolSnapshot", org.bson.Document::class.java)
            assertEquals("2026-09-29", rawSnapshot["startDate"])
            assertEquals("2026-10-03", rawSnapshot["endDate"])
            val rawCatalog = template.getCollection("recruitment_catalog").find(org.bson.Document("_id", "catalog_p")).first()!!
            assertEquals("2026-09-29", rawCatalog["startDate"])
            assertEquals("2026-10-03", rawCatalog["endDate"])
            val rawArchive = template.getCollection("recruitment_archives").find(org.bson.Document("accountId", "a")).first()!!
            assertEquals(
                "2026-09-29",
                rawArchive.getList(
                    "pools",
                    org.bson.Document::class.java,
                ).single().get("snapshot", org.bson.Document::class.java)["startDate"],
            )
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"))
            assertEquals(date, store.event("u", "a", "dated")!!.acquiredDate)
            assertEquals(date.minusDays(2), store.archive("u", "a")!!.pools.single().snapshot.startDate)
            assertEquals(date.minusDays(2), catalogStore.find("catalog_p")!!.startDate)
            assertEquals(listOf("dated"), service.page("u", "a", "p", null, 10, date, date).items.map { it.eventId })
            assertTrue(service.page("u", "a", "p", null, 10, date.plusDays(1), date.plusDays(2)).items.isEmpty())
        } finally {
            TimeZone.setDefault(originalZone)
        }
    }

    @Test fun `date filtering pages mixed ISO and legacy BSON dates without rewriting unknown dates`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"old","agent_id":"catalog_p:up:A","pull_span":17,"acquired_date":"2026-10-01"},{"event_id":"iso","agent_id":"catalog_p:up:A","pull_span":17,"acquired_date":"2026-10-02"},{"event_id":"unknown","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        val date = LocalDate.of(2026, 10, 1)
        val legacyDate = Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant())
        val events = template.getCollection("recruitment_events")
        events.updateOne(org.bson.Document("eventId", "old"), org.bson.Document("\$set", org.bson.Document("acquiredDate", legacyDate)))
        assertEquals(date, store.event("u", "a", "old")!!.acquiredDate)
        assertEquals(listOf("old"), service.page("u", "a", "p", null, 10, date, date).items.map { it.eventId })
        assertEquals(listOf("iso", "old"), service.page("u", "a", "p", null, 10, date, null).items.map { it.eventId })
        assertEquals(listOf("old"), service.page("u", "a", "p", null, 10, null, date).items.map { it.eventId })
        val first = service.page("u", "a", "p", null, 1, date, date.plusDays(1))
        val second = service.page("u", "a", "p", first.nextCursor, 1, date, date.plusDays(1))
        assertEquals(listOf("iso", "old"), (first.items + second.items).map { it.eventId })
        assertNull(second.nextCursor)
        assertEquals(legacyDate, events.find(org.bson.Document("eventId", "old")).first()!!["acquiredDate"])
        assertNull(store.event("u", "a", "unknown")!!.acquiredDate)
    }

    @Test fun `account lifecycle SSE is emitted after commit and not after enclosing rollback`() {
        assertThrows(IllegalStateException::class.java) {
            tx.executeWithoutResult {
                accountService.update("u", "a", "changed", null)
                throw IllegalStateException("synthetic enclosing rollback")
            }
        }
        assertEquals("A", accounts.findByUserIdAndAccountId("u", "a")!!.name)
        verify(exactly = 0) { publisher.publish("u", "a", "account_updated", any(), any()) }
        accountService.update("u", "a", "changed", null)
        verify(exactly = 1) { publisher.publish("u", "a", "account_updated", any(), any()) }
    }

    @Test fun `catalog wishlist flag persists through rereads legacy omission and CAS`() {
        template.getCollection("recruitment_catalog").updateOne(
            org.bson.Document("_id", "catalog_p"),
            org.bson.Document("\$unset", org.bson.Document("allowCustomUp", "")),
        )
        val old = catalogStore.find("catalog_p")!!
        assertFalse(old.allowCustomUp)
        val request = RecruitmentCatalogWriteRequest(
            "catalog_p",
            "如鸢",
            "管理员池",
            1,
            upAgents = old.upAgents,
            allowCustomUp = true,
        )
        assertTrue(catalog.update("admin", "catalog_p", request).allowCustomUp)
        assertTrue(catalogStore.find("catalog_p")!!.allowCustomUp)
        assertTrue(catalog.listForAdmin().pools.single { it.poolId == "catalog_p" }.allowCustomUp)
        assertTrue(catalog.catalog("如鸢").path("pools").single().path("allow_custom_up").booleanValue())
        assertTrue(catalog.snapshot("如鸢", "catalog_p").allowCustomUp)

        catalog.update("admin", "catalog_p", request.copy(expectedRevision = 2, allowCustomUp = null))
        assertTrue(catalogStore.find("catalog_p")!!.allowCustomUp)
        assertEquals(3L, catalogStore.find("catalog_p")!!.revision)
        assertThrows(RecruitmentApiException::class.java) {
            catalog.update("stale", "catalog_p", request.copy(allowCustomUp = false))
        }
        assertTrue(catalogStore.find("catalog_p")!!.allowCustomUp)

        catalog.update("admin", "catalog_p", request.copy(expectedRevision = 3, allowCustomUp = false))
        assertFalse(catalogStore.find("catalog_p")!!.allowCustomUp)
        assertFalse(catalog.catalog("如鸢").path("pools").single().path("allow_custom_up").booleanValue())
        assertEquals(4L, catalogStore.find("catalog_p")!!.revision)
    }

    @Test fun `legacy Mongo hidden omission defaults false and catalog CAS persists visibility without restoring on old PUT`() {
        template.getCollection("recruitment_catalog").updateOne(
            org.bson.Document("_id", "catalog_p"),
            org.bson.Document("\$unset", org.bson.Document("hidden", "")),
        )
        val old = catalogStore.find("catalog_p")!!
        assertFalse(old.hidden)
        assertEquals(1, catalog.catalog("如鸢").path("pools").size())
        val request = com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest(
            "catalog_p",
            "如鸢",
            "修正池",
            1,
            upAgents = old.upAgents,
            hidden = true,
        )
        val next = catalog.update("admin", "catalog_p", request)
        assertTrue(catalogStore.find("catalog_p")!!.hidden)
        assertEquals(2L, next.revision)
        assertEquals("admin", catalogStore.find("catalog_p")!!.updatedBy)
        assertThrows(RecruitmentApiException::class.java) { catalog.update("other", "catalog_p", request.copy(hidden = false)) }
        catalog.update("admin", "catalog_p", request.copy(expectedRevision = 2, hidden = null, name = "继续修正"))
        assertTrue(catalogStore.find("catalog_p")!!.hidden)
        assertEquals(3L, catalogStore.find("catalog_p")!!.revision)
        assertTrue(service.archive("u", "b").pools.isEmpty())
        assertNull(store.archive("u", "b"))
    }

    @Test fun `hidden mixed request rolls back events progress revision request id and preserves owner history summaries`() {
        initialize()
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"old","agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        command("progress_set", """{"pool_id":"p","progress":7}""")
        val before = store.archive("u", "a")!!
        val event = store.event("u", "a", "old")!!
        template.save(catalogStore.find("catalog_p")!!.copy(hidden = true))
        val view = service.archive("u", "a")
        assertEquals(before.pools.single().poolId, view.pools.single().poolId)
        assertEquals(24L, view.summary.knownTotalPulls)
        assertEquals(1L, view.poolSummaries.getValue("p").upAgentCounts!!.getValue("catalog_p:up:A"))
        assertEquals("hidden", view.poolStates.getValue("p"))
        assertTrue(service.archive("u", "b").pools.isEmpty())
        val mixed = request(
            before.archiveRevision,
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"old","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":10}]}""",
            "mixed-hidden",
        )
        assertThrows(RecruitmentApiException::class.java) { service.command("u", mixed) }
        assertEquals(before, store.archive("u", "a"))
        assertEquals(event, store.event("u", "a", "old"))
        assertNull(store.event("u", "a", "new"))
        assertNull(store.request("u", "a", "mixed-hidden"))
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"old","agent_id":"catalog_p:up:A","pull_span":20}]}""",
        )
        assertEquals(41L, service.archive("u", "a").summary.knownTotalPulls)
    }

    @Test fun `missing legacy revision can be edited once and stale zero revision cannot overwrite it`() {
        template.getCollection("recruitment_catalog").updateOne(
            org.bson.Document("_id", "catalog_p"),
            org.bson.Document("\$unset", org.bson.Document("revision", "").append("hidden", "")),
        )
        val old = catalogStore.find("catalog_p")!!
        assertEquals(0L, old.revision)
        val request = com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest(
            "catalog_p",
            "如鸢",
            "修正旧池",
            0,
            upAgents = old.upAgents,
            hidden = true,
        )
        catalog.update("admin", "catalog_p", request)
        assertEquals(1L, catalogStore.find("catalog_p")!!.revision)
        assertTrue(catalogStore.find("catalog_p")!!.hidden)
        assertThrows(RecruitmentApiException::class.java) { catalog.update("other", "catalog_p", request.copy(hidden = false)) }
        assertTrue(catalogStore.find("catalog_p")!!.hidden)
    }
}
