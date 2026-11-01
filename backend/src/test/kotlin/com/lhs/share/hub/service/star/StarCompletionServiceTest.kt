package com.lhs.share.hub.service.star

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.star.request.StarCompletionBottles
import com.lhs.share.hub.controller.star.request.StarCompletionExperience
import com.lhs.share.hub.controller.star.request.StarCompletionRequest
import com.lhs.share.hub.controller.star.request.StarCompletionSelection
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.StarCompletionRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.StarCompletion
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.mongodb.MongoException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.data.mongodb.core.convert.MappingMongoConverter
import org.springframework.data.mongodb.core.convert.MongoCustomConversions
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver
import org.springframework.data.mongodb.core.mapping.MongoMappingContext
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit

class StarCompletionServiceTest {
    private val accounts = mockk<SubAccountRepository>()
    private val states = mockk<StarStateCurrentRepository>()
    private val inventories = mockk<InventoryCurrentRepository>()
    private val revisions = mockk<InventoryRevisionRepository>()
    private val records = mockk<InventoryRecordRepository>()
    private val receipts = mockk<StarCompletionRepository>()
    private val manager = mockk<PlatformTransactionManager>(relaxed = true)
    private val service =
        StarCompletionService(
            accounts,
            states,
            inventories,
            revisions,
            records,
            receipts,
            jacksonObjectMapper(),
            TransactionTemplate(manager),
        )
    private lateinit var state: StarStateCurrent
    private lateinit var stock: InventoryCurrent
    private var revision = 7L
    private val savedReceipts = mutableMapOf<String, StarCompletion>()
    private val history = mutableListOf<InventoryRecord>()

    @BeforeEach fun setup() {
        state = StarStateCurrent(
            "u:a", "u", "a", 2, 3,
            listOf(StarStateEntry("s1", "main", "天府", "orange", 40), StarStateEntry("s2", "support", "文曲", "purple", 43)),
            listOf(StarStatePlanTarget("s1", 50), StarStatePlanTarget("s2", 50)),
            StarStateExperience(10, 20, 30), StarStateBag(2, 200), Instant.EPOCH,
        )
        stock = InventoryCurrent(
            "stock",
            "u",
            "a",
            "item",
            entries = mapOf(
                "jiezhuping" to StockEntry(100),
                "jiezheping" to StockEntry(200),
                "jieyangping" to StockEntry(100),
                "other" to StockEntry(999),
            ),
        )
        savedReceipts.clear()
        history.clear()
        revision = 7
        every { manager.getTransaction(any()) } answers { SimpleTransactionStatus() }
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            if (firstArg<String>() == "u" &&
                secondArg<String>() == "a"
            ) {
                SubAccount(userId = "u", accountId = "a", name = "test", game = "如鸢")
            } else {
                null
            }
        }
        every { accounts.fenceRecruitmentWrite("u", "a", "如鸢") } returns true
        every { states.findByUserIdAndAccountId("u", "a") } answers { state }
        every { inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item") } answers { stock }
        every { revisions.findByUserIdAndAccountId("u", "a") } answers { InventoryRevision("u:a", "u", "a", revision) }
        every { revisions.compareAndIncrement("u", "a", any(), any()) } answers {
            if (thirdArg<Long>() != revision) null else InventoryRevision("u:a", "u", "a", ++revision)
        }
        every { states.replace(any(), any(), any(), any(), any(), any(), any()) } answers {
            val next = arg<StarStateSnapshot>(5)
            state =
                state.copy(
                    revision = state.revision + 1,
                    inventory = next.inventory,
                    planTargets = next.planTargets,
                    experience = next.experience,
                    bag = next.bag,
                )
            state
        }
        every { inventories.save(any()) } answers { firstArg<InventoryCurrent>().also { stock = it } }
        every { records.insert(any<InventoryRecord>()) } answers { firstArg<InventoryRecord>().also(history::add) }
        every { records.findFirstByUserIdAndAccountIdAndEntityTypeOrderByEffectiveAtDesc("u", "a", "item") } answers {
            history.maxByOrNull { it.effectiveAt }
        }
        every { receipts.findByUserIdAndAccountIdAndOperationId("u", "a", any()) } answers { savedReceipts[thirdArg<String>()] }
        every { receipts.insert(any<StarCompletion>()) } answers { firstArg<StarCompletion>().also { savedReceipts[it.operationId] = it } }
    }

    @Test fun `single completion updates state resources plan history and persistent receipt`() {
        val result = service.complete("u", request())
        assertEquals(50, result.state.inventory.first().level)
        assertEquals(4, result.state.inventory.first().breakthroughStage)
        assertEquals(mapOf("s2" to 50), result.state.planTargets)
        assertEquals(StarStateExperience(9, 18, 27), state.experience)
        assertEquals(150L, result.bottleBalances["jiezheping"])
        assertEquals(80L, result.bottleBalances["jieyangping"])
        assertEquals(999L, stock.entries["other"]?.count)
        assertEquals(43, state.inventory[1].level)
        assertEquals(4, result.starRevision)
        assertEquals(8, result.inventoryRevision)
        assertEquals(result.completedAt.truncatedTo(ChronoUnit.MILLIS), result.completedAt)
        assertEquals("consumption_delta", history.single().recordType)
        assertEquals("星石养成", history.single().acquisitionChannel)
        assertEquals(mapOf("jiezheping" to 50L, "jieyangping" to 20L), history.single().entries.associate { it.id to it.count })
        assertEquals(result, service.receipt("u", "a", "op"))
        verify(exactly = 1) { manager.commit(any()) }
    }

    @Test fun `known breakthrough conflicting with cost choice is rejected without consuming inventory`() {
        state = state.copy(inventory = state.inventory.map { if (it.instanceId == "s1") it.copy(breakthroughStage = 4) else it })
        assertEquals("star_breakthrough_changed", assertThrows(InventoryApiException::class.java) { service.complete("u", request()) }.code)
        assertEquals(7, revision)
        assertTrue(history.isEmpty())
    }

    @Test fun `multiple selected stars complete once with summed costs`() {
        val selected = listOf(StarCompletionSelection("s1", 40, 50), StarCompletionSelection("s2", 43, 50, targetAlsoBroken = true))
        val result = service.complete("u", request(selected))
        assertEquals(2, result.changes.size)
        assertTrue(state.planTargets.isEmpty())
        assertEquals(90L, stock.entries["jiezheping"]?.count)
        assertEquals(20L, stock.entries["jieyangping"]?.count)
    }

    @Test fun `repeated request after committed response loss returns first receipt before checking revisions`() {
        val request = request()
        val first = service.complete("u", request)
        state = state.copy(generation = 99, revision = 99)
        revision = 100
        assertEquals(first, service.complete("u", request))
        verify(exactly = 1) { revisions.compareAndIncrement(any(), any(), any(), any()) }
        assertEquals(1, history.size)
    }

    @Test fun `same key different body is an idempotency conflict`() {
        service.complete("u", request())
        reject("star_completion_idempotency_conflict", request().copy(experienceConsumed = StarCompletionExperience(0, 0, 0)))
        assertEquals(1, history.size)
    }

    @Test fun `selection order is canonical for retries`() {
        val req = request(listOf(StarCompletionSelection("s1", 40, 50), StarCompletionSelection("s2", 43, 50)))
        val first = service.complete("u", req)
        assertEquals(first, service.complete("u", req.copy(stars = req.stars.reversed())))
    }

    @Test fun `generation star and inventory revisions have distinct conflicts`() {
        reject("star_generation_changed", request().copy(expectedGeneration = 1))
        reject("star_state_revision_conflict", request().copy(expectedStarRevision = 1))
        reject("inventory_state_stale", request().copy(expectedInventoryRevision = 1))
        noWrites()
    }

    @Test fun `missing instance changed current level and changed plan are distinguished`() {
        reject("star_instance_not_found", request(listOf(StarCompletionSelection("missing", 40, 50))))
        state = state.copy(inventory = state.inventory.map { if (it.instanceId == "s1") it.copy(level = 41) else it })
        reject("star_level_changed", request())
        state =
            state.copy(
                inventory = state.inventory.map {
                    if (it.instanceId ==
                        "s1"
                    ) {
                        it.copy(level = 40)
                    } else {
                        it
                    }
                },
                planTargets = emptyList(),
            )
        reject("star_plan_changed", request())
        noWrites()
    }

    @Test fun `duplicates illegal levels and invalid node corrections reject before writes`() {
        val star = StarCompletionSelection("s1", 40, 50)
        reject("star_completion_duplicate_instance", request(listOf(star, star)))
        reject("star_completion_invalid_request", request(listOf(star.copy(targetLevel = 40))))
        reject("star_completion_invalid_request", request(listOf(star.copy(targetLevel = 61))))
        reject("star_completion_invalid_breakthrough", request(listOf(StarCompletionSelection("s2", 43, 50, startAlreadyBroken = false))))
        reject("star_completion_invalid_breakthrough", request(listOf(StarCompletionSelection("s1", 40, 60, targetAlsoBroken = true))))
        noWrites()
    }

    @Test fun `each actual experience amount must be known nonnegative and available`() {
        reject("star_completion_invalid_request", request().copy(experienceConsumed = StarCompletionExperience(null, 0, 0)))
        reject("star_completion_invalid_request", request().copy(experienceConsumed = StarCompletionExperience(-1, 0, 0)))
        for (cost in listOf(StarCompletionExperience(11, 0, 0), StarCompletionExperience(0, 21, 0), StarCompletionExperience(0, 0, 31))) {
            reject("insufficient_star_experience", request().copy(experienceConsumed = cost))
        }
        noWrites()
    }

    @Test fun `unknown experience is preserved for confirmed zero but positive consumption rejects`() {
        state = state.copy(experience = StarStateExperience(null, 20, 30))
        reject("star_experience_unknown", request())
        service.complete("u", request().copy(experienceConsumed = StarCompletionExperience(0, 0, 0)))
        assertNull(state.experience.orange)
    }

    @Test fun `every bottle balance is checked and confirmed totals cannot bypass rules`() {
        val req = request(listOf(StarCompletionSelection("s1", 30, 60)))
        state =
            state.copy(
                inventory = state.inventory.map {
                    if (it.instanceId ==
                        "s1"
                    ) {
                        it.copy(level = 30)
                    } else {
                        it
                    }
                },
                planTargets = listOf(StarStatePlanTarget("s1", 60)),
            )
        for (id in StarCompletionService.BOTTLES) {
            val original = stock
            stock = stock.copy(entries = stock.entries + (id to StockEntry(0)))
            reject("insufficient_inventory", req)
            stock = original
        }
        reject("star_bottle_consumption_mismatch", req.copy(bottlesConsumed = StarCompletionBottles(0, 0, 0)))
        noWrites()
    }

    @Test fun `actual experience lower than estimate including zero is accepted without added spending`() {
        service.complete("u", request().copy(experienceConsumed = StarCompletionExperience(0, 0, 0)))
        assertEquals(StarStateExperience(10, 20, 30), state.experience)
    }

    @Test fun `account ownership and game version are checked without exposing receipts`() {
        assertEquals("account_not_found", assertThrows(InventoryApiException::class.java) { service.complete("other", request()) }.code)
        reject("account_not_found", request().copy(accountId = "other"))
        reject("star_completion_invalid_request", request().copy(game = "代号鸢"))
        assertEquals("account_not_found", assertThrows(InventoryApiException::class.java) { service.receipt("other", "a", "op") }.code)
        verify(exactly = 0) { receipts.findByUserIdAndAccountIdAndOperationId("other", any(), any()) }
        noWrites()
    }

    @Test fun `revision CAS failure cannot change stock or state`() {
        every { revisions.compareAndIncrement(any(), any(), any(), any()) } returns null
        reject("inventory_state_stale", request())
        verify(exactly = 0) { states.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { inventories.save(any()) }
    }

    @Test fun `late receipt failure propagates and transaction rollback is requested`() {
        every { receipts.insert(any<StarCompletion>()) } throws IllegalStateException("injected failure")
        assertThrows(IllegalStateException::class.java) { service.complete("u", request()) }
        verify(exactly = 1) { manager.rollback(any()) }
        verify(exactly = 0) { manager.commit(any()) }
        // Repository mocks do not prove database rollback; the Mongo integration test does.
    }

    @Test fun `unrelated database failures are not mislabeled as stale conflicts`() {
        every { revisions.compareAndIncrement(any(), any(), any(), any()) } throws DataAccessResourceFailureException("offline")
        assertThrows(DataAccessResourceFailureException::class.java) { service.complete("u", request()) }
    }

    @Test fun `unknown commit result without receipt requires original operation retry`() {
        val error = MongoException(91, "lost commit acknowledgement").also { it.addLabel("UnknownTransactionCommitResult") }
        every { manager.commit(any()) } throws error
        every { receipts.insert(any<StarCompletion>()) } answers { firstArg() }
        reject("star_completion_result_unknown", request())
    }

    @Test fun `unknown commit acknowledgement with persisted receipt is recovered`() {
        every { manager.commit(any()) } throws
            MongoException(91, "lost acknowledgement").also { it.addLabel("UnknownTransactionCommitResult") }
        val result = service.complete("u", request())
        assertEquals("op", result.operationId)
        assertEquals(1, history.size)
    }

    @Test fun `context returns the existing two authorities and shared revision`() {
        val context = service.context("u", "a")
        assertEquals(7, context.inventoryRevision)
        assertEquals(200L, context.bottleBalances["jiezheping"])
        assertEquals(3, context.state.revision)
    }

    @Test fun `context without item inventory preserves unknown bottle balances`() {
        every { inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item") } returns null
        val balances = service.context("u", "a").bottleBalances
        assertEquals(StarCompletionService.BOTTLES.toSet(), balances.keys)
        assertTrue(balances.values.all { it == null })
        noWrites()
    }

    @Test fun `listed inventory leaves unrecorded bottles unknown`() {
        stock = stock.copy(entries = mapOf("jiezheping" to StockEntry(12, Instant.EPOCH)))
        assertEquals(
            mapOf("jiezhuping" to null, "jiezheping" to 12L, "jieyangping" to null),
            service.context("u", "a").bottleBalances,
        )
        noWrites()
    }

    @Test fun `full baseline proves zero for missing bottles without changing current entries`() {
        stock = stock.copy(fullBaselineAt = Instant.EPOCH, entries = mapOf("jiezheping" to StockEntry(12)))
        assertEquals(
            mapOf("jiezhuping" to 0L, "jiezheping" to 12L, "jieyangping" to 0L),
            service.context("u", "a").bottleBalances,
        )
        assertEquals(setOf("jiezheping"), stock.entries.keys)
        noWrites()
    }

    @Test fun `explicit zero remains known with or without a full baseline`() {
        for (baseline in listOf(null, Instant.EPOCH)) {
            stock = stock.copy(fullBaselineAt = baseline, entries = mapOf("jiezhuping" to StockEntry(0, Instant.EPOCH)))
            assertEquals(0L, service.context("u", "a").bottleBalances["jiezhuping"])
        }
        noWrites()
    }

    @Test fun `missing or unrecorded inventory cannot authorize positive consumption`() {
        every { inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item") } returns null
        reject("star_bottle_inventory_unknown", request())
        every { inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item") } answers { stock }
        stock = stock.copy(entries = emptyMap())
        reject("star_bottle_inventory_unknown", request())
        // A full observation proves zero, but that still cannot authorize a positive spend.
        stock = stock.copy(fullBaselineAt = Instant.EPOCH)
        reject("insufficient_inventory", request())
        noWrites()
    }

    @Test fun `confirmed zero bottle consumption preserves unknown receipt balances without inventing stock or history`() {
        every { inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item") } returns null
        val req = request(listOf(StarCompletionSelection("s2", 43, 50))).copy(experienceConsumed = StarCompletionExperience(0, 0, 0))
        val response = service.complete("u", req)
        assertEquals(StarCompletionService.BOTTLES.toSet(), response.bottleBalances.keys)
        assertTrue(response.bottleBalances.values.all { it == null })
        assertEquals(response.bottleBalances, savedReceipts.getValue("op").bottleBalances)
        assertEquals(response, service.receipt("u", "a", "op"))
        assertEquals(mapOf("s1" to 50), response.state.planTargets)
        verify(exactly = 0) { inventories.save(any()) }
        verify(exactly = 0) { records.insert(any<InventoryRecord>()) }
    }

    @Test fun `receipt preserves unknown unused bottle and actual zero after confirmed consumption`() {
        stock = stock.copy(entries = mapOf("jiezheping" to StockEntry(50), "jieyangping" to StockEntry(20)))
        val response = service.complete("u", request())
        assertEquals(mapOf("jiezhuping" to null, "jiezheping" to 0L, "jieyangping" to 0L), response.bottleBalances)
        assertEquals(response.bottleBalances, savedReceipts.getValue("op").bottleBalances)
        assertEquals(response, service.receipt("u", "a", "op"))
        assertEquals(setOf("jiezheping", "jieyangping"), stock.entries.keys)
    }

    @Test fun `BSON mapping reads old numeric receipts and round trips new null balances without a database`() {
        stock = stock.copy(entries = stock.entries + ("jiezhuping" to StockEntry(0)))
        val first = service.complete("u", request())
        // BSON Date stores milliseconds; this compatibility check must use its actual precision.
        val persisted = first.copy(completedAt = first.completedAt.truncatedTo(ChronoUnit.MILLIS))
        val conversions = MongoCustomConversions(emptyList<Any>())
        val context = MongoMappingContext().apply {
            setSimpleTypeHolder(conversions.simpleTypeHolder)
            afterPropertiesSet()
        }
        val converter = MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context).apply {
            setCustomConversions(conversions)
            afterPropertiesSet()
        }
        val legacy = Document()
        converter.write(savedReceipts.getValue("op"), legacy)
        // The existing persisted format contains only numeric map values, including zero.
        legacy["bottleBalances"] = Document(mapOf("jiezhuping" to 0L, "jiezheping" to 150L, "jieyangping" to 80L))
        savedReceipts["op"] = converter.read(StarCompletion::class.java, legacy)
        assertEquals(persisted, service.receipt("u", "a", "op"))
        assertEquals(persisted, service.complete("u", request()))
        val current = savedReceipts.getValue("op").copy(
            bottleBalances = mapOf(
                "jiezhuping" to null,
                "jiezheping" to 0L,
                "jieyangping" to 80L,
            ),
        )
        val encoded = Document()
        converter.write(current, encoded)
        assertEquals(current, converter.read(StarCompletion::class.java, encoded))
        assertTrue(encoded.get("bottleBalances", Document::class.java).containsKey("jiezhuping"))
    }

    @Test fun `40 to 50 start and end corrections are independent and temporary`() {
        for (start in listOf(false, true)) {
            for (end in listOf(false, true)) {
                val costs = StarCompletionService.calculateBottles(listOf(StarCompletionSelection("s1", 40, 50, start, end)))
                assertEquals((if (start) 0L else 50L) + if (end) 60L else 0L, costs["jiezheping"])
                assertEquals((if (start) 0L else 20L) + if (end) 60L else 0L, costs["jieyangping"])
            }
        }
        assertEquals(
            mapOf("jiezhuping" to 0L, "jiezheping" to 0L, "jieyangping" to 0L),
            StarCompletionService.calculateBottles(listOf(StarCompletionSelection("s2", 43, 50))),
        )
        assertEquals(45L, StarCompletionService.calculateBottles(listOf(StarCompletionSelection("s", 1, 60)))["jiezhuping"])
    }

    private fun request(stars: List<StarCompletionSelection> = listOf(StarCompletionSelection("s1", 40, 50))): StarCompletionRequest {
        val bottles = StarCompletionService.calculateBottles(stars)
        return StarCompletionRequest(
            "a", "如鸢", "op", 2, 3, 7, stars, StarCompletionExperience(1, 2, 3),
            StarCompletionBottles(bottles["jiezhuping"], bottles["jiezheping"], bottles["jieyangping"]),
        )
    }
    private fun reject(code: String, request: StarCompletionRequest) {
        assertEquals(code, assertThrows(InventoryApiException::class.java) { service.complete("u", request) }.code)
    }
    private fun noWrites() {
        verify(exactly = 0) { revisions.compareAndIncrement(any(), any(), any(), any()) }
        verify(exactly = 0) { states.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { inventories.save(any()) }
        verify(exactly = 0) { records.insert(any<InventoryRecord>()) }
        verify(exactly = 0) { receipts.insert(any<StarCompletion>()) }
    }
}
