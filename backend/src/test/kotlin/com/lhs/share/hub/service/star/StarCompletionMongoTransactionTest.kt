package com.lhs.share.hub.service.star

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.mongo.StarCompletionIndexCleanup
import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.operator.request.OperatorUpgradeExecuteRequest
import com.lhs.share.hub.controller.operator.request.OperatorUpgradeRequest
import com.lhs.share.hub.controller.star.request.StarCompletionBottles
import com.lhs.share.hub.controller.star.request.StarCompletionExperience
import com.lhs.share.hub.controller.star.request.StarCompletionRequest
import com.lhs.share.hub.controller.star.request.StarCompletionSelection
import com.lhs.share.hub.controller.star.response.StarCompletionResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.InventoryRevisionRepositoryImpl
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorCurrentRepositoryImpl
import com.lhs.share.hub.repository.OperatorUpgradeTransactionRepository
import com.lhs.share.hub.repository.StarCompletionRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepositoryImpl
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.StarCompletion
import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.inventory.InventoryService
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.operator.OperatorUpgradeService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.Index
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Real transaction and race assertions; only the existing owned TestMongo replica-set fixture is used. */
@Tag("integration")
class StarCompletionMongoTransactionTest {
    private val database = TestMongo.database("completion")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val accounts = factory.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val states = factory.getRepository(
        StarStateCurrentRepository::class.java,
        RepositoryFragments.just(StarStateCurrentRepositoryImpl(template)),
    )
    private val revisions = factory.getRepository(
        InventoryRevisionRepository::class.java,
        RepositoryFragments.just(InventoryRevisionRepositoryImpl(template)),
    )
    private val inventories = factory.getRepository(InventoryCurrentRepository::class.java)
    private val records = factory.getRepository(InventoryRecordRepository::class.java)
    private val receipts = factory.getRepository(StarCompletionRepository::class.java)
    private val loadouts = factory.getRepository(
        StarLoadoutCurrentRepository::class.java,
        RepositoryFragments.just(StarLoadoutCurrentRepositoryImpl(template)),
    )
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val catalog = mockk<EntityCatalogService>()
    private val inventoryService = InventoryService(
        accounts,
        inventories,
        records,
        factory.getRepository(InventoryDeletedRecordRepository::class.java),
        catalog,
        template,
        tx,
        revisions,
    )
    private val initialStock = mapOf(
        "jiezhuping" to 100L,
        "jiezheping" to 200L,
        "jieyangping" to 100L,
        "bingshucanjuan" to 10L,
        "other" to 999L,
    )

    @BeforeEach fun setup() {
        val hello = template.executeCommand(org.bson.Document("hello", 1))
        assertTrue(hello.getBoolean("isWritablePrimary"))
        assertTrue(!hello.getString("setName").isNullOrBlank())
        println("P3 owned Mongo fixture: database=$database replicaSet=${hello.getString("setName")} primary=true")
        listOf(
            "sub_accounts",
            "star_state_current",
            "inventory_current",
            "inventory_revision",
            "inventory_records",
            "inventory_deleted_records",
            "star_completion",
            "star_loadout_current",
            "operator_current",
            "operator_upgrade_transaction",
            "operator_correction_records",
        ).forEach {
            template.createCollection(it)
        }
        MongoPersistentEntityIndexResolver(template.converter.mappingContext).resolveIndexFor(StarCompletion::class.java).forEach {
            template.indexOps(StarCompletion::class.java).ensureIndex(it)
        }
        accounts.insert(SubAccount(userId = "u", accountId = "a", name = "owned", game = "如鸢"))
        states.insert(
            StarStateCurrent(
                "u:a", "u", "a", 2, 3,
                listOf(StarStateEntry("s1", "main", "天府", "orange", 40), StarStateEntry("s2", "support", "文曲", "purple", 43)),
                listOf(
                    StarStatePlanTarget("s1", 50),
                    StarStatePlanTarget("s2", 50),
                ),
                StarStateExperience(10, 20, 30), StarStateBag(2, 200), Instant.EPOCH,
            ),
        )
        val baseline = Instant.parse("2026-10-01T00:00:00Z")
        inventories.insert(InventoryCurrent("stock", "u", "a", "item", baseline, initialStock.mapValues { StockEntry(it.value) }))
        records.insert(
            InventoryRecord(
                recordId = "baseline", userId = "u", accountId = "a", recordType = "stock_snapshot", entityType = "item",
                snapshotScope = "full", effectiveAt = baseline, producer = ProducerInfo("test"),
                entries = initialStock.map {
                    RecordEntry(it.key, count = it.value)
                },
            ),
        )
        revisions.insert(InventoryRevision("u:a", "u", "a", 7))
        loadouts.insert(
            StarLoadoutCurrent(
                id = "u:a",
                userId = "u",
                accountId = "a",
                generation = 2,
                revision = 1,
                loadouts = listOf(StarOperatorLoadout("op", StarLoadoutSlots(main1 = "s1"))),
                updatedAt = baseline,
            ),
        )
        every { catalog.exists(any(), any()) } returns true
    }

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test fun `commit persists receipt and stable loadout without modifying unrelated entries`() {
        val before = loadouts.findByUserIdAndAccountId("u", "a")
        val response = service().complete("u", request())
        assertEquals(before, loadouts.findByUserIdAndAccountId("u", "a"))
        assertEquals(50, state().inventory.first().level)
        assertEquals(43, state().inventory.last().level)
        assertEquals(999L, stock().entries["other"]?.count)
        assertEquals(response, service().receipt("u", "a", "op1")) // A new service instance recovers the persisted result.
        assertReceiptFromNewConnection(response)
        assertEquals(response, service().complete("u", request()))
        assertEquals(1, receipts.count())
        assertEquals(2, records.count())
    }

    @Test fun `same account can complete twice with actual entity indexes and retry either receipt`() {
        val first = service().complete("u", request())
        val secondRequest = request().copy(
            operationId = "op2",
            expectedStarRevision = 4,
            expectedInventoryRevision = 8,
            stars = listOf(StarCompletionSelection("s2", 43, 50)),
            bottlesConsumed = StarCompletionBottles(0, 0, 0),
        )
        val second = service().complete("u", secondRequest)
        val after = state()
        val afterStock = stock()
        assertEquals(2, receipts.count())
        assertEquals(5, after.revision)
        assertEquals(9, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertTrue(after.inventory.all { it.level == 50 })
        assertEquals(first, service().receipt("u", "a", "op1"))
        assertEquals(second, service().receipt("u", "a", "op2"))
        assertEquals(first, service().complete("u", request()))
        assertEquals(second, service().complete("u", secondRequest))
        assertEquals(after, state())
        assertEquals(afterStock, stock())
    }

    @Test fun `legacy nested index cleanup preserves old receipt and permits the original rejected operation`() {
        val first = service().complete("u", request())
        // Existing receipts carry the former embedded entity's type hint.
        template.updateFirst(
            Query(Criteria.where("operationId").`is`("op1")),
            Update().set("state._class", StarStateCurrent::class.java.name),
            StarCompletion::class.java,
        )
        val indexes = template.indexOps(StarCompletion::class.java)
        indexes.ensureIndex(
            Index().on("state.userId", Sort.Direction.ASC).on("state.accountId", Sort.Direction.ASC)
                .named("state.idx_star_state_owner").unique(),
        )
        val stateIndexes = template.indexOps(StarStateCurrent::class.java)
        MongoPersistentEntityIndexResolver(template.converter.mappingContext).resolveIndexFor(StarStateCurrent::class.java).forEach {
            stateIndexes.ensureIndex(it)
        }
        val original = request().copy(
            operationId = "op2",
            expectedStarRevision = 4,
            expectedInventoryRevision = 8,
            stars = listOf(StarCompletionSelection("s2", 43, 50)),
            bottlesConsumed = StarCompletionBottles(0, 0, 0),
        )
        val before = state()
        val beforeStock = stock()
        assertEquals(
            "star_completion_concurrent_change",
            assertThrows(InventoryApiException::class.java) { service().complete("u", original) }.code,
        )
        assertEquals(before, state())
        assertEquals(beforeStock, stock())
        assertEquals(8, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertEquals(1, receipts.count())
        assertEquals(2, records.count())

        StarCompletionIndexCleanup(template).run(DefaultApplicationArguments())
        StarCompletionIndexCleanup(template).run(DefaultApplicationArguments()) // Safe on subsequent starts.
        assertTrue(indexes.indexInfo.none { it.name == "state.idx_star_state_owner" })
        assertTrue(indexes.indexInfo.any { it.name == "idx_star_completion_operation_unique" && it.isUnique })
        assertTrue(stateIndexes.indexInfo.any { it.name == "idx_star_state_owner" && it.isUnique })
        assertEquals(first, service().receipt("u", "a", "op1"))
        val second = service().complete("u", original)
        assertEquals(second, service().complete("u", original))
        assertEquals(first, service().complete("u", request()))
        assertEquals(2, receipts.count())
        assertEquals(5, state().revision)
        assertEquals(9, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertEquals(StarStateExperience(8, 16, 24), state().experience)
    }

    @ParameterizedTest
    @ValueSource(strings = ["different-name", "different-fields", "non-unique", "extra-field"])
    fun `cleanup preserves indexes that do not exactly match the legacy definition`(variant: String) {
        val name = if (variant == "different-name") "another_owner_index" else "state.idx_star_state_owner"
        val candidate = Index().on("state.userId", Sort.Direction.ASC)
            .on(if (variant == "different-fields") "state.generation" else "state.accountId", Sort.Direction.ASC)
            .named(name)
        if (variant != "non-unique") candidate.unique()
        if (variant == "extra-field") candidate.on("operationId", Sort.Direction.ASC)
        val indexes = template.indexOps(StarCompletion::class.java)
        indexes.ensureIndex(candidate)
        val before = indexes.indexInfo
        val beforeState = state()

        StarCompletionIndexCleanup(template).run(DefaultApplicationArguments())

        assertEquals(before, indexes.indexInfo)
        assertEquals(beforeState, state())
        assertEquals(0, receipts.count())
    }

    @Test fun `failure at final receipt insert rolls back revisions stock state history and account fence`() {
        val failing = mockk<StarCompletionRepository>()
        every { failing.findByUserIdAndAccountIdAndOperationId(any(), any(), any()) } returns null
        every { failing.insert(any<StarCompletion>()) } throws IllegalStateException("injected final-write failure")
        val before = state()
        val beforeStock = stock()
        val beforeAccount = accounts.findByUserIdAndAccountId("u", "a")
        assertThrows(IllegalStateException::class.java) { service(receiptRepository = failing).complete("u", request()) }
        assertEquals(before, state())
        assertEquals(beforeStock, stock())
        assertEquals(beforeAccount, accounts.findByUserIdAndAccountId("u", "a"))
        assertEquals(7, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertEquals(1, records.count())
        assertEquals(0, receipts.count())
    }

    @Test fun `two clients at identical versions permit only one completion`() {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val tasks = (1..2).map { index ->
                pool.submit(
                    Callable {
                        start.await()
                        runCatching { service().complete("u", request("race$index")) }
                    },
                )
            }
            start.countDown()
            val results = tasks.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertTrue(results.single { it.isFailure }.exceptionOrNull() is InventoryApiException)
            assertEquals(8, revisions.findByUserIdAndAccountId("u", "a")?.revision)
            assertEquals(150L, stock().entries["jiezheping"]?.count)
            assertEquals(1, receipts.count())
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `concurrent same operation requests both recover one persisted receipt`() {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = (1..2).map {
                pool.submit(
                    Callable {
                        start.await()
                        runCatching { service().complete("u", request()) }
                    },
                )
            }
            start.countDown()
            val results = futures.map { it.get(15, TimeUnit.SECONDS) }
            assertTrue(results.any { it.isSuccess })
            val committed = results.first { it.isSuccess }.getOrThrow()
            results.forEach { result ->
                if (result.isSuccess) {
                    assertEquals(committed, result.getOrThrow())
                } else {
                    assertTrue(result.exceptionOrNull() is InventoryApiException)
                    // A request racing an uncommitted operation may abort before its receipt is visible.
                    assertEquals(committed, service().complete("u", request()))
                }
            }
            assertEquals(1, receipts.count())
            assertEquals(150L, stock().entries["jiezheping"]?.count)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `inventory import committed after completion snapshot makes completion stale with no partial writes`() {
        val result = raceWriter {
            inventoryService.import("u", importRequest("reward", "reward_delta", "jiezhuping", 1))
        }
        assertEquals("inventory_state_stale", (result.exceptionOrNull() as InventoryApiException).code)
        assertEquals(101L, stock().entries["jiezhuping"]?.count)
        assertEquals(40, state().inventory.first().level)
        assertEquals(0, receipts.count())
    }

    @Test fun `operator upgrade shares the same inventory fence even when consuming another item`() {
        val operators = factory.getRepository(
            OperatorCurrentRepository::class.java,
            RepositoryFragments.just(OperatorCurrentRepositoryImpl(template)),
        )
        operators.insert(
            OperatorCurrent(userId = "u", accountId = "a", game = "如鸢", entries = mapOf("operator1" to OperatorEntry(0, 0, 1))),
        )
        val operatorCatalog = mockk<OperatorCatalogService>()
        every { operatorCatalog.getOperator("operator1") } returns
            OperatorCatalogEntity(
                operatorId = "operator1", name = "test", rarity = 5,
                prof = listOf(
                    "火",
                ),
                subProf = listOf("pojun"), games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
            )
        every { operatorCatalog.spFormsOf(any()) } returns emptyList()
        val upgrade = OperatorUpgradeService(
            accounts, operatorCatalog, operators, inventories, records, revisions,
            factory.getRepository(OperatorUpgradeTransactionRepository::class.java), mockk<AccountEventService>(relaxed = true), tx,
            factory.getRepository(OperatorCorrectionRecordRepository::class.java),
        )
        val preview = upgrade.preview("u", OperatorUpgradeRequest("a", "如鸢", "operator1", "level", 2, 0))
        val result = raceWriter {
            upgrade.execute("u", "upgrade", OperatorUpgradeExecuteRequest("a", "如鸢", "operator1", "level", 2, 0, 7, preview.previewToken))
        }
        assertEquals("inventory_state_stale", (result.exceptionOrNull() as InventoryApiException).code)
        assertEquals(2, operators.findByUserIdAndAccountIdAndGame("u", "a", "如鸢")?.entries?.get("operator1")?.level)
        assertEquals(9L, stock().entries["bingshucanjuan"]?.count)
        assertEquals(40, state().inventory.first().level)
        assertEquals(0, receipts.count())
    }

    @Test fun `history delete restore and later snapshot rebuild preserve completion consumption exactly once`() {
        inventoryService.import("u", importRequest("irrelevant", "reward_delta", "other", 1))
        service().complete("u", request().copy(expectedInventoryRevision = 8))
        assertEquals(150L, stock().entries["jiezheping"]?.count)
        inventoryService.deleteRecord("u", "a", "irrelevant")
        assertEquals(150L, stock().entries["jiezheping"]?.count)
        inventoryService.restoreRecord("u", "a", "irrelevant")
        assertEquals(150L, stock().entries["jiezheping"]?.count)
        val consumption = records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("u", "a").single { it.recordType == "consumption_delta" }
        assertEquals(
            "consumption_record_delete_forbidden",
            assertThrows(InventoryApiException::class.java) {
                inventoryService.deleteRecord("u", "a", consumption.recordId)
            }.code,
        )
        // A later authoritative observation contains the prior spend. Replay consumes before applying that observation.
        inventoryService.import("u", importRequest("later", "stock_snapshot", "jiezheping", 140, Instant.now().plusSeconds(10)))
        inventoryService.deleteRecord("u", "a", "irrelevant")
        assertEquals(140L, stock().entries["jiezheping"]?.count)
        inventoryService.restoreRecord("u", "a", "irrelevant")
        assertEquals(140L, stock().entries["jiezheping"]?.count)
        assertNotNull(service().receipt("u", "a", "op1"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["stock_snapshot", "reward_delta"])
    fun `future inventory sources cannot overwrite completion consumption on history replay`(type: String) {
        val future = Instant.now().plusSeconds(60).truncatedTo(java.time.temporal.ChronoUnit.MILLIS)
        inventoryService.import("u", importRequest("irrelevant", "reward_delta", "other", 1))
        inventoryService.import("u", importRequest("future", type, "jiezheping", if (type == "stock_snapshot") 200 else 10, future))
        val before = checkNotNull(stock().entries["jiezheping"]).count
        val command = request().copy(expectedInventoryRevision = 9)
        val result = service().complete("u", command)
        val consumption = records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("u", "a").single { it.recordType == "consumption_delta" }
        assertTrue(result.completedAt.isBefore(future))
        assertEquals(result.completedAt, consumption.receivedAt)
        assertEquals(before - 50, stock().entries["jiezheping"]?.count)
        inventoryService.deleteRecord("u", "a", "irrelevant")
        assertEquals(before - 50, stock().entries["jiezheping"]?.count)
        inventoryService.restoreRecord("u", "a", "irrelevant")
        assertEquals(before - 50, stock().entries["jiezheping"]?.count)
        assertTrue(!consumption.effectiveAt.isBefore(future))
        assertEquals(result, service().complete("u", command))
        assertEquals(1, receipts.count())
        assertEquals(1, records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("u", "a").count { it.recordType == "consumption_delta" })
    }

    @Test fun `same operation key is isolated across users and accounts`() {
        service().complete("u", request())
        for ((user, account) in listOf("u" to "b", "other" to "a")) {
            accounts.insert(SubAccount(userId = user, accountId = account, name = "separate", game = "如鸢"))
            val original = state()
            states.insert(
                original.copy(
                    id = "$user:$account",
                    userId = user,
                    accountId = account,
                    revision = 3,
                    inventory = original.inventory.map {
                        if (it.instanceId ==
                            "s1"
                        ) {
                            it.copy(level = 40, breakthroughStage = 3)
                        } else {
                            it
                        }
                    },
                    planTargets = listOf(StarStatePlanTarget("s1", 50)),
                ),
            )
            inventories.insert(stock().copy(id = "$user:$account:item", userId = user, accountId = account))
            val response = service().complete(user, request().copy(accountId = account, expectedInventoryRevision = 0))
            assertEquals(account, response.accountId)
        }
        assertEquals(3, receipts.count())
    }

    @Test fun `multiple stars commit levels plans resources revisions and receipt together`() {
        val response = service().complete(
            "u",
            request().copy(
                stars = listOf(StarCompletionSelection("s1", 40, 50), StarCompletionSelection("s2", 43, 50, targetAlsoBroken = true)),
                bottlesConsumed = StarCompletionBottles(0, 110, 80),
            ),
        )
        assertTrue(state().inventory.all { it.level == 50 })
        assertTrue(state().planTargets.isEmpty())
        assertEquals(StarStateExperience(9, 18, 27), state().experience)
        assertEquals(2, response.changes.size)
        assertEquals(4, state().revision)
        assertEquals(8, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertEquals(mapOf("jiezhuping" to 100L, "jiezheping" to 90L, "jieyangping" to 20L), response.bottleBalances)
        assertEquals(90L, stock().entries["jiezheping"]?.count)
        assertEquals(20L, stock().entries["jieyangping"]?.count)
        assertEquals(999L, stock().entries["other"]?.count)
        assertEquals(
            mapOf("jiezheping" to 110L, "jieyangping" to 80L),
            records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("u", "a").single { it.recordType == "consumption_delta" }
                .entries.associate { it.id to it.count },
        )
        assertReceiptFromNewConnection(response)
        assertEquals(1, receipts.count())
    }

    @Test fun `partial unknown and full zero persist without zero consumption history`() {
        // Seed a listed-only fixture instead of the common full snapshot.
        val baseline = records.findByUserIdAndAccountIdAndRecordId("u", "a", "baseline")!!
        records.save(baseline.copy(snapshotScope = "listed", entries = listOf(RecordEntry("jiezheping", count = 50))))
        inventories.save(stock().copy(fullBaselineAt = null, entries = mapOf("jiezheping" to StockEntry(50, baseline.effectiveAt))))
        assertEquals(
            "star_bottle_inventory_unknown",
            assertThrows(InventoryApiException::class.java) {
                service().complete("u", request())
            }.code,
        )
        assertEquals(40, state().inventory.first().level)
        assertEquals(7, revisions.findByUserIdAndAccountId("u", "a")?.revision)
        assertEquals(50L, stock().entries["jiezheping"]?.count)
        assertEquals(0, receipts.count())

        val listed = importRequest("partial-zero", "stock_snapshot", "jiezheping", 0, Instant.now())
        inventoryService.import(
            "u",
            listed.copy(
                records = listed.records.map {
                    it.copy(
                        entries = listOf(InventoryEntryRequest("jiezheping", count = 0), InventoryEntryRequest("jieyangping", count = 8)),
                    )
                },
            ),
        )
        assertEquals(mapOf("jiezhuping" to null, "jiezheping" to 0L, "jieyangping" to 8L), service().context("u", "a").bottleBalances)
        val unknown = service().complete(
            "u",
            request("unknown").copy(
                expectedInventoryRevision = 8,
                stars = listOf(StarCompletionSelection("s1", 40, 50, startAlreadyBroken = true)),
                bottlesConsumed = StarCompletionBottles(0, 0, 0),
            ),
        )
        assertEquals(mapOf("jiezhuping" to null, "jiezheping" to 0L, "jieyangping" to 8L), unknown.bottleBalances)
        assertReceiptFromNewConnection(unknown)
        assertNull(stock().entries["jiezhuping"])
        assertEquals(2, records.count()) // Only the seed and the imported observation; no fabricated consumption.

        val full = importRequest("full-zero", "stock_snapshot", "jiezheping", 0, Instant.now())
        inventoryService.import("u", full.copy(records = full.records.map { it.copy(snapshotScope = "full") }))
        assertEquals(mapOf("jiezhuping" to 0L, "jiezheping" to 0L, "jieyangping" to 0L), service().context("u", "a").bottleBalances)
        val zero = service().complete(
            "u",
            request("zero").copy(
                expectedStarRevision = 4,
                expectedInventoryRevision = 10,
                stars = listOf(StarCompletionSelection("s2", 43, 50)),
                experienceConsumed = StarCompletionExperience(0, 0, 0),
                bottlesConsumed = StarCompletionBottles(0, 0, 0),
            ),
        )
        assertEquals(mapOf("jiezhuping" to 0L, "jiezheping" to 0L, "jieyangping" to 0L), zero.bottleBalances)
        assertReceiptFromNewConnection(zero)
        assertEquals(3, records.count())
        assertTrue(records.findByUserIdAndAccountIdOrderByEffectiveAtAsc("u", "a").none { it.recordType == "consumption_delta" })
        assertEquals(2, receipts.count())
    }

    private fun assertReceiptFromNewConnection(expected: StarCompletionResponse) {
        val freshClient = TestMongo.client()
        try {
            val freshTemplate = MongoTemplate(SimpleMongoClientDatabaseFactory(freshClient, database))
            val freshReceipts = MongoRepositoryFactory(freshTemplate).getRepository(StarCompletionRepository::class.java)
            val reader = service(receiptRepository = freshReceipts)
            assertEquals(expected, reader.receipt("u", "a", expected.operationId))
        } finally {
            freshClient.close()
        }
    }

    private fun raceWriter(write: () -> Unit): Result<*> {
        val ready = CountDownLatch(1)
        val release = CountDownLatch(1)
        val paused = mockk<InventoryRevisionRepository>()
        every { paused.findByUserIdAndAccountId(any(), any()) } answers { revisions.findByUserIdAndAccountId(firstArg(), secondArg()) }
        every { paused.compareAndIncrement(any(), any(), any(), any()) } answers {
            ready.countDown()
            check(release.await(15, TimeUnit.SECONDS))
            revisions.compareAndIncrement(firstArg(), secondArg(), thirdArg(), arg(3))
        }
        val pool = Executors.newSingleThreadExecutor()
        try {
            val future = pool.submit(Callable { runCatching { service(paused).complete("u", request()) } })
            assertTrue(ready.await(15, TimeUnit.SECONDS))
            write()
            release.countDown()
            return future.get(15, TimeUnit.SECONDS)
        } finally {
            release.countDown()
            pool.shutdownNow()
        }
    }

    private fun service(
        revisionRepository: InventoryRevisionRepository = revisions,
        receiptRepository: StarCompletionRepository = receipts,
    ) = StarCompletionService(accounts, states, inventories, revisionRepository, records, receiptRepository, jacksonObjectMapper(), tx)
    private fun state() = checkNotNull(states.findByUserIdAndAccountId("u", "a"))
    private fun stock() = checkNotNull(inventories.findByUserIdAndAccountIdAndEntityType("u", "a", "item"))
    private fun request(operation: String = "op1") = StarCompletionRequest(
        "a", "如鸢", operation, 2, 3, 7,
        listOf(StarCompletionSelection("s1", 40, 50)), StarCompletionExperience(1, 2, 3), StarCompletionBottles(0, 50, 20),
    )
    private fun importRequest(id: String, type: String, item: String, count: Long, at: Instant = Instant.parse("2026-10-02T00:00:00Z")) =
        InventoryImportRequest(
            "myshare-inventory-exchange",
            2,
            Instant.now().toString(),
            producer = ProducerDto("test"),
            records = listOf(
                InventoryRecordRequest(
                    "a",
                    id,
                    type,
                    "item",
                    effectiveAt = at.toString(),
                    snapshotScope = if (type ==
                        "stock_snapshot"
                    ) {
                        "listed"
                    } else {
                        null
                    },
                    entries = listOf(InventoryEntryRequest(item, count = count)),
                ),
            ),
        )
}
