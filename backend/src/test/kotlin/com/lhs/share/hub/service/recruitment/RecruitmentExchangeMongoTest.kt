package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCommandRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportCommitRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportOptions
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportPreviewRequest
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
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Only owned TestMongo replica-set connections; no application context or development data. */
@Tag("integration")
class RecruitmentExchangeMongoTest {
    private val database = TestMongo.database("recruit_exch")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val accounts = MongoRepositoryFactory(template).getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val store = RecruitmentRepository(template)
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val publisher = spyk(AccountEventService(mockk(relaxed = true), mockk(relaxed = true)))
    private val accountService = SubAccountService(
        accounts, mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
        mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
        mockk(relaxed = true), tx, recruitmentRepository = store, accountEvents = publisher,
    )
    private val directory = RecruitmentCatalogRepository(template)
    private val operators = mockk<OperatorCatalogRepository> {
        every { findByOperatorId(any()) } returns null
        every { count() } returns 0
        every { findAllByOrderByOperatorIdAsc() } returns emptyList()
    }
    private val catalog = RecruitmentCatalog(mapper, directory, operators)
    private val mutation = RecruitmentMutation(store, catalog, mapper)
    private val core = RecruitmentService(store, accountService, accounts, mutation, publisher, mapper, tx)
    private val service = RecruitmentExchangeService(store, accountService, accounts, core, catalog, publisher, mapper, tx)

    @BeforeEach fun setup() {
        listOf(
            SubAccount::class.java,
            RecruitmentArchive::class.java,
            RecruitmentEvent::class.java,
            RecruitmentBatch::class.java,
            RecruitmentRequestRecord::class.java,
            RecruitmentCatalogPool::class.java,
        ).forEach { type ->
            template.createCollection(type)
            MongoPersistentEntityIndexResolver(template.converter.mappingContext).resolveIndexFor(type).forEach {
                template.indexOps(type).ensureIndex(it)
            }
        }
        listOf("a", "b").forEach { accounts.insert(SubAccount(userId = "u", accountId = it, name = it, game = "如鸢")) }
        directory.save(
            RecruitmentCatalogPool(
                "test_pool",
                "如鸢",
                "管理员新池",
                revision = 1,
                upAgents = listOf(RecruitmentUpAgent("test_pool:up:A", "占位A")),
            ),
        )
    }

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }
    private fun command(accountId: String, operation: String, json: String) = core.command(
        "u",
        RecruitmentCommandRequest(
            accountId,
            store.archive("u", accountId)?.archiveRevision ?: 0,
            UUID.randomUUID().toString(),
            operation,
            mapper.readTree(json),
        ),
    )
    private fun initialize(accountId: String = "a") {
        command(accountId, "pool_create", """{"pool_id":"p","catalog_pool_id":"test_pool","progress":0}""")
    }
    private fun historical(accountId: String = "a", id: String = "E", span: Int = 17) = command(
        accountId,
        "event_create",
        """{"pool_id":"p","mode":"historical","entries":[{"event_id":"$id","agent_id":"test_pool:up:A","pull_span":$span,"acquired_date":"2026-09-30","note":"原始备注"}]}""",
    )
    private fun backup(): JsonNode = mapper.valueToTree(service.export("u", "a"))
    private fun prepared(
        node: JsonNode,
        target: String = "b",
        options: RecruitmentImportOptions = RecruitmentImportOptions(),
    ): RecruitmentImportCommitRequest {
        val preview = service.preview("u", RecruitmentImportPreviewRequest(target, node, options))
        return RecruitmentImportCommitRequest(
            target,
            node,
            options,
            preview.previewToken,
            preview.documentHash,
            preview.targetRevision,
            UUID.randomUUID().toString(),
        )
    }

    private fun simpleRecords(): JsonNode = mapper.readTree(
        """{"schema":"yuanhub.recruitment.import.v1","game":"如鸢","events":[{"event_id":"550e8400-e29b-41d4-a716-446655440000","catalog_pool_id":"test_pool","agent_id":"test_pool:up:A","pull_span":17}]}""",
    )

    @Test fun `permanent gold leaders preserve ties mapping deletion imports catalog history and owner isolation`() {
        val a = "char_001_yangxiu"
        val b = "char_002_jiaxu"
        val c = "char_003_sunshangxiang"
        val permanent = RecruitmentCatalogPool(
            "test_pool",
            "如鸢",
            "常驻样例",
            poolType = "permanent",
            upAgents = listOf(RecruitmentUpAgent("test_pool:up:A", "甲", a), RecruitmentUpAgent("test_pool:up:B", "乙", b)),
        )
        template.save(permanent)
        template.save(RecruitmentCatalogPool("limited", "如鸢", "限时样例", poolType = "limited"))
        template.save(
            RecruitmentCatalogPool("dated", "如鸢", "常驻池", poolType = "permanent", endDate = LocalDate.parse("2026-10-23")),
        )
        initialize()
        command(
            "a",
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A1","agent_id":"test_pool:up:A","pull_span":null},{"event_id":"A2","agent_id":"test_pool:up:A","pull_span":17},{"event_id":"B1","agent_id":"test_pool:up:B","pull_span":null},{"event_id":"B2","agent_id":"test_pool:up:B","pull_span":20}]}""",
        )
        command("a", "pool_create", """{"pool_id":"l","catalog_pool_id":"limited","progress":0}""")
        val limitedEntries = (0 until 10).joinToString(",") {
            """{"event_id":"C$it","agent_id":"$c","pull_span":null,"up_status":"non_up"}"""
        }
        command("a", "event_create", """{"pool_id":"l","mode":"historical","entries":[$limitedEntries]}""")
        command("a", "pool_create", """{"pool_id":"dated","catalog_pool_id":"dated","progress":0}""")
        val datedEntries = (0 until 3).joinToString(",") { """{"event_id":"D$it","agent_id":"$a","pull_span":null}""" }
        command("a", "event_create", """{"pool_id":"dated","mode":"historical","entries":[$datedEntries]}""")
        val seed = store.event("u", "a", "A1")!!
        store.insertEvent(seed.copy(id = "other:a:foreign-owner", userId = "other", eventId = "foreign-owner"))
        store.insertEvent(seed.copy(id = "u:c:foreign-account", accountId = "c", eventId = "foreign-account"))
        fun leaders(account: String = "a") = core.archive("u", account).summary.mostPermanentGoldAgents?.map { it.agentId to it.count }
        val tied = listOf(a to 2L, b to 2L)
        assertEquals(tied, leaders())
        val summary = core.archive("u", "a").summary
        assertEquals(c, summary.mostObtainedGoldAgents?.single()?.agentId)
        assertEquals(c to 10L, summary.mostNonUpGoldAgents?.single()?.let { it.agentId to it.count })
        assertThrows(InventoryApiException::class.java) { core.archive("other", "a") }

        val body = backup()
        val input = prepared(body)
        val imported = service.commit("u", input)
        assertEquals(tied, leaders("b"))
        val importedEvents = store.exchangeEvents("u", "b", 100)
        assertEquals(17, importedEvents.size)
        assertEquals(imported, service.commit("u", input))
        service.commit("u", prepared(body))
        assertEquals(importedEvents, store.exchangeEvents("u", "b", 100))
        assertEquals(tied, leaders("b"))

        // Emulate retained legacy data after import; importing new temporary identities stays forbidden.
        store.saveEvent(store.event("u", "a", "A2")!!.copy(agentSnapshot = RecruitmentAgentSnapshot("tmp_A", "临时甲", temporary = true)))
        template.save(store.archive("u", "a")!!.copy(temporaryAgents = listOf(RecruitmentTemporaryAgent("tmp_A", "临时甲", a, "甲"))))
        assertEquals(tied, leaders())
        command("a", "event_delete", """{"event_id":"A1"}""")
        val onlyB = listOf(b to 2L)
        assertEquals(onlyB, leaders())
        assertEquals(tied, leaders("b"))
        val before = store.archive("u", "a")
        val beforeEvents = store.exchangeEvents("u", "a", 100)
        listOf(permanent.copy(hidden = true), permanent.copy(enabled = false)).forEach { definition ->
            template.save(definition)
            assertEquals(onlyB, leaders())
            assertEquals(before, store.archive("u", "a"))
            assertEquals(beforeEvents, store.exchangeEvents("u", "a", 100))
        }
        template.remove(permanent)
        assertEquals(onlyB, leaders())
        assertEquals(before, store.archive("u", "a"))
        assertEquals(beforeEvents, store.exchangeEvents("u", "a", 100))
    }

    @Test fun `duplicate backup alias and pool create leave persisted history revision requests and notifications unchanged`() {
        initialize("b")
        historical("b")
        val before = store.archive("u", "b")
        val records = store.exchangeEvents("u", "b", 20_001)
        val batches = store.exchangeBatches("u", "b", 20_001)
        val requests = template.findAll(RecruitmentRequestRecord::class.java)
        val exported = service.export("u", "b")
        val alias = exported.copy(
            currentPoolId = "external",
            pools = exported.pools.map { it.copy(poolId = "external") },
            events = exported.events.map { it.copy(eventId = "external-event", poolId = "external") },
        )
        clearMocks(publisher, answers = false)
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                service.preview(
                    "u",
                    RecruitmentImportPreviewRequest("b", mapper.valueToTree(alias), RecruitmentImportOptions(confirmCountChange = true)),
                )
            }.status.value(),
        )
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                command("b", "pool_create", """{"pool_id":"external","catalog_pool_id":"test_pool","progress":0}""")
            }.status.value(),
        )
        assertEquals(before, store.archive("u", "b"))
        assertEquals(records, store.exchangeEvents("u", "b", 20_001))
        assertEquals(batches, store.exchangeBatches("u", "b", 20_001))
        assertEquals(requests, template.findAll(RecruitmentRequestRecord::class.java))
        assertEquals(17L, core.archive("u", "b").summary.knownTotalPulls)
        assertNull(store.archive("u", "a"))
        verify(exactly = 0) { publisher.publishChange(any(), any(), any(), any()) }
    }

    @Test fun `competing association after preview blocks commit and a new preview rejects the alias`() {
        initialize()
        historical()
        val node = backup()
        val input = prepared(node)
        command("b", "pool_create", """{"pool_id":"existing","catalog_pool_id":"test_pool","progress":0}""")
        val before = store.archive("u", "b")
        assertEquals(409, assertThrows(RecruitmentApiException::class.java) { service.commit("u", input) }.status.value())
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                service.preview("u", RecruitmentImportPreviewRequest("b", node, RecruitmentImportOptions(confirmCountChange = true)))
            }.status.value(),
        )
        assertEquals(before, store.archive("u", "b"))
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
        assertTrue(store.exchangeBatches("u", "b", 20_001).isEmpty())
        assertNull(store.request("u", "b", input.requestId))
    }

    @Test fun `concurrent different personal IDs for the same catalog persist only one association`() {
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        try {
            val writes = (1..2).map { index ->
                executor.submit(
                    Callable {
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching {
                            core.command(
                                "u",
                                RecruitmentCommandRequest(
                                    "b",
                                    0,
                                    "create-$index",
                                    "pool_create",
                                    mapper.readTree("""{"pool_id":"alias-$index","catalog_pool_id":"test_pool","progress":0}"""),
                                ),
                            )
                        }
                    },
                )
            }
            start.countDown()
            assertEquals(1, writes.count { it.get(20, TimeUnit.SECONDS).isSuccess })
            assertEquals(1, store.archive("u", "b")!!.pools.size)
            assertEquals(1L, store.archive("u", "b")!!.archiveRevision)
            assertEquals(1, template.findAll(RecruitmentRequestRecord::class.java).size)
            assertNull(store.archive("u", "a"))
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun `minimal records append to existing pool without replacing state and repeat safely`() {
        initialize("b")
        command("b", "baseline_set", """{"baseline":10}""")
        val before = service.export("u", "b")
        val node = simpleRecords()
        val blocked = service.preview("u", RecruitmentImportPreviewRequest("b", node))
        assertEquals("count_overlap", blocked.items.single().status)
        assertEquals(false, blocked.canCommit)
        assertTrue(blocked.items.single().displayName!!.contains("占位A"))
        assertThrows(RecruitmentApiException::class.java) {
            service.preview("u", RecruitmentImportPreviewRequest("b", node, RecruitmentImportOptions("use_backup", true)))
        }
        val options = RecruitmentImportOptions(confirmCountChange = true)
        val input = prepared(node, options = options)
        assertThrows(InventoryApiException::class.java) { service.commit("foreign", input) }
        service.commit("u", input)
        val imported = service.export("u", "b")
        assertEquals(27L, core.archive("u", "b").summary.knownTotalPulls)
        assertEquals(before.baseline, imported.baseline)
        assertEquals(before.currentPoolId, imported.currentPoolId)
        assertEquals(before.pools.map { it.progress }, imported.pools.map { it.progress })
        assertEquals("p", imported.events.single().poolId)
        assertTrue(imported.events.single().createdAt > Instant.EPOCH)
        assertEquals("unknown", imported.events.single().upStatus)
        val repeated = service.preview("u", RecruitmentImportPreviewRequest("b", node))
        assertEquals(1, repeated.stats.duplicates)
        assertEquals(0, repeated.stats.added)
        service.commit("u", prepared(node))
        assertEquals(1, store.exchangeEvents("u", "b", 20_001).size)
        assertTrue(store.exchangeEvents("u", "a", 20_001).isEmpty())
    }

    @Test fun `deleting imported batch spans is atomic scoped and durable retries never deduct twice`() {
        listOf("a", "b").forEach { account ->
            initialize(account)
            command(
                account,
                "batch_create",
                """{"pool_id":"p","mode":"historical","batch_id":"batch","total_pull_count":60,"entries":[{"event_id":"A","agent_id":"test_pool:up:A","pull_span":20},{"event_id":"B","agent_id":"test_pool:up:A","pull_span":37}]}""",
            )
        }
        command("a", "baseline_set", """{"baseline":7}""")
        command("a", "progress_set", """{"pool_id":"p","progress":5}""")
        val before = store.archive("u", "a")!!
        val beforeEvents = store.exchangeEvents("u", "a", 20_001)
        val beforeBatches = store.exchangeBatches("u", "a", 20_001)
        val foreign = service.export("u", "b")
        val fence = accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence
        val input = RecruitmentCommandRequest(
            "a",
            before.archiveRevision,
            "delete-batch-node",
            "pool_records_save",
            mapper.readTree("""{"pool_id":"p","remaining_pulls":null,"entries":[],"deleted_event_ids":["B"]}"""),
        )
        val failing = spyk(store)
        every { failing.insertRequest(any()) } throws IllegalStateException("synthetic after deletion failure")
        val broken =
            RecruitmentService(failing, accountService, accounts, RecruitmentMutation(failing, catalog, mapper), publisher, mapper, tx)
        assertThrows(IllegalStateException::class.java) { broken.command("u", input) }
        assertEquals(before, store.archive("u", "a"))
        assertEquals(beforeEvents, store.exchangeEvents("u", "a", 20_001))
        assertEquals(beforeBatches, store.exchangeBatches("u", "a", 20_001))
        assertEquals(fence, accounts.findByUserIdAndAccountId("u", "a")!!.recruitmentFence)
        assertNull(store.request("u", "a", input.requestId))
        val result = core.command("u", input)
        assertEquals(result, core.command("u", input))
        assertEquals(23L, store.batch("u", "a", "batch")!!.totalPullCount)
        assertEquals(35L, core.archive("u", "a").summary.knownTotalPulls)
        assertTrue(store.event("u", "a", "B")!!.batchCountDeducted)
        assertEquals(foreign.events, service.export("u", "b").events)
        assertEquals(foreign.batches, service.export("u", "b").batches)
        command("a", "event_restore", """{"event_id":"B"}""")
        assertEquals(72L, core.archive("u", "a").summary.knownTotalPulls)
    }

    @Test fun `zero remaining batch roundtrips full backup without reviving deleted gold history`() {
        initialize()
        command(
            "a",
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"batch","total_pull_count":40,"entries":[{"event_id":"A","agent_id":"test_pool:up:A","pull_span":17},{"event_id":"B","agent_id":"test_pool:up:A","pull_span":23}]}""",
        )
        command("a", "pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"deleted_event_ids":["A","B"]}""")
        val node = backup()
        assertEquals(0L, node.path("batches")[0].path("total_pull_count").asLong())
        assertTrue(node.path("events").all { !it.has("batch_count_deducted") })
        service.commit("u", prepared(node))
        assertEquals(0L, core.archive("u", "b").summary.knownTotalPulls)
        assertEquals(0L, core.archive("u", "b").summary.eventCount)
        assertEquals(0L, store.batch("u", "b", "batch")!!.totalPullCount)
    }

    @Test fun `record import binds resolved directory and batch totals count once`() {
        val node = simpleRecords() as ObjectNode
        val input = prepared(node)
        val old = directory.find("test_pool")!!
        assertTrue(directory.save(old.copy(name = "新名称", revision = old.revision + 1)))
        assertThrows(RecruitmentApiException::class.java) { service.commit("u", input) }
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
        val batchId = "550e8400-e29b-41d4-a716-446655440001"
        (node.path("events")[0] as ObjectNode).put("batch_id", batchId)
        node.set<JsonNode>("batches", mapper.readTree("""[{"batch_id":"$batchId","catalog_pool_id":"test_pool","total_pull_count":100}]"""))
        service.commit("u", prepared(node))
        assertEquals(100L, core.archive("u", "b").summary.knownTotalPulls)
        assertEquals(17L, service.export("u", "b").events.single().pullSpan)
        service.commit("u", prepared(node))
        assertEquals(100L, core.archive("u", "b").summary.knownTotalPulls)
        assertEquals(1, store.exchangeBatches("u", "b", 20_001).size)
    }

    @Test fun `source-free import stays bound to authorized target and exports its new provenance`() {
        initialize()
        historical()
        val original = service.export("u", "a")
        val node = backup() as ObjectNode
        node.remove("source_account")
        val input = prepared(node)
        assertThrows(InventoryApiException::class.java) { service.commit("foreign", input) }
        assertEquals(
            "recruitment_preview_mismatch",
            assertThrows(RecruitmentApiException::class.java) { service.commit("u", input.copy(accountId = "a")) }.code,
        )
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
        service.commit("u", input)
        val restored = service.export("u", "b")
        assertEquals("b", restored.sourceAccount?.accountId)
        assertEquals(listOf("E"), restored.events.map { it.eventId })
        assertEquals(17L, core.archive("u", "b").summary.knownTotalPulls)
        node.putNull("source_account")
        service.commit("u", prepared(node))
        assertEquals(1, store.exchangeEvents("u", "b", 20_001).size)
        assertEquals(original.archiveRevision, service.export("u", "a").archiveRevision)
        assertEquals(original.events, service.export("u", "a").events)
    }

    @Test fun `dialog reordered history roundtrips with sort slots unknown values and batch totals`() {
        initialize()
        historical(id = "A")
        command(
            "a",
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"batch","total_pull_count":70,"entries":[{"event_id":"B","agent_id":"test_pool:up:A","pull_span":null}]}""",
        )
        command(
            "a",
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":40,"entries":[{"event_id":"lu","agent_id":"test_pool:up:A","pull_span":null}],"ordered_event_ids":["B","lu","A"]}""",
        )
        val source = service.export("u", "a")
        service.commit("u", prepared(backup()))
        val restored = service.export("u", "b")
        assertEquals(listOf("B", "lu", "A"), restored.events.map { it.eventId })
        assertEquals(source.events.map { it.sortOrder }, restored.events.map { it.sortOrder })
        assertEquals(source.events.map { it.pullSpan }, restored.events.map { it.pullSpan })
        assertEquals(source.events.map { it.acquiredDate }, restored.events.map { it.acquiredDate })
        assertEquals(source.batches.map { it.totalPullCount }, restored.batches.map { it.totalPullCount })
        assertEquals(core.archive("u", "a").summary, core.archive("u", "b").summary)
    }

    @Test fun `roundtrip preserves all logic and original provenance while repeated file and durable retries do not duplicate`() {
        initialize()
        command("a", "baseline_set", """{"baseline":100}""")
        command("a", "progress_set", """{"pool_id":"p","progress":13}""")
        historical()
        historical(id = "D", span = 31)
        command("a", "event_delete", """{"event_id":"D"}""")
        command(
            "a",
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"B","total_pull_count":80,"entries":[{"event_id":"N","agent_id":"test_pool:up:A","pull_span":null}]}""",
        )
        command(
            "a",
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"BD","total_pull_count":40,"entries":[{"event_id":"ND","agent_id":"test_pool:up:A","pull_span":10}]}""",
        )
        command("a", "batch_delete", """{"batch_id":"BD","confirm_total_pull_count":40}""")
        val source = service.export("u", "a")
        val body = mapper.valueToTree<JsonNode>(source)
        val input = prepared(body)
        val first = service.commit("u", input)
        val restored = service.export("u", "b")
        assertEquals(1L, restored.archiveRevision)
        assertEquals(source.baseline, restored.baseline)
        assertEquals(source.pools, restored.pools)
        assertEquals(source.temporaryAgents, restored.temporaryAgents)
        assertEquals(source.currentPoolId, restored.currentPoolId)
        assertEquals(source.events.map { it.eventId }, restored.events.map { it.eventId })
        assertEquals(source.events.map { it.source }, restored.events.map { it.source })
        assertEquals(source.events.map { it.poolSnapshot }, restored.events.map { it.poolSnapshot })
        assertEquals(source.events.map { it.agentSnapshot }, restored.events.map { it.agentSnapshot })
        assertEquals(source.events.map { it.acquiredDate }, restored.events.map { it.acquiredDate })
        assertEquals(source.events.map { it.pullSpan }, restored.events.map { it.pullSpan })
        assertEquals(source.events.map { it.sortOrder }, restored.events.map { it.sortOrder })
        assertEquals(source.batches.map { it.totalPullCount }, restored.batches.map { it.totalPullCount })
        assertTrue(restored.events.all { it.importBatchId != null && it.importedAt != null })
        assertEquals(0L, restored.events.single { it.eventId == "D" }.deletedRevision)
        assertEquals(0L, restored.batches.single { it.batchId == "BD" }.deletedRevision)
        assertNotNull(restored.batches.single { it.batchId == "BD" }.deletedAt)
        assertNotNull(restored.events.single { it.eventId == "ND" }.deletedAt)
        assertEquals(210L, core.archive("u", "b").summary.knownTotalPulls)
        assertThrows(RecruitmentApiException::class.java) { command("b", "event_restore", """{"event_id":"D"}""") }
        val again = prepared(body)
        val repeated = service.commit("u", again)
        assertTrue(repeated.eventIds.isEmpty())
        assertEquals(2L, repeated.archiveRevision)
        assertEquals(4, store.exchangeEvents("u", "b", 20_001).size)
        val restarted = RecruitmentExchangeService(store, accountService, accounts, core, catalog, publisher, mapper, tx)
        assertEquals(first, restarted.commit("u", input))
        assertEquals(2L, store.archive("u", "b")!!.archiveRevision)
        verify(exactly = 1) {
            publisher.publish(
                "u",
                "b",
                "recruitment_changed",
                any(),
                match { payload ->
                    val metadata = payload as Map<*, *>
                    metadata.entries.any { entry -> entry.key == "archive_revision" && entry.value == 1L }
                },
            )
        }
    }

    @Test fun `live and deleted conflicts preserve target with no resurrection or deletion`() {
        initialize()
        historical()
        val live = backup()
        service.commit("u", prepared(live))
        command("a", "event_delete", """{"event_id":"E"}""")
        val dead = backup()
        val preview = service.preview("u", RecruitmentImportPreviewRequest("b", dead))
        assertEquals("conflict", preview.items.single { it.entityType == "event" }.status)
        service.commit("u", prepared(dead))
        assertNull(store.event("u", "b", "E")!!.deletedAt)
        command("b", "event_delete", """{"event_id":"E"}""")
        val original = service.preview("u", RecruitmentImportPreviewRequest("b", live))
        assertEquals("conflict", original.items.single { it.entityType == "event" }.status)
        service.commit("u", prepared(live))
        assertNotNull(store.event("u", "b", "E")!!.deletedAt)
    }

    @Test fun `placeholder binding inherits restored histories and old backup dedupes without rewriting personal facts`() {
        initialize()
        historical()
        val raw = store.event("u", "a", "E")!!
        val body = backup()
        val sourceRevision = store.archive("u", "a")!!.archiveRevision
        val definition = directory.find("test_pool")!!
        assertTrue(
            directory.save(
                definition.copy(
                    revision = definition.revision + 1,
                    enabled = false,
                    upAgents = definition.upAgents.map { it.copy(name = "杨修", operatorId = "char_001_yangxiu", active = false) },
                ),
            ),
        )
        assertEquals(sourceRevision, store.archive("u", "a")!!.archiveRevision)
        assertEquals(raw, store.event("u", "a", "E"))
        val reboundBackup = service.export("u", "a")
        assertEquals("char_001_yangxiu", reboundBackup.pools.single().snapshot.upAgents.single().operatorId)
        assertEquals("杨修", reboundBackup.pools.single().snapshot.upAgents.single().name)
        assertEquals(raw.agentSnapshot, reboundBackup.events.single().agentSnapshot)
        assertNull(store.archive("u", "a")!!.pools.single().snapshot.upAgents.single().operatorId)
        assertEquals(sourceRevision, store.archive("u", "a")!!.archiveRevision)
        val displayed = core.page("u", "a", null, null, 50, null, null).items.single()
        assertEquals("杨修", displayed.agentSnapshot.name)
        assertEquals("test_pool:up:A", displayed.agentSnapshot.agentId)
        service.commit("u", prepared(body))
        val target = store.event("u", "b", "E")!!
        assertEquals(raw.agentSnapshot, target.agentSnapshot)
        assertEquals(raw.poolSnapshot, target.poolSnapshot)
        assertEquals(raw.pullSpan, target.pullSpan)
        assertEquals(raw.acquiredDate, target.acquiredDate)
        assertEquals(raw.note, target.note)
        assertEquals("杨修", core.page("u", "b", null, null, 50, null, null).items.single().agentSnapshot.name)
        assertEquals(17L, core.archive("u", "b").summary.knownTotalPulls)
        assertThrows(RecruitmentApiException::class.java) { historical("b", "new") }
        val beforeRepeat = store.archive("u", "b")!!
        val duplicate = service.preview("u", RecruitmentImportPreviewRequest("b", body))
        assertEquals("duplicate", duplicate.items.single { it.entityType == "event" }.status)
        assertEquals(beforeRepeat, store.archive("u", "b"))
        assertEquals(1, store.exchangeEvents("u", "b", 20_001).size)
    }

    @Test fun `same IDs with changed facts conflict and reimport after target reorder remains duplicate`() {
        initialize()
        historical(id = "E1")
        historical(id = "E2", span = 31)
        val node = backup()
        service.commit("u", prepared(node))
        command("b", "event_reorder", """{"pool_id":"p","event_ids":["E2","E1"]}""")
        val repeat = service.preview("u", RecruitmentImportPreviewRequest("b", node))
        assertEquals(2, repeat.items.count { it.entityType == "event" && it.status == "duplicate" })
        command(
            "a",
            "event_update",
            """{"event_id":"E1","entry":{"agent_id":"test_pool:up:A","pull_span":18,"acquired_date":"2026-09-30","note":"原始备注"}}""",
        )
        val changed = service.preview("u", RecruitmentImportPreviewRequest("b", backup()))
        assertEquals("conflict", changed.items.single { it.id == "E1" }.status)
        assertEquals(17L, store.event("u", "b", "E1")!!.pullSpan)
    }

    @Test fun `stale hash choice wrong owner account game and expired preview cannot mutate target`() {
        initialize()
        historical()
        val node = backup()
        val input = prepared(node)
        assertThrows(InventoryApiException::class.java) { service.commit("foreign", input) }
        listOf(
            input.copy(documentHash = "wrong"),
            input.copy(accountId = "a"),
            input.copy(options = RecruitmentImportOptions(confirmCountChange = true)),
        ).forEach {
            assertEquals("recruitment_preview_mismatch", assertThrows(RecruitmentApiException::class.java) { service.commit("u", it) }.code)
        }
        accounts.save(accounts.findByUserIdAndAccountId("u", "b")!!.copy(game = "代号鸢"))
        assertEquals("recruitment_game_mismatch", assertThrows(RecruitmentApiException::class.java) { service.commit("u", input) }.code)
        accounts.save(accounts.findByUserIdAndAccountId("u", "b")!!.copy(game = "如鸢"))
        command("b", "baseline_set", """{"baseline":1}""")
        assertEquals("recruitment_revision_conflict", assertThrows(RecruitmentApiException::class.java) { service.commit("u", input) }.code)
        val before = store.archive("u", "b")
        service.clock = Clock.fixed(Instant.now().plusSeconds(601), ZoneOffset.UTC)
        assertEquals("recruitment_preview_expired", assertThrows(RecruitmentApiException::class.java) { service.commit("u", input) }.code)
        assertEquals(before, store.archive("u", "b"))
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
    }

    @Test fun `overlap default skips additions while confirmed replacement never adds two baselines`() {
        initialize()
        historical()
        command("a", "baseline_set", """{"baseline":50}""")
        initialize("b")
        command("b", "baseline_set", """{"baseline":100}""")
        val node = backup()
        val initial = service.preview("u", RecruitmentImportPreviewRequest("b", node))
        assertEquals(100L, initial.candidateKnownTotal)
        assertEquals("count_overlap", initial.items.single { it.entityType == "event" }.status)
        service.commit("u", prepared(node))
        assertEquals(100L, core.archive("u", "b").summary.knownTotalPulls)
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
        val options = RecruitmentImportOptions("use_backup", true)
        val chosen = service.preview("u", RecruitmentImportPreviewRequest("b", node, options))
        assertEquals(67L, chosen.candidateKnownTotal)
        service.commit("u", prepared(node, options = options))
        assertEquals(50L, store.archive("u", "b")!!.baseline)
        assertEquals(67L, core.archive("u", "b").summary.knownTotalPulls)
    }

    @Test fun `failure after archive batches and events rolls back all collections fence and SSE`() {
        initialize()
        historical()
        command(
            "a",
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"B","total_pull_count":80,"entries":[{"event_id":"N","agent_id":"test_pool:up:A","pull_span":null}]}""",
        )
        val input = prepared(backup())
        val fence = accounts.findByUserIdAndAccountId("u", "b")!!.recruitmentFence
        val failing = spyk(store)
        every { failing.insertRequest(any()) } throws IllegalStateException("synthetic post-write failure")
        val broken = RecruitmentExchangeService(failing, accountService, accounts, core, catalog, publisher, mapper, tx)
        val preview = broken.preview("u", RecruitmentImportPreviewRequest("b", input.document))
        val brokenInput = input.copy(previewToken = preview.previewToken, documentHash = preview.documentHash)
        assertThrows(IllegalStateException::class.java) { broken.commit("u", brokenInput) }
        assertNull(store.archive("u", "b"))
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
        assertTrue(store.exchangeBatches("u", "b", 20_001).isEmpty())
        assertNull(store.request("u", "b", brokenInput.requestId))
        assertEquals(fence, accounts.findByUserIdAndAccountId("u", "b")!!.recruitmentFence)
        verify(exactly = 0) { publisher.publish("u", "b", "recruitment_changed", any(), any()) }
        every { failing.insertRequest(any()) } answers { callOriginal() }
        assertEquals(1L, broken.commit("u", brokenInput.copy(requestId = "retry_failure")).archiveRevision)
    }

    @Test fun `two valid previews at the same target revision commit exactly one complete winner`() {
        initialize()
        historical()
        val node = backup()
        val barrier = CountDownLatch(2)
        val competing = object : SubAccountRepository by accounts {
            override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean {
                barrier.countDown()
                check(barrier.await(10, TimeUnit.SECONDS))
                return accounts.fenceRecruitmentWrite(userId, accountId, expectedGame)
            }
        }
        val racing = RecruitmentExchangeService(store, accountService, competing, core, catalog, publisher, mapper, tx)
        val inputs = (1..2).map {
            val preview = racing.preview("u", RecruitmentImportPreviewRequest("b", node))
            RecruitmentImportCommitRequest(
                "b",
                node,
                previewToken = preview.previewToken,
                documentHash = preview.documentHash,
                expectedRevision = 0,
                requestId = "race$it",
            )
        }
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = inputs.map {
                executor.submit(Callable { runCatching { racing.commit("u", it) } })
            }.map { it.get(20, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertEquals(1, results.count { it.exceptionOrNull() is RecruitmentApiException })
            assertEquals(1L, store.archive("u", "b")!!.archiveRevision)
            assertEquals(1, store.exchangeEvents("u", "b", 20_001).size)
            assertEquals(1, inputs.count { store.request("u", "b", it.requestId) != null })
            assertEquals(17L, core.archive("u", "b").summary.knownTotalPulls)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test fun `hidden histories roundtrip in source account while empty target and post-preview additions are refused`() {
        initialize()
        historical()
        command("a", "progress_set", """{"pool_id":"p","progress":7}""")
        val node = backup()
        val preparedBeforeHide = prepared(node)
        val old = directory.find("test_pool")!!
        assertTrue(directory.save(old.copy(revision = old.revision + 1, hidden = true)))
        val exported = service.export("u", "a")
        assertEquals(1, exported.events.size)
        assertEquals(7L, exported.pools.single().progress)
        val archiveBefore = store.archive("u", "a")!!
        service.commit("u", prepared(mapper.valueToTree(exported), "a"))
        assertEquals(1, service.export("u", "a").events.size)
        assertEquals(7L, store.archive("u", "a")!!.pools.single().progress)
        assertEquals(archiveBefore.baseline, store.archive("u", "a")!!.baseline)
        assertThrows(RecruitmentApiException::class.java) { service.preview("u", RecruitmentImportPreviewRequest("b", node)) }
        assertThrows(RecruitmentApiException::class.java) { service.commit("u", preparedBeforeHide) }
        assertNull(store.archive("u", "b"))
        assertTrue(store.exchangeEvents("u", "b", 20_001).isEmpty())
    }
}
