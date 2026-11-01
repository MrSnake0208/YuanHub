package com.lhs.share.hub.service.bond

import com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import com.lhs.share.hub.repository.AchievementRepository
import com.lhs.share.hub.repository.BondCatalogRepository
import com.lhs.share.hub.repository.BondRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.AchievementArchive
import com.lhs.share.hub.repository.entity.BondArchive
import com.lhs.share.hub.repository.entity.BondCatalog
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class BondMongoTest {
    private val db = TestMongo.database("bonds")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, db)
    private val mongo = MongoTemplate(factory)
    private val tx = TransactionTemplate(MongoTransactionManager(factory))
    private val repository = spyk(BondRepository(mongo))
    private val catalogRepository = BondCatalogRepository(mongo)
    private val operators = mockk<OperatorCatalogService>()
    private val accounts = mockk<SubAccountRepository>()
    private val accountWrites = SubAccountRepositoryImpl(mongo)
    private val mapper = bondMapper()
    private val catalog =
        BondCatalogService(catalogRepository, operators, mapper, com.lhs.share.hub.repository.AchievementCatalogRepository(mongo))
    private val previews = BondImportPreviews()
    private val service = BondService(repository, accounts, catalog, operators, previews, mapper, tx)
    private val entries = listOf(bondEntry(), bondEntry(2, "rain"), bondEntry(3, action = "poison"))
    private val lifecycle = SubAccountService(
        accountRepository = accounts, inventoryCurrentRepository = mockk(relaxed = true), inventoryRecordRepository = mockk(relaxed = true),
        inventoryDeletedRecordRepository = mockk(relaxed = true), favoriteRepository = mockk(relaxed = true),
        operatorCurrentRepository = mockk(relaxed = true), operatorRecordRepository = mockk(relaxed = true),
        operatorCorrectionRecordRepository = mockk(relaxed = true), operatorV3ImportRecordRepository = mockk(relaxed = true),
        operatorScanReviewRepository = mockk(relaxed = true), tokenService = mockk(relaxed = true), transactionTemplate = tx,
        bonds = repository, bondPreviews = previews,
    )

    @BeforeEach
    fun setup() {
        listOf(BondArchive::class.java, BondCatalog::class.java, SubAccount::class.java, AchievementArchive::class.java).forEach {
            mongo.createCollection(it)
        }
        listOf(
            SubAccount(id = "a-doc", userId = "u", accountId = "a", name = "同名", game = "代号鸢"),
            SubAccount(id = "b-doc", userId = "u", accountId = "b", name = "另一个", game = "代号鸢"),
            SubAccount(id = "c-doc", userId = "other", accountId = "c", name = "同名", game = "如鸢"),
        ).forEach { mongo.insert(it) }
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            mongo.findOne(
                Query(Criteria.where("userId").`is`(firstArg<String>()).and("accountId").`is`(secondArg<String>())),
                SubAccount::class.java,
            )
        }
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } answers
            { accountWrites.fenceRecruitmentWrite(firstArg(), secondArg(), thirdArg()) }
        every { accounts.deleteById(any()) } answers
            {
                mongo.remove(Query(Criteria.where("_id").`is`(firstArg<String>())), SubAccount::class.java)
                Unit
            }
        every { accounts.updateDetails(any(), any(), any(), any(), any()) } answers
            { accountWrites.updateDetails(firstArg(), secondArg(), thirdArg(), arg(3), arg(4)) }
        every { operators.getOperator(any()) } answers {
            OperatorCatalogEntity(
                operatorId = firstArg(), name = if (firstArg<String>() == "char_test_a") "甲_乙" else "丙", rarity = 5,
                prof = emptyList(), subProf = emptyList(),
                games = listOf(
                    "代号鸢",
                    "如鸢",
                ),
                discs = emptyList(), starStones = emptyList(), catalogVersion = "fixture",
            )
        }
        every { operators.catalog() } answers {
            OperatorCatalogResponse(
                catalogVersion = "fixture",
                operators = listOf("char_test_a", "char_test_b").map {
                    OperatorCatalogEntryResponse.of(operators.getOperator(it)!!)
                },
            )
        }
        catalog.save("代号鸢", 0, entries)
        catalog.publish("代号鸢", 1, "admin")
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, db)
        client.close()
    }
    private fun version() = catalog.catalog("代号鸢").catalogVersion
    private fun update(rev: Long, vararg changes: Pair<String, Boolean>, account: String = "a") =
        service.update("u", account, rev, version(), changes.toList())
    private fun request(document: String, account: String = "b", source: String? = null, game: String? = null, strategy: String = "merge") =
        BondImportRequest(account, mapper.readTree(document), strategy, source, game)
    private fun confirm(request: BondImportRequest): BondArchiveResponse {
        val preview = service.preview("u", request)
        return service.confirm(
            "u",
            request.copy(
                expectedRevision = preview.expectedRevision,
                catalogVersion = preview.catalogVersion,
                previewToken = preview.previewToken,
            ),
        )
    }
    private fun error(status: Int, block: () -> Any) =
        assertEquals(status, assertThrows(InventoryApiException::class.java) { block() }.status.value())

    @Test
    fun `pure reads isolation duplicate cancellation and atomic invalid batches`() {
        repeat(2) {
            service.archive("u", "a")
            service.export("u", "a")
        }
        assertEquals(0, mongo.count(Query(), BondArchive::class.java))
        error(404) { service.archive("other", "a") }
        error(404) { service.update("other", "a", 0, version(), listOf(entries[0].bondId to true)) }
        error(404) { service.export("other", "a") }
        error(404) { service.preview("other", request("{}", account = "a", source = "x")) }
        error(422) { service.update("other", "c", 0, catalog.catalog("如鸢").catalogVersion, listOf(entries[0].bondId to true)) }
        val first = update(0, entries[0].bondId to true)
        assertEquals(1, first.summary.triggeredCount)
        assertEquals(first, update(1, entries[0].bondId to true))
        assertEquals(0, service.archive("u", "b").summary.triggeredCount)
        error(409) { update(0, entries[1].bondId to true) }
        error(422) { update(1, entries[1].bondId to true, "unknown" to true) }
        assertEquals(first, service.archive("u", "a"))
        assertEquals(0, update(1, entries[0].bondId to false).summary.triggeredCount)
    }

    @Test
    fun `real CAS concurrent saves only one succeeds and failed fence rolls back`() {
        val gate = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = entries.take(2).map { entry ->
                pool.submit(
                    Callable {
                        gate.await()
                        runCatching { update(0, entry.bondId to true) }
                    },
                )
            }
            gate.countDown()
            val results = futures.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertEquals(1, service.archive("u", "a").summary.triggeredCount)
        } finally {
            pool.shutdownNow()
        }
        every { repository.save(any()) } throws IllegalStateException("synthetic disk failure")
        assertThrows(IllegalStateException::class.java) { update(0, entries[0].bondId to true, account = "b") }
        assertNull(repository.find("u", "b"))
        assertEquals(1, catalog.read("代号鸢").writeFence)
    }

    @Test
    fun `native roundtrip ignores provenance legacy exact keys and repeated imports are idempotent`() {
        update(0, entries[0].bondId to true, entries[1].bondId to true)
        val backup = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(service.export("u", "a"))
        backup.withArray("records").forEach {
            (it as com.fasterxml.jackson.databind.node.ObjectNode).put("source", "forged").put("updated_at", "1900-01-01")
        }
        val native = BondImportRequest("b", backup)
        val imported = confirm(native)
        assertEquals(2, imported.summary.triggeredCount)
        assertTrue(imported.records.all { it.source == "import" && it.updatedAt > Instant.parse("2026-01-01T00:00:00Z") })
        assertEquals(imported, confirm(native))
        val legacy =
            request("""{"dyy::同名":{"__server__":"dyy","__missing__":["甲_乙"],"丙_甲_乙_下毒_晴天":true,"丙_甲_乙_纵火_雨天":false}}""", source = "dyy::同名")
        assertEquals(3, confirm(legacy).summary.triggeredCount)
        assertEquals(3, confirm(legacy).summary.triggeredCount)
        error(422) { service.preview("u", request("""{"旧名":{}}""", source = "旧名")) }
        assertEquals(0, confirm(request("""{"旧名":{}}""", account = "a", source = "旧名", game = "代号鸢")).summary.triggeredCount - 2)
        error(422) { service.preview("u", legacy.copy(sourceGame = "如鸢")) }
    }

    @Test
    fun `preview binds source account file strategy revision and published catalog`() {
        val req = request("""{"dyy::同名":{"丙_甲_乙_纵火_晴天":true},"dyy::别名":{}}""", source = "dyy::同名")
        val preview = service.preview("u", req)
        val ready = req.copy(
            expectedRevision = preview.expectedRevision,
            catalogVersion = preview.catalogVersion,
            previewToken = preview.previewToken,
        )
        error(409) { service.confirm("u", ready.copy(sourceAccount = "dyy::别名")) }
        error(409) { service.confirm("u", ready.copy(accountId = "a")) }
        error(409) { service.confirm("u", ready.copy(strategy = "use_file")) }
        error(409) { service.confirm("u", ready.copy(document = mapper.readTree("{}"))) }
        update(0, entries[1].bondId to true, account = "b")
        error(409) { service.confirm("u", ready) }
        val next = service.preview("u", req)
        catalog.publish("代号鸢", 2, "admin")
        error(409) {
            service.confirm(
                "u",
                req.copy(expectedRevision = next.expectedRevision, catalogVersion = next.catalogVersion, previewToken = next.previewToken),
            )
        }
    }

    @Test
    fun `historical entries retained identity immutable availability blocks publication`() {
        update(0, entries[0].bondId to true, entries[1].bondId to true)
        catalog.save("代号鸢", 2, listOf(entries[1].copy(status = "invalid"), entries[2]))
        catalog.publish("代号鸢", 3, "admin")
        val result = service.archive("u", "a")
        assertEquals(1, result.summary.triggeredCount)
        assertEquals(1, result.summary.availableTotal)
        assertEquals(0, result.summary.activeTriggeredCount)
        assertEquals(2, service.export("u", "a").records.size)
        val historical = BondImportRequest("b", mapper.valueToTree(service.export("u", "a")))
        assertEquals(1, confirm(historical).summary.triggeredCount)
        assertEquals(2, service.archive("u", "b").records.size)
        error(422) { update(1, entries[0].bondId to true) }
        error(422) { catalog.save("代号鸢", 4, listOf(entries[0].copy(action = "rescue"))) }
        every { operators.getOperator("char_test_b") } returns
            operators.getOperator("char_test_a")!!.copy(operatorId = "char_test_b", games = listOf("代号鸢"))
        error(422) { catalog.save("如鸢", 0, listOf(bondEntry(game = "如鸢"))) }
        catalog.save("如鸢", 0, listOf(bondEntry(4, game = "如鸢")))
        assertFalse(catalog.preview("如鸢", 1).errors.isEmpty())
        error(422) { catalog.publish("如鸢", 1, "admin") }
    }

    @Test
    fun `account game changes and deletion cannot resurrect records or stale previews`() {
        val req = request("""{"dyy::同名":{"丙_甲_乙_纵火_晴天":true}}""", account = "a", source = "dyy::同名")
        val preview = service.preview("u", req)
        update(0, entries[0].bondId to true)
        error(409) { lifecycle.update("u", "a", null, "如鸢") }
        lifecycle.delete("u", "a")
        assertNull(repository.find("u", "a"))
        error(404) { update(1, entries[1].bondId to true) }
        error(404) {
            service.confirm(
                "u",
                req.copy(
                    expectedRevision = preview.expectedRevision,
                    catalogVersion = preview.catalogVersion,
                    previewToken = preview.previewToken,
                ),
            )
        }
        lifecycle.update("u", "b", null, "如鸢")
        assertEquals("如鸢", service.archive("u", "b").game)
    }

    @Test
    fun `achievement adapter reads same count preserves manual confirmation and exports no derived facts`() {
        val achievementRepository = AchievementRepository(mongo)
        val achievementCatalog = mockk<com.lhs.share.hub.service.achievement.AchievementCatalogService>()
        every { achievementCatalog.catalog(any()) } answers { com.lhs.share.hub.service.achievement.fixtureCatalog(firstArg()) }
        val achievements = com.lhs.share.hub.service.achievement.AchievementService(
            achievementRepository,
            accounts,
            achievementCatalog,
            mapper,
            com.lhs.share.hub.service.achievement.AchievementImportPreviews(),
            tx,
            service,
        )
        assertEquals(0, achievements.archive("u", "a").linkedMetrics.single().value)
        assertEquals(0, mongo.count(Query(), AchievementArchive::class.java))
        assertEquals(0, mongo.count(Query(), BondArchive::class.java))
        update(0, entries[0].bondId to true)
        val metric = achievements.archive("u", "a").linkedMetrics.single()
        assertEquals(1, metric.value)
        assertEquals(1, metric.sourceRevision)
        assertEquals(version(), metric.sourceCatalogVersion)
        val patch = com.lhs.share.hub.service.achievement.fixturePatch("""{"achievement_id":"yh_fixture_dhy_1","status":"completed"}""")
        achievements.update("u", "a", 0, listOf(patch))
        update(1, entries[0].bondId to false)
        val after = achievements.archive("u", "a")
        assertEquals(0, after.linkedMetrics.single().value)
        assertEquals("completed", after.records.single().status)
        assertFalse(mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(achievements.export("u", "a")).has("linked_metrics"))
        assertEquals(1, repository.find("u", "a")!!.records.size)
        mongo.remove(Query(), BondCatalog::class.java)
        error(409) { achievements.archive("u", "a") }
    }

    @Test
    fun `delete or game change after writer snapshot prevents late resurrection`() {
        for ((accountId, deleting) in listOf("a" to true, "b" to false)) {
            val paused = CountDownLatch(1)
            val release = CountDownLatch(1)
            every { repository.find("u", accountId) } answers {
                val result = callOriginal()
                if (Thread.currentThread().name == "bond-late-writer") {
                    paused.countDown()
                    check(release.await(15, TimeUnit.SECONDS))
                }
                result
            }
            val pool = Executors.newSingleThreadExecutor { Thread(it, "bond-late-writer") }
            try {
                val pending = pool.submit(Callable { runCatching { update(0, entries[0].bondId to true, account = accountId) } })
                assertTrue(paused.await(15, TimeUnit.SECONDS))
                if (deleting) lifecycle.delete("u", accountId) else lifecycle.update("u", accountId, null, "如鸢")
                release.countDown()
                val failure = pending.get(15, TimeUnit.SECONDS).exceptionOrNull()
                assertTrue(failure is InventoryApiException)
                assertEquals(409, (failure as InventoryApiException).status.value())
                assertNull(repository.find("u", accountId))
            } finally {
                release.countDown()
                pool.shutdownNow()
            }
        }
    }

    @Test
    fun `1207 synthetic records roundtrip within native capacity including server timestamps`() {
        val operatorsList = (0..50).map { n -> operators.getOperator("char_synthetic_$n")!! }
        every { operators.catalog() } returns
            OperatorCatalogResponse(catalogVersion = "synthetic", operators = operatorsList.map(OperatorCatalogEntryResponse::of))
        val large = (0..50).flatMap { a -> (a + 1..50).map { b -> a to b } }.take(1207).mapIndexed { i, (a, b) ->
            bondEntry(i + 100).copy(members = listOf("char_synthetic_$a", "char_synthetic_$b").sorted())
        }
        catalog.save("代号鸢", 2, large)
        catalog.publish("代号鸢", 3, "admin")
        val document = mapper.readTree(
            """{"format":"yuanhub-bonds","schema_version":1,"game":"代号鸢","records":[]}""",
        ) as com.fasterxml.jackson.databind.node.ObjectNode
        document.set<com.fasterxml.jackson.databind.JsonNode>(
            "records",
            mapper.valueToTree(
                large.map {
                    mapOf(
                        "bond_id" to it.bondId,
                        "triggered" to true,
                    )
                },
            ),
        )
        val result = confirm(BondImportRequest("a", document))
        assertEquals(1207, result.summary.triggeredCount)
        val exported = service.export("u", "a")
        assertTrue(mapper.writeValueAsBytes(exported).size < BondRules.NATIVE_BYTES)
        val restored = confirm(BondImportRequest("b", mapper.valueToTree(exported)))
        assertEquals(1207, restored.summary.triggeredCount)
        assertEquals(result.records.map { it.bondId }.toSet(), restored.records.map { it.bondId }.toSet())
    }

    @Test
    fun `achievement targets use only active published entries from the current game`() {
        val achievementRepository = com.lhs.share.hub.repository.AchievementCatalogRepository(mongo)
        val achievements = com.lhs.share.hub.service.achievement.AchievementCatalogService(mapper, achievementRepository)
        val admin = com.lhs.share.hub.service.achievement.AchievementCatalogAdminService(achievements, achievementRepository, mapper)
        var view = admin.addCategory("代号鸢", 0, "合成分类")
        repeat(4) { view = admin.addEntry("代号鸢", view.revision, view.draft.categories.single().categoryId) }
        val entries = view.draft.entries.mapIndexed { index, entry ->
            entry.copy(name = "测试成就$index", target = listOf(11L, 7L, 11L, 99L)[index], linkedMetric = "yuan_bond_variants")
        }
        view = admin.save("代号鸢", view.revision, view.draft.copy(entries = entries, retiredIds = setOf(entries.last().achievementId)))
        assertTrue(catalog.catalog("代号鸢").achievementTargets.isEmpty())
        admin.publish("代号鸢", view.revision, "owner")
        assertEquals(listOf(7L, 11L), catalog.catalog("代号鸢").achievementTargets)
        assertTrue(catalog.catalog("如鸢").achievementTargets.isEmpty())
    }
}
