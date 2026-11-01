package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCommandRequest
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import com.lhs.share.hub.repository.RecruitmentTotals
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentRequestRecord
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.confirmVerified
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class RecruitmentServiceTest {
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val store = mockk<RecruitmentRepository>()
    private val operators = mockk<OperatorCatalogRepository>()
    private val catalogStore = mockk<RecruitmentCatalogRepository>()
    private val managed = RecruitmentCatalogPool(
        "catalog_p",
        "如鸢",
        "管理员池",
        upAgents = listOf(
            RecruitmentUpAgent("catalog_p:up:A", "A"),
            RecruitmentUpAgent("catalog_p:up:B", "B"),
            RecruitmentUpAgent("catalog_p:up:C", "C"),
        ),
    )
    private val catalog = RecruitmentCatalog(mapper, catalogStore, operators)
    private val mutation = RecruitmentMutation(store, catalog, mapper)
    private val events = mutableMapOf<String, RecruitmentEvent>()
    private val batches = mutableMapOf<String, RecruitmentBatch>()
    private val now = Instant.parse("2026-10-01T00:00:00Z")
    private var state =
        RecruitmentArchive(
            "u:a",
            "u",
            "a",
            "如鸢",
            pools = listOf(RecruitmentPool("p", RecruitmentPoolSnapshot("管理员池", "如鸢", catalogPoolId = "catalog_p"), progress = 0)),
        )

    init {
        every { catalogStore.find(any()) } answers { managed.takeIf { it.poolId == firstArg<String>() } }
        every { catalogStore.all() } returns listOf(managed)
        every { operators.findByOperatorId(any()) } returns null
        every { operators.count() } returns 0L
        every { operators.findAllByOrderByOperatorIdAsc() } returns emptyList()
        every { store.event("u", "a", any()) } answers { events[thirdArg()] }
        every { store.insertEvent(any()) } answers {
            firstArg<RecruitmentEvent>().let { events[it.eventId] = it }
            Unit
        }
        every { store.saveEvent(any()) } answers {
            firstArg<RecruitmentEvent>().let { events[it.eventId] = it }
            Unit
        }
        every { store.batch("u", "a", any()) } answers { batches[thirdArg()] }
        every { store.insertBatch(any()) } answers {
            firstArg<RecruitmentBatch>().let { batches[it.batchId] = it }
            Unit
        }
        every { store.saveBatch(any()) } answers {
            firstArg<RecruitmentBatch>().let { batches[it.batchId] = it }
            Unit
        }
        every { store.batchEvents("u", "a", any()) } answers { events.values.filter { it.batchId == thirdArg<String>() } }
        every { store.poolEvents("u", "a", "p", any()) } answers { events.values.filter { it.deletedAt == null }.sortedBy { it.sortOrder } }
    }

    private fun command(operation: String, data: String) = mutation.apply(state, operation, mapper.readTree(data), now).also {
        state =
            it.archive
    }

    @Test fun `wishlist-only save persists two gold operators and subsequent events keep canonical identities`() {
        every { catalogStore.find("catalog_p") } returns managed.copy(allowCustomUp = true)
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":null,"entries":[],"wish_agent_ids":["char_001_yangxiu","char_002_jiaxu"]}""",
        )
        assertEquals(listOf("char_001_yangxiu", "char_002_jiaxu"), state.pools.single().wishAgentIds)
        assertEquals(0L, state.pools.single().progress)
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"wish","agent_id":"char_001_yangxiu","pull_span":17,"up_status":"up"}]}""",
        )
        assertEquals("char_001_yangxiu", events.getValue("wish").agentSnapshot.agentId)
        assertEquals(state.pools.single().wishAgentIds, events.getValue("wish").poolSnapshot.upAgentIds)
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":null,"entries":[],"wish_agent_ids":["char_002_jiaxu","char_003_sunshangxiang"]}""",
        )
        assertEquals("up", events.getValue("wish").upStatus)
        assertEquals(listOf("char_001_yangxiu", "char_002_jiaxu"), events.getValue("wish").poolSnapshot.upAgentIds)
    }

    @Test fun `wishlist rejects fixed pools duplicate missing wrong-game and four-star choices before writes`() {
        val valid = """{"pool_id":"p","remaining_pulls":null,"entries":[],"wish_agent_ids":["char_001_yangxiu","char_002_jiaxu"]}"""
        assertThrows(RecruitmentApiException::class.java) { command("pool_records_save", valid) }
        every { catalogStore.find("catalog_p") } returns managed.copy(allowCustomUp = true)
        listOf(
            "[]",
            "[\"char_001_yangxiu\"]",
            "[\"char_001_yangxiu\",\"char_001_yangxiu\"]",
            "[\"char_001_yangxiu\",\"char_043_xiaoqiao\"]",
            "[\"char_001_yangxiu\",\"char_006_eshi\"]",
        ).forEach { ids ->
            assertThrows(RecruitmentApiException::class.java) {
                command("pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"wish_agent_ids":$ids}""")
            }
        }
        assertTrue(state.pools.single().wishAgentIds.isEmpty())
        assertTrue(events.isEmpty())
        verify(exactly = 0) { store.insertEvent(any()) }
    }

    private fun count() = state.baseline + state.pools.sumOf { it.progress ?: 0 } +
        events.values.filter { it.deletedAt == null && it.batchId == null }.sumOf { it.pullSpan ?: 0 } +
        batches.values.filter { it.deletedAt == null }.sumOf { it.totalPullCount }
    private fun historical() = command(
        "event_create",
        """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":31},{"event_id":"C","agent_id":"catalog_p:up:C","pull_span":17}]}""",
    )

    @Test fun `four star records keep true rarity and do not require or reset current pity while SP counts as five star`() {
        state = state.copy(pools = listOf(state.pools.single().copy(progress = 9)))
        command(
            "event_create",
            """{"pool_id":"p","mode":"current","entries":[{"event_id":"four","agent_id":"char_043_xiaoqiao","pull_span":null}]}""",
        )
        assertEquals(9L, state.pools.single().progress)
        assertEquals(4, events.getValue("four").agentSnapshot.rarity)
        assertNull(events.getValue("four").pullSpan)
        assertEquals(9L, count())
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "event_create",
                """{"pool_id":"p","mode":"historical","entries":[{"agent_id":"char_043_xiaoqiao","pull_span":4}]}""",
            )
        }
        command(
            "event_create",
            """{"pool_id":"p","mode":"current","tail_progress":3,"entries":[{"event_id":"sp","agent_id":"char_084_chendengsp","pull_span":17}]}""",
        )
        assertEquals(3L, state.pools.single().progress)
        assertEquals(5, events.getValue("sp").agentSnapshot.rarity)
        assertEquals(20L, count())
    }

    @Test fun `four and five star pool dialog saves preserve unknown pity when remaining pulls is null`() {
        state = state.copy(pools = listOf(state.pools.single().copy(progress = null)))
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"four","agent_id":"char_043_xiaoqiao","pull_span":null}]}""",
        )
        assertNull(state.pools.single().progress)
        assertEquals(4, events.getValue("four").agentSnapshot.rarity)
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"five","agent_id":"char_084_chendengsp","pull_span":17}]}""",
        )
        assertNull(state.pools.single().progress)
        assertEquals(5, events.getValue("five").agentSnapshot.rarity)
        assertEquals(17L, count())
    }

    @Test fun `five star create edit and delete with null remaining pulls preserve known and unknown pity`() {
        listOf(null, 7L).forEach { progress ->
            state = state.copy(pools = listOf(state.pools.single().copy(progress = progress)))
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"five","agent_id":"catalog_p:up:A","pull_span":null}]}""",
            )
            assertEquals(progress, state.pools.single().progress)
            assertNull(events.getValue("five").pullSpan)
            assertEquals(progress ?: 0L, count())
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"five","agent_id":"catalog_p:up:A","pull_span":20}]}""",
            )
            assertEquals(progress, state.pools.single().progress)
            assertEquals((progress ?: 0L) + 20L, count())
            command("pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"deleted_event_ids":["five"]}""")
            assertEquals(progress, state.pools.single().progress)
            assertEquals(progress ?: 0L, count())
            events.clear()
        }
    }

    @Test fun `pool dialog updates existing spans adds repeated agents removes one result and replaces progress`() {
        historical()
        command("progress_set", """{"pool_id":"p","progress":21}""")
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":12}],"deleted_event_ids":["B"]}""",
        )
        assertEquals(20L, events.getValue("A").pullSpan)
        assertEquals(12L, events.getValue("new").pullSpan)
        assertEquals("catalog_p:up:A", events.getValue("new").agentSnapshot.agentId)
        assertTrue(events.getValue("B").deletedAt != null)
        assertEquals(17L, events.getValue("C").pullSpan)
        assertEquals(70L, count())
        assertEquals(21L, state.pools.single().progress)
        val data = """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":12}]}"""
        repeat(2) { command("pool_records_save", data) }
        assertEquals(4, events.size)
        assertEquals(70L, count())
        assertEquals(5L, state.nextEventOrder)
    }

    @Test fun `dialog batch edits keep total but deleting nodes deducts their spans before final validation`() {
        command(
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"b","total_pull_count":40,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":20}]}""",
        )
        val before = events.toMap()
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":40,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":25}]}""",
            )
        }
        assertEquals(before, events)
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":25}],"deleted_event_ids":["B"]}""",
            )
        }
        assertEquals(before, events)
        assertEquals(40L, batches.getValue("b").totalPullCount)
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":40,"entries":[],"deleted_event_ids":["B"]}""",
        )
        assertEquals(20L, count())
        assertEquals("b", events.getValue("A").batchId)
        assertEquals(17L, events.getValue("A").pullSpan)
        assertTrue(events.getValue("B").batchCountDeducted)
    }

    @Test fun `stopped pool permits existing count edits removals and progress but rejects additions`() {
        historical()
        every { catalogStore.find("catalog_p") } returns managed.copy(enabled = false)
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20}],"deleted_event_ids":["B"]}""",
        )
        assertEquals(58L, count())
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
        }
        assertTrue("new" !in events)
    }

    @Test fun `dialog rejects bad integers duplicated IDs cross pool or deleted updates without writing`() {
        historical()
        val before = state
        val records = events.toMap()
        listOf(
            """{"pool_id":"p","remaining_pulls":0,"entries":[]}""",
            """{"pool_id":"p","remaining_pulls":41,"entries":[]}""",
            """{"pool_id":"p","remaining_pulls":1.5,"entries":[]}""",
            """{"pool_id":"p","remaining_pulls":"19","entries":[]}""",
            """{"pool_id":"p","remaining_pulls":null,"entries":[]}""",
            """{"pool_id":"p","entries":[]}""",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"new","agent_id":"foreign:up:A","pull_span":17}]}""",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":0}]}""",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17}],"deleted_event_ids":["A"]}""",
            """{"pool_id":"p","remaining_pulls":19,"entries":[],"deleted_event_ids":["B","B"]}""",
        ).forEach {
            assertThrows(RecruitmentApiException::class.java) { command("pool_records_save", it) }
            assertEquals(before, state)
            assertEquals(records, events)
        }
        events["A"] = events.getValue("A").copy(poolId = "foreign-pool")
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
        }
        assertThrows(RecruitmentApiException::class.java) {
            command("pool_records_save", """{"pool_id":"p","remaining_pulls":19,"entries":[],"deleted_event_ids":["A"]}""")
        }
        events["A"] = records.getValue("A").copy(deletedAt = now, deletedRevision = state.archiveRevision)
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
        }
    }

    @Test fun `new pool progress must be explicitly unknown zero or a validated known value`() {
        assertNull(RecruitmentPool("default", RecruitmentPoolSnapshot("默认", "如鸢")).progress)
        listOf(
            """{"pool_id":"bad","catalog_pool_id":"catalog_p"}""",
            """{"pool_id":"bad","catalog_pool_id":"catalog_p","progress":-1}""",
            """{"pool_id":"bad","catalog_pool_id":"catalog_p","progress":1.5}""",
            """{"pool_id":"bad","catalog_pool_id":"catalog_p","progress":"0"}""",
            """{"pool_id":"bad","catalog_pool_id":"catalog_p","progress":1000000001}""",
        ).forEach { input ->
            assertEquals(422, assertThrows(RecruitmentApiException::class.java) { command("pool_create", input) }.status.value())
        }
        state = state.copy(pools = emptyList(), currentPoolId = null)
        command("pool_create", """{"pool_id":"unknown","catalog_pool_id":"catalog_p","progress":null}""")
        assertNull(state.pools.single { it.poolId == "unknown" }.progress)
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "event_create",
                """{"pool_id":"unknown","mode":"current","tail_progress":0,"entries":[{"agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
        }
        state = state.copy(pools = emptyList(), currentPoolId = null)
        command("pool_create", """{"pool_id":"zero","catalog_pool_id":"catalog_p","progress":0}""")
        assertEquals(0L, state.pools.single { it.poolId == "zero" }.progress)
        state = state.copy(pools = emptyList(), currentPoolId = null)
        command("pool_create", """{"pool_id":"known","catalog_pool_id":"catalog_p","progress":13}""")
        assertEquals(13L, state.pools.single { it.poolId == "known" }.progress)
    }

    @Test fun `pool create rejects duplicate direct or mapped catalog association without changing personal facts`() {
        val original = state
        listOf(
            original.pools.single(),
            original.pools.single().copy(
                snapshot = original.pools.single().snapshot.copy(catalogPoolId = null),
                mappedSnapshot = original.pools.single().snapshot,
            ),
        ).forEach { pool ->
            state = original.copy(pools = listOf(pool))
            val before = state
            val error = assertThrows(RecruitmentApiException::class.java) {
                command("pool_create", """{"pool_id":"alias","catalog_pool_id":"catalog_p","progress":0}""")
            }
            assertEquals(422, error.status.value())
            assertEquals(before, state)
        }
        assertTrue(events.isEmpty())
        assertTrue(batches.isEmpty())
        verify(exactly = 0) {
            store.insertEvent(any())
            store.insertBatch(any())
        }
    }

    @Test fun `automatic pools can be calibrated selected and recorded without a pool create command`() {
        state = state.copy(pools = emptyList(), currentPoolId = null)
        val id = "catalog:catalog_p"
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "event_create",
                """{"pool_id":"$id","mode":"current","tail_progress":0,"entries":[{"agent_id":"catalog_p:up:A","pull_span":17}]}""",
            )
        }
        assertTrue(state.pools.isEmpty())
        assertTrue(events.isEmpty())
        command("set_current_pool", """{"pool_id":"$id"}""")
        assertNull(state.pools.single().progress)
        command("progress_set", """{"pool_id":"$id","progress":0}""")
        command("set_current_pool", """{"pool_id":"$id"}""")
        command(
            "event_create",
            """{"pool_id":"$id","mode":"current","tail_progress":4,"entries":[{"agent_id":"catalog_p:up:A","pull_span":17}]}""",
        )
        assertEquals(id, state.currentPoolId)
        assertEquals(id, state.pools.single().poolId)
        assertEquals(4L, state.pools.single().progress)
        assertEquals(21L, count())
    }

    @Test fun `first historical batch saves only its automatic target pool and leaves progress unknown`() {
        state = state.copy(pools = emptyList(), currentPoolId = null)
        command(
            "batch_create",
            """{"pool_id":"catalog:catalog_p","mode":"historical","batch_id":"batch-new","total_pull_count":120,"entries":[{"agent_id":"catalog_p:up:A","pull_span":null}]}""",
        )
        assertEquals("catalog:catalog_p", state.pools.single().poolId)
        assertNull(state.pools.single().progress)
        assertEquals(120L, count())
    }

    @Test fun `disabled and foreign game automatic pools cannot accept new results`() {
        state = state.copy(pools = emptyList(), currentPoolId = null)
        val disabled = managed.copy(enabled = false)
        every { catalogStore.all() } returns listOf(disabled)
        every { catalogStore.find("catalog_p") } returns disabled
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                command(
                    "event_create",
                    """{"pool_id":"catalog:catalog_p","mode":"historical","entries":[{"agent_id":"catalog_p:up:A","pull_span":17}]}""",
                )
            }.status.value(),
        )
        assertTrue(catalog.projectPools(emptyList(), "代号鸢").isEmpty())
        val foreignPool = managed.copy(game = "代号鸢")
        every { catalogStore.all() } returns listOf(foreignPool)
        every { catalogStore.find("catalog_p") } returns foreignPool
        val foreign = catalog.projectPools(emptyList(), "代号鸢").single().poolId
        assertEquals(
            404,
            assertThrows(RecruitmentApiException::class.java) {
                command("progress_set", """{"pool_id":"$foreign","progress":0}""")
            }.status.value(),
        )
        assertTrue(state.pools.isEmpty())
        assertTrue(events.isEmpty())
    }

    @Test fun `only this game absolute catalog agents are accepted and users cannot replace administrator mappings`() {
        fun operator(id: String, rarity: Int, game: String) = OperatorCatalogEntity(
            operatorId = id, name = id, rarity = rarity, games = listOf(game), prof = emptyList(), subProf = emptyList(),
            discs = emptyList(), starStones = emptyList(), catalogVersion = "test-v1",
        )
        every { operators.findByOperatorId("wrong-rarity") } returns operator("wrong-rarity", 3, "如鸢")
        every { operators.findByOperatorId("wrong-game") } returns operator("wrong-game", 5, "代号鸢")
        every { operators.findByOperatorId("valid") } returns operator("valid", 5, "如鸢")
        every { operators.findByOperatorId("missing") } returns null
        listOf("wrong-rarity", "wrong-game", "missing").forEach { id ->
            assertEquals(
                422,
                assertThrows(RecruitmentApiException::class.java) {
                    command("event_create", """{"pool_id":"p","mode":"historical","entries":[{"agent_id":"$id","pull_span":17}]}""")
                }.status.value(),
            )
        }
        assertTrue(events.isEmpty())
        historical()
        val original = events.getValue("A").agentSnapshot
        assertEquals(
            422,
            assertThrows(RecruitmentApiException::class.java) {
                command("agent_map", """{"agent_id":"catalog_p:up:A","catalog_agent_id":"valid"}""")
            }.status.value(),
        )
        assertEquals(original, events.getValue("A").agentSnapshot)
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"valid-event","agent_id":"valid","pull_span":17}]}""",
        )
        assertEquals(5, events.getValue("valid-event").agentSnapshot.rarity)
        assertEquals("test-v1", events.getValue("valid-event").agentSnapshot.catalogRevision)
    }

    @Test fun `new mapped UP references use the stable slot without changing explicit user UP facts`() {
        every { catalogStore.find("catalog_p") } returns managed.copy(
            upAgents = managed.upAgents.map {
                if (it.id ==
                    "catalog_p:up:A"
                ) {
                    it.copy(operatorId = "char_001_yangxiu", name = "杨修")
                } else {
                    it
                }
            },
        )
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"mapped","agent_id":"char_001_yangxiu","pull_span":17,"up_status":"non_up"}]}""",
        )
        assertEquals("catalog_p:up:A", events.getValue("mapped").agentSnapshot.agentId)
        assertEquals("杨修", events.getValue("mapped").agentSnapshot.name)
        assertEquals("non_up", events.getValue("mapped").upStatus)
        assertEquals(17L, count())
        command("event_update", """{"event_id":"mapped","entry":{"agent_id":"catalog_p:up:A","pull_span":17,"up_status":"unknown"}}""")
        assertEquals("catalog_p:up:A", events.getValue("mapped").agentSnapshot.agentId)
        assertEquals("unknown", events.getValue("mapped").upStatus)
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"changed","agent_id":"char_002_jiaxu","pull_span":18}]}""",
        )
        command(
            "event_update",
            """{"event_id":"changed","entry":{"agent_id":"char_001_yangxiu","pull_span":18,"up_status":"non_up"}}""",
        )
        assertEquals("catalog_p:up:A", events.getValue("changed").agentSnapshot.agentId)
        assertEquals("non_up", events.getValue("changed").upStatus)
    }

    @Test fun `users cannot create custom pools agents or mappings and legacy facts remain maintainable`() {
        listOf(
            "pool_create" to """{"name":"自定义","progress":0}""",
            "pool_create" to """{"catalog_pool_id":"missing","progress":0}""",
            "temporary_agent_create" to """{"agent_id":"tmp_new","name":"私人占位"}""",
            "pool_map" to """{"pool_id":"p","catalog_pool_id":"catalog_p"}""",
            "agent_map" to """{"agent_id":"tmp_old","catalog_agent_id":"char_001_yangxiu"}""",
        ).forEach { (operation, input) -> assertThrows(RecruitmentApiException::class.java) { command(operation, input) } }
        assertEquals(0L, state.archiveRevision)
        state = state.copy(temporaryAgents = listOf(RecruitmentTemporaryAgent("tmp_old", "旧占位")))
        historical()
        val managedEvent = events.getValue("A")
        val managedRevision = state.archiveRevision
        assertThrows(RecruitmentApiException::class.java) {
            command("event_update", """{"event_id":"A","entry":{"agent_id":"tmp_old","pull_span":17}}""")
        }
        assertEquals(managedEvent, events.getValue("A"))
        assertEquals(managedRevision, state.archiveRevision)
        events.clear()
        state = state.copy(
            pools = listOf(RecruitmentPool("p", RecruitmentPoolSnapshot("旧临时池", "如鸢"), 3)),
            temporaryAgents = listOf(RecruitmentTemporaryAgent("tmp_old", "旧占位")),
        )
        events["old"] = RecruitmentEvent(
            "u:a:old", "u", "a", "old", "p", state.pools.single().snapshot,
            com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot("tmp_old", "旧占位", temporary = true), 17, 1, createdAt = now,
        )
        command("event_update", """{"event_id":"old","entry":{"agent_id":"tmp_old","pull_span":18,"note":"维护旧记录"}}""")
        assertEquals(21L, count())
        command("event_delete", """{"event_id":"old"}""")
        assertEquals(3L, count())
        command("event_restore", """{"event_id":"old"}""")
        assertEquals(21L, count())
        assertThrows(RecruitmentApiException::class.java) {
            command("event_create", """{"pool_id":"p","mode":"historical","entries":[{"agent_id":"tmp_old","pull_span":17}]}""")
        }
    }

    @Test fun `deleting B31 changes 65 to 34 and undo restores same ID without touching C or progress`() {
        historical()
        assertEquals(65L, count())
        command("progress_set", """{"pool_id":"p","progress":8}""")
        command("event_delete", """{"event_id":"B"}""")
        assertEquals(42L, count())
        assertEquals(17L, events.getValue("C").pullSpan)
        assertEquals(8L, state.pools.single().progress)
        val deletedId = events.getValue("B").id
        command("event_restore", """{"event_id":"B"}""")
        assertEquals(deletedId, events.getValue("B").id)
        assertEquals(73L, count())
        command("event_delete", """{"event_id":"B"}""")
        command("baseline_set", """{"baseline":1}""")
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                command("event_restore", """{"event_id":"B"}""")
            }.status.value(),
        )
    }

    @Test fun `current exact save consumes old progress and historical extraction preserves cumulative total`() {
        command("baseline_set", """{"baseline":100}""")
        command("progress_set", """{"pool_id":"p","progress":21}""")
        command(
            "event_create",
            """{"pool_id":"p","mode":"current","tail_progress":0,"entries":[{"agent_id":"catalog_p:up:A","pull_span":27}]}""",
        )
        assertEquals(127L, count())
        assertEquals(0L, state.pools.single().progress)
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","extract_from_baseline":true,"entries":[{"agent_id":"catalog_p:up:B","pull_span":31}]}""",
        )
        assertEquals(69L, state.baseline)
        assertEquals(127L, count())
        command(
            "event_create",
            """{"pool_id":"p","mode":"current","tail_progress":null,"entries":[{"agent_id":"catalog_p:up:C","pull_span":17}]}""",
        )
        assertNull(state.pools.single().progress)
        assertThrows(RecruitmentApiException::class.java) {
            command(
                "event_create",
                """{"pool_id":"p","mode":"current","tail_progress":0,"entries":[{"agent_id":"catalog_p:up:C","pull_span":1}]}""",
            )
        }
    }

    @Test fun `unknown-position batch counts once and deleted node stays deleted across batch undo`() {
        command(
            "batch_create",
            """{"batch_id":"b","pool_id":"p","mode":"historical","total_pull_count":10,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":null}]}""",
        )
        assertEquals(10L, count())
        command("event_delete", """{"event_id":"B"}""")
        assertEquals(10L, count())
        command("event_restore", """{"event_id":"B"}""")
        assertEquals(10L, count())
        command("event_update", """{"event_id":"A","entry":{"agent_id":"catalog_p:up:A","pull_span":7}}""")
        assertEquals(10L, count())
        command("event_delete", """{"event_id":"A"}""")
        command("event_update", """{"event_id":"B","entry":{"agent_id":"catalog_p:up:B","pull_span":3}}""")
        assertEquals(3L, count())
        command("batch_delete", """{"batch_id":"b","confirm_total_pull_count":3}""")
        assertEquals(0L, count())
        command("batch_restore", """{"batch_id":"b"}""")
        assertEquals(3L, count())
        assertTrue(events.getValue("A").deletedAt != null)
        assertNull(events.getValue("B").deletedAt)
    }

    @Test fun `batch event deletion deducts once undo adds back and legacy undo does not invent deductions`() {
        command(
            "batch_create",
            """{"batch_id":"b","pool_id":"p","mode":"historical","total_pull_count":60,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":20},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":37}]}""",
        )
        command("progress_set", """{"pool_id":"p","progress":5}""")
        command("event_delete", """{"event_id":"B"}""")
        assertEquals(28L, count())
        assertEquals(20L, events.getValue("A").pullSpan)
        assertThrows(RecruitmentApiException::class.java) { command("event_delete", """{"event_id":"B"}""") }
        assertEquals(28L, count())
        command("event_restore", """{"event_id":"B"}""")
        assertEquals(65L, count())
        assertTrue(!events.getValue("B").batchCountDeducted)
        events["B"] = events.getValue("B").copy(deletedAt = now, deletedRevision = state.archiveRevision)
        command("event_restore", """{"event_id":"B"}""")
        assertEquals(65L, count())
    }

    @Test fun `deleting exact batch history reaches zero without changing unrelated progress or old tombstones`() {
        command(
            "batch_create",
            """{"batch_id":"b","pool_id":"p","mode":"historical","total_pull_count":40,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":23}]}""",
        )
        command("event_delete", """{"event_id":"A"}""")
        val tombstone = events.getValue("A")
        command("pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"deleted_event_ids":["B"]}""")
        assertEquals(0L, count())
        assertEquals(0L, batches.getValue("b").totalPullCount)
        assertEquals(tombstone, events.getValue("A"))
        assertEquals(0L, state.pools.single().progress)
        assertEquals(2, events.size)
    }

    @Test fun `dialog inserts historical results in middle earliest and latest without rewriting intervals`() {
        historical()
        val before = events.toMap()
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":40,"entries":[{"event_id":"lu","agent_id":"catalog_p:up:A","pull_span":null}],"ordered_event_ids":["A","lu","B","C"]}""",
        )
        assertEquals(listOf("A", "lu", "B", "C"), events.values.sortedBy { it.sortOrder }.map { it.eventId })
        assertNull(events.getValue("lu").pullSpan)
        assertEquals(65L, count())
        for (ids in listOf(listOf("lu", "A", "B", "C"), listOf("A", "B", "C", "lu"), listOf("B", "A", "lu", "C"))) {
            val slots = events.values.map { it.sortOrder }.sorted()
            command(
                "pool_records_save",
                """{"pool_id":"p","remaining_pulls":null,"entries":[],"ordered_event_ids":${mapper.writeValueAsString(ids)}}""",
            )
            assertEquals(ids, events.values.sortedBy { it.sortOrder }.map { it.eventId })
            assertEquals(slots, events.values.map { it.sortOrder }.sorted())
            assertEquals(65L, count())
        }
        before.forEach { (id, old) -> assertEquals(old, events.getValue(id).copy(sortOrder = old.sortOrder, updatedAt = old.updatedAt)) }
        assertEquals(5L, state.nextEventOrder)
    }

    @Test fun `dialog validates complete final order before writes including duplicates foreign deleted and missing IDs`() {
        historical()
        command("event_delete", """{"event_id":"C"}""")
        val before = events.toMap()
        val archive = state
        for (ids in listOf(
            listOf("A", "lu"),
            listOf("A", "B", "lu", "foreign"),
            listOf("A", "B", "lu", "C"),
            listOf("A", "A", "B", "lu"),
        )) {
            assertThrows(RecruitmentApiException::class.java) {
                command(
                    "pool_records_save",
                    """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"lu","agent_id":"catalog_p:up:A","pull_span":null}],"ordered_event_ids":${mapper.writeValueAsString(
                        ids,
                    )}}""",
                )
            }
            assertEquals(before, events)
            assertEquals(archive, state)
        }
        every { store.poolEvents("u", "a", "p", 20_001) } returns List(20_001) { before.getValue("A").copy(eventId = "event_$it") }
        assertThrows(RecruitmentApiException::class.java) {
            command("pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"ordered_event_ids":[]}""")
        }
        assertEquals(before, events)
    }

    @Test fun `dialog pure sorting preserves batch totals unknown pity four stars SP and tombstones`() {
        command(
            "batch_create",
            """{"pool_id":"p","mode":"historical","batch_id":"batch","total_pull_count":70,"entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":null},{"event_id":"B","agent_id":"catalog_p:up:B","pull_span":20}]}""",
        )
        command(
            "event_create",
            """{"pool_id":"p","mode":"historical","entries":[{"event_id":"four","agent_id":"char_043_xiaoqiao","pull_span":null},{"event_id":"sp","agent_id":"char_084_chendengsp","pull_span":12}]}""",
        )
        command("event_delete", """{"event_id":"B"}""")
        state = state.copy(pools = listOf(state.pools.single().copy(progress = null)))
        val before = events.toMap()
        val batch = batches.toMap()
        val total = count()
        command("pool_records_save", """{"pool_id":"p","remaining_pulls":null,"entries":[],"ordered_event_ids":["sp","A","four"]}""")
        assertEquals(total, count())
        assertNull(state.pools.single().progress)
        assertEquals(batch, batches)
        before.forEach { (id, old) -> assertEquals(old, events.getValue(id).copy(sortOrder = old.sortOrder, updatedAt = old.updatedAt)) }
    }

    @Test fun `reordering changes only ordering and unknown historical span remains unknown`() {
        historical()
        command("event_reorder", """{"pool_id":"p","event_ids":["C","A","B"]}""")
        assertEquals(65L, count())
        assertEquals(listOf("C", "A", "B"), events.values.sortedBy { it.sortOrder }.map { it.eventId })
        command("event_create", """{"pool_id":"p","mode":"historical","entries":[{"agent_id":"catalog_p:up:A","pull_span":null}]}""")
        assertEquals(65L, count())
        assertNull(events.values.last().pullSpan)
    }

    @Test fun `validation rejects null primitive unknown fields fractions negative counts and duplicate stable IDs`() {
        listOf("""{"baseline":null}""", """{"baseline":1,"extra":true}""", """{"baseline":1.2}""", """{"baseline":-1}""").forEach {
            assertEquals(422, assertThrows(RecruitmentApiException::class.java) { command("baseline_set", it) }.status.value())
        }
        historical()
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                command(
                    "event_create",
                    """{"pool_id":"p","mode":"historical","entries":[{"event_id":"A","agent_id":"catalog_p:up:A","pull_span":17}]}""",
                )
            }.status.value(),
        )
        assertThrows(RecruitmentApiException::class.java) { command("baseline_set", """{"baseline":1000000001}""") }
    }

    @Test fun `empty repeated reads return revision zero and perform only owner scoped reads`() {
        val accountService = mockk<SubAccountService>()
        val accounts = mockk<SubAccountRepository>()
        val publisher = mockk<AccountEventService>()
        val tx = TransactionTemplate(object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?) = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        })
        val readStore = mockk<RecruitmentRepository>()
        every { accountService.requireAccount("u", "a") } returns SubAccount(userId = "u", accountId = "a", name = "test", game = "如鸢")
        every { readStore.archive("u", "a") } returns null
        every { readStore.totals("u", "a") } returns RecruitmentTotals(0, 0, 0, 0, 0)
        every { readStore.poolTotals("u", "a") } returns emptyMap()
        every { readStore.poolAgentCounts("u", "a") } returns emptyMap()
        var closedStreams = 0
        every { readStore.statisticEvents("u", "a") } answers {
            java.util.stream.Stream.empty<RecruitmentStatisticEvent>().onClose { closedStreams++ }
        }
        val service = RecruitmentService(readStore, accountService, accounts, mutation, publisher, mapper, tx)
        repeat(3) {
            val visible = service.archive("u", "a")
            assertEquals(0L, visible.archiveRevision)
            assertEquals("catalog_p", visible.pools.single().snapshot.catalogPoolId)
            assertNull(visible.pools.single().progress)
            assertEquals(0, visible.summary.unknownProgressCount)
            assertEquals(managed.upAgents.associate { it.id to 0L }, visible.poolSummaries.values.single().upAgentCounts)
            assertNull(visible.summary.upAgentCounts)
            assertNull(visible.summary.averageGoldPulls)
            assertEquals(0L, visible.summary.permanentKnownTotalPulls)
            assertEquals(emptyList<Any>(), visible.summary.mostObtainedGoldAgents)
            assertEquals(emptyList<Any>(), visible.summary.mostNonUpGoldAgents)
            assertEquals(emptyList<Any>(), visible.summary.mostPermanentGoldAgents)
            assertNull(visible.poolSummaries.values.single().mostPermanentGoldAgents)
            assertNull(visible.poolSummaries.values.single().averageGoldPulls)
            assertNull(visible.poolSummaries.values.single().smallPityWinRate)
            assertEquals(0L, service.archive("u", "a").summary.knownTotalPulls)
        }
        every { readStore.archive("u", "a") } returns state
        every { readStore.statisticEvents("u", "a") } answers {
            listOf(
                RecruitmentStatisticEvent("p", 5, 39, "non_up", "gold", "绝密"),
                RecruitmentStatisticEvent("other", 5, 2, "unknown", "other-gold", "其他绝密"),
                RecruitmentStatisticEvent("p", 5, 38, "up", "gold", "绝密"),
                RecruitmentStatisticEvent("p", 5, null, "up", "gold", "绝密"),
                RecruitmentStatisticEvent("p", 4, 100, "up", "gold", "四星"),
            ).stream().onClose { closedStreams++ }
        }
        every { catalogStore.all() } returns listOf(
            managed.copy(
                upAgents = listOf(
                    managed.upAgents[0].copy(operatorId = "formal"),
                    managed.upAgents[1],
                    managed.upAgents[2].copy(active = false),
                ),
            ),
        )
        every { readStore.poolAgentCounts("u", "a") } returns mapOf(
            "p" to mapOf("catalog_p:up:A" to 2L, "formal" to 1L, "catalog_p:up:C" to 8L, "off" to 9L),
            "other-pool" to mapOf("catalog_p:up:A" to 20L),
        )
        assertEquals(
            mapOf("catalog_p:up:A" to 3L, "catalog_p:up:B" to 0L),
            service.archive("u", "a").poolSummaries.getValue("p").upAgentCounts,
        )
        // A missing directory keeps the stored snapshot authoritative, including placeholders.
        every { catalogStore.all() } returns emptyList()
        every { readStore.archive("u", "a") } returns state.copy(
            baseline = 1000,
            pools = listOf(
                state.pools.single().copy(snapshot = state.pools.single().snapshot.copy(upAgents = managed.upAgents)),
                RecruitmentPool("standard", RecruitmentPoolSnapshot("绣衣天下", "如鸢", poolType = "常驻"), progress = 7),
                RecruitmentPool("standard-history", RecruitmentPoolSnapshot("绣衣天下", "如鸢", poolType = "standard")),
            ),
        )
        every { readStore.poolTotals("u", "a") } returns mapOf(
            "standard" to RecruitmentTotals(20, 50, 3, 2, 1),
            "standard-history" to RecruitmentTotals(11, 0, 1, 1, 0),
            "p" to RecruitmentTotals(900, 0, 1, 1, 0),
        )
        val archive = service.archive("u", "a")
        assertEquals(26.33, archive.summary.averageGoldPulls)
        assertEquals(88L, archive.summary.permanentKnownTotalPulls)
        assertEquals("gold", archive.summary.mostObtainedGoldAgents?.single()?.agentId)
        assertEquals(3L, archive.summary.mostObtainedGoldAgents?.single()?.count)
        assertEquals(1L, archive.summary.mostNonUpGoldAgents?.single()?.count)
        assertEquals(emptyList<Any>(), archive.summary.mostPermanentGoldAgents)
        val poolSummary = archive.poolSummaries.getValue("p")
        assertEquals(2L, poolSummary.upAgentCounts?.get("catalog_p:up:A"))
        assertEquals(38.5, poolSummary.averageGoldPulls)
        assertEquals(50.0, poolSummary.smallPityWinRate)
        every { readStore.statisticEvents("u", "a") } answers {
            listOf(
                RecruitmentStatisticEvent("standard", 5, null, "unknown", "permanent-gold", "常驻绝密"),
                RecruitmentStatisticEvent("standard-history", 5, 10, "non_up", "permanent-gold", "常驻绝密"),
                RecruitmentStatisticEvent("p", 5, 1, "non_up", "limited-gold", "限时绝密"),
            ).stream().onClose { closedStreams++ }
        }
        val permanentCatalog = managed.copy(poolId = "catalog_standard", poolType = "常驻", endDate = null)
        every { readStore.archive("u", "a") } returns state.copy(
            currentPoolId = "p",
            pools = listOf(
                state.pools.single(),
                RecruitmentPool("standard", RecruitmentPoolSnapshot("旧常驻", "如鸢", catalogPoolId = "catalog_standard", poolType = "常驻")),
                RecruitmentPool("standard-history", RecruitmentPoolSnapshot("旧常驻", "如鸢", poolType = "standard")),
            ),
        )
        // Missing, hidden and disabled definitions must all preserve archived permanent results.
        listOf(
            emptyList(),
            listOf(permanentCatalog.copy(hidden = true)),
            listOf(permanentCatalog.copy(enabled = false)),
        ).forEach { definitions ->
            every { catalogStore.all() } returns definitions
            val result = service.archive("u", "a")
            assertEquals("permanent-gold", result.summary.mostPermanentGoldAgents?.single()?.agentId)
            assertEquals(2L, result.summary.mostPermanentGoldAgents?.single()?.count)
            assertTrue(result.poolSummaries.values.all { it.mostPermanentGoldAgents == null })
        }
        assertEquals(11, closedStreams)
        verify(exactly = 11) { accountService.requireAccount("u", "a") }
        verify(exactly = 11) { readStore.archive("u", "a") }
        verify(exactly = 11) { readStore.totals("u", "a") }
        verify(exactly = 11) { readStore.poolTotals("u", "a") }
        verify(exactly = 11) { readStore.poolAgentCounts("u", "a") }
        verify(exactly = 11) { readStore.statisticEvents("u", "a") }
        confirmVerified(readStore, accountService)
        verify {
            publisher wasNot io.mockk.Called
            accounts wasNot io.mockk.Called
        }
    }

    @Test fun `UP summaries weight known gold and sum independent applicable pool guarantees without writes`() {
        val accountService = mockk<SubAccountService>()
        val accounts = mockk<SubAccountRepository>()
        val publisher = mockk<AccountEventService>()
        val readStore = mockk<RecruitmentRepository>()
        val tx = TransactionTemplate(object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?) = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        })
        val up = listOf(RecruitmentUpAgent("retired-up", "旧UP", active = false))
        fun snapshot(name: String) = RecruitmentPoolSnapshot(name, "如鸢", upAgents = up)
        val pools = listOf(
            RecruitmentPool("a", snapshot("A")),
            RecruitmentPool("b", RecruitmentPoolSnapshot("旧池", "如鸢"), mappedSnapshot = snapshot("B")),
            RecruitmentPool("empty", snapshot("空池")),
            RecruitmentPool("retired", snapshot("退役池").copy(catalogPoolId = "catalog_retired")),
            RecruitmentPool("standard", snapshot("常驻").copy(poolType = "standard")),
            RecruitmentPool("plain", RecruitmentPoolSnapshot("无UP", "如鸢")),
        )
        var archive = state.copy(pools = pools)
        var records = listOf(
            RecruitmentStatisticEvent("a", 5, null, "non_up"),
            RecruitmentStatisticEvent("a", 4, 99, "unknown"),
            RecruitmentStatisticEvent("a", 5, null, "up"),
            RecruitmentStatisticEvent("a", 5, null, "up"),
            RecruitmentStatisticEvent("b", 5, null, "up"),
            RecruitmentStatisticEvent("standard", 5, null, "unknown"),
            RecruitmentStatisticEvent("plain", 5, null, "unknown"),
            RecruitmentStatisticEvent("orphan", 5, null, "unknown"),
        )
        every { accountService.requireAccount("u", "a") } returns SubAccount(userId = "u", accountId = "a", name = "test", game = "如鸢")
        every { readStore.archive("u", "a") } answers { archive }
        every { readStore.totals("u", "a") } returns RecruitmentTotals(0, 0, 0, 0, 0)
        every { readStore.poolTotals("u", "a") } returns emptyMap()
        every { readStore.poolAgentCounts("u", "a") } returns emptyMap()
        var closedStreams = 0
        every { readStore.statisticEvents("u", "a") } answers { records.stream().onClose { closedStreams++ } }
        // The current directory removed every UP slot; the archived mechanism still applies.
        every { catalogStore.all() } returns listOf(managed.copy(poolId = "catalog_retired", upAgents = emptyList()))
        val service = RecruitmentService(readStore, accountService, accounts, mutation, publisher, mapper, tx)
        val result = service.archive("u", "a")
        assertEquals(3L, result.summary.upGoldCount)
        assertEquals(4L, result.summary.knownUpGoldCount)
        assertEquals(0L, result.summary.unknownUpGoldCount)
        assertEquals(75.0, result.summary.totalUpRate)
        assertEquals(1L, result.summary.guaranteedGoldCount)
        assertNull(result.summary.smallPityWinRate)
        assertEquals("first_gold_small_pity", result.summary.pityHistoryAssumption)
        assertEquals("inferred", result.summary.pityStatus)
        assertEquals(66.7, result.poolSummaries.getValue("a").totalUpRate)
        assertEquals(50.0, result.poolSummaries.getValue("a").smallPityWinRate)
        assertEquals(0L, result.poolSummaries.getValue("b").guaranteedGoldCount)
        for (id in listOf("empty", "retired")) {
            val summary = result.poolSummaries.getValue(id)
            assertEquals("no_samples", summary.pityStatus)
            assertEquals(0L, summary.guaranteedGoldCount)
            assertNull(summary.totalUpRate)
        }
        for (id in listOf("standard", "plain")) {
            val summary = result.poolSummaries.getValue(id)
            assertEquals("not_applicable", summary.pityStatus)
            assertNull(summary.totalUpRate)
            assertNull(summary.upGoldCount)
            assertNull(summary.guaranteedGoldCount)
            assertNull(summary.smallPityWinRate)
        }

        records = records + RecruitmentStatisticEvent("a", 5, null, "unknown") + RecruitmentStatisticEvent("a", 5, null, "up")
        val unknown = service.archive("u", "a")
        assertEquals(80.0, unknown.summary.totalUpRate)
        assertEquals(1L, unknown.summary.unknownUpGoldCount)
        assertNull(unknown.summary.guaranteedGoldCount)
        assertEquals("insufficient_history", unknown.summary.pityStatus)
        assertNull(unknown.poolSummaries.getValue("a").smallPityWinRate)
        assertEquals(0L, unknown.poolSummaries.getValue("b").guaranteedGoldCount)

        records = listOf(RecruitmentStatisticEvent("a", 5, null, "non_up"), RecruitmentStatisticEvent("b", 5, null, "up"))
        val independent = service.archive("u", "a")
        assertEquals(50.0, independent.summary.totalUpRate)
        assertEquals(0L, independent.summary.guaranteedGoldCount)
        records = listOf(RecruitmentStatisticEvent("a", 5, null, "non_up"), RecruitmentStatisticEvent("a", 5, null, "non_up"))
        val invalid = service.archive("u", "a").summary
        assertEquals(0.0, invalid.totalUpRate)
        assertNull(invalid.guaranteedGoldCount)
        records = emptyList()
        val empty = service.archive("u", "a").summary
        assertEquals("no_samples", empty.pityStatus)
        assertEquals(0L, empty.guaranteedGoldCount)
        assertEquals(0L, empty.knownUpGoldCount)
        assertNull(empty.totalUpRate)
        archive = state.copy(pools = pools.takeLast(2))
        every { catalogStore.all() } returns emptyList()
        val noMechanism = service.archive("u", "a").summary
        assertEquals("not_applicable", noMechanism.pityStatus)
        assertNull(noMechanism.guaranteedGoldCount)
        assertNull(noMechanism.knownUpGoldCount)
        assertNull(noMechanism.pityHistoryAssumption)

        assertEquals(6, closedStreams)
        verify(exactly = 6) { accountService.requireAccount("u", "a") }
        verify(exactly = 6) { readStore.archive("u", "a") }
        verify(exactly = 6) { readStore.totals("u", "a") }
        verify(exactly = 6) { readStore.poolTotals("u", "a") }
        verify(exactly = 6) { readStore.poolAgentCounts("u", "a") }
        verify(exactly = 6) { readStore.statisticEvents("u", "a") }
        confirmVerified(readStore, accountService)
        verify {
            publisher wasNot io.mockk.Called
            accounts wasNot io.mockk.Called
        }
    }

    @Test fun `archive denies foreign owner or account before reading any statistics`() {
        val accountService = mockk<SubAccountService>()
        val readStore = mockk<RecruitmentRepository>()
        val tx = TransactionTemplate(object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?) = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        })
        every { accountService.requireAccount(any(), any()) } throws
            InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "账号不存在")
        val service = RecruitmentService(readStore, accountService, mockk(), mutation, mockk(), mapper, tx)
        assertThrows(InventoryApiException::class.java) { service.archive("foreign", "a") }
        assertThrows(InventoryApiException::class.java) { service.archive("u", "foreign-account") }
        verify { readStore wasNot io.mockk.Called }
    }

    @Test fun `successful old revision retry returns cached result before checking revision and cannot serve foreign owner`() {
        val accountService = mockk<SubAccountService>()
        val accounts = mockk<SubAccountRepository>()
        val publisher = mockk<AccountEventService>()
        val tx = mockk<TransactionTemplate>()
        val service = RecruitmentService(store, accountService, accounts, mutation, publisher, mapper, tx)
        val request = RecruitmentCommandRequest("a", 0, "r", "baseline_set", mapper.readTree("""{"baseline":5}"""))
        every { accountService.requireAccount("u", "a") } returns SubAccount(userId = "u", accountId = "a", name = "test")
        every { store.request("u", "a", "r") } returns
            RecruitmentRequestRecord("u:a:r", "u", "a", "r", service.hash(mapper.valueToTree(request)), 1)
        assertEquals(1L, service.command("u", request).archiveRevision)
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                service.command("u", request.copy(data = mapper.readTree("""{"baseline":6}""")))
            }.status.value(),
        )
        every { accountService.requireAccount("foreign", "a") } throws
            InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        assertThrows(InventoryApiException::class.java) { service.command("foreign", request) }
        verify(exactly = 0) { store.request("foreign", any(), any()) }
        verify {
            tx wasNot io.mockk.Called
            publisher wasNot io.mockk.Called
            accounts wasNot io.mockk.Called
        }
    }

    @Test fun `hidden pool retains history edits agent correction progress and rejects mixed or direct additions without writes`() {
        historical()
        val hidden = managed.copy(hidden = true)
        every { catalogStore.find("catalog_p") } returns hidden
        every { catalogStore.all() } returns listOf(hidden)
        val before = events.toMap()
        val archiveBefore = state
        listOf(
            "event_create" to
                """{"pool_id":"p","mode":"historical","entries":[{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            "batch_create" to
                """{"pool_id":"p","mode":"historical","total_pull_count":40,"entries":[{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":17}]}""",
            "pool_create" to """{"pool_id":"new-pool","catalog_pool_id":"catalog_p","progress":0}""",
            "pool_records_save" to
                """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:B","pull_span":20},{"event_id":"new","agent_id":"catalog_p:up:A","pull_span":17}],"deleted_event_ids":["B"]}""",
        ).forEach { (operation, json) -> assertThrows(RecruitmentApiException::class.java) { command(operation, json) } }
        assertEquals(before, events)
        assertEquals(archiveBefore, state)
        assertTrue(batches.isEmpty())
        command(
            "pool_records_save",
            """{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"A","agent_id":"catalog_p:up:B","pull_span":20}],"deleted_event_ids":["B"]}""",
        )
        assertEquals("catalog_p:up:B", events.getValue("A").agentSnapshot.agentId)
        assertEquals(20L, events.getValue("A").pullSpan)
        assertEquals(21L, state.pools.single().progress)
        command("progress_set", """{"pool_id":"p","progress":7}""")
        command("event_update", """{"event_id":"C","entry":{"agent_id":"catalog_p:up:A","pull_span":18}}""")
        command("event_delete", """{"event_id":"C"}""")
        command("event_restore", """{"event_id":"C"}""")
        assertEquals(45L, count())
        state = state.copy(pools = emptyList(), currentPoolId = null)
        listOf(
            "set_current_pool" to """{"pool_id":"catalog:catalog_p"}""",
            "progress_set" to """{"pool_id":"catalog:catalog_p","progress":7}""",
            "pool_records_save" to """{"pool_id":"catalog:catalog_p","entries":[],"remaining_pulls":19}""",
            "event_create" to """{"pool_id":"catalog:catalog_p","mode":"historical","entries":[]}""",
        ).forEach { (operation, json) -> assertThrows(RecruitmentApiException::class.java) { command(operation, json) } }
        assertTrue(state.pools.isEmpty())
    }
}
