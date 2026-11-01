package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.request.AchievementImportRequest
import com.lhs.share.hub.repository.AchievementRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.AchievementArchive
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
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
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class AchievementMongoTest {
    private val database = TestMongo.database("achievements")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val repository = spyk(AchievementRepository(mongo))
    private val accounts = mockk<SubAccountRepository>()
    private val accountWrites = SubAccountRepositoryImpl(mongo)
    private val catalog = mockk<AchievementCatalogService>()
    private val mapper = achievementMapper()
    private val tokens = mockk<OpenApiTokenService>(relaxed = true)
    private val previews = AchievementImportPreviews()
    private val service = AchievementService(repository, accounts, catalog, mapper, previews, transaction)
    private val lifecycle = SubAccountService(
        accountRepository = accounts, inventoryCurrentRepository = mockk(relaxed = true), inventoryRecordRepository = mockk(relaxed = true),
        inventoryDeletedRecordRepository = mockk(relaxed = true), favoriteRepository = mockk(relaxed = true),
        operatorCurrentRepository = mockk(relaxed = true), operatorRecordRepository = mockk(relaxed = true),
        operatorCorrectionRecordRepository = mockk(relaxed = true), operatorV3ImportRecordRepository = mockk(relaxed = true),
        operatorScanReviewRepository = mockk(
            relaxed = true,
        ),
        tokenService = tokens, transactionTemplate = transaction, achievements = repository, achievementPreviews = previews,
    )
    private val id = "yh_fixture_dhy_1"
    private val completed = fixturePatch("""{"achievement_id":"$id","status":"completed"}""")

    @BeforeEach
    fun setup() {
        listOf(SubAccount::class.java, AchievementArchive::class.java).forEach { type ->
            mongo.createCollection(type)
            MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(type).forEach {
                mongo.indexOps(type).createIndex(it)
            }
        }
        listOf(
            SubAccount(id = "doc-a", userId = "owner", accountId = "a", name = "甲", game = "代号鸢"),
            SubAccount(id = "doc-b", userId = "owner", accountId = "b", name = "乙", game = "代号鸢"),
            SubAccount(id = "doc-c", userId = "other", accountId = "c", name = "他人", game = "如鸢"),
        ).forEach { mongo.insert(it) }
        every { catalog.catalog(any()) } answers { fixtureCatalog(firstArg()) }
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
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun request(account: String = "b", records: String = """[{"achievement_id":"$id","status":"completed"}]""") =
        AchievementImportRequest(
            account,
            mapper.readTree(
                """{"format":"yuanhub-achievement","schema_version":1,"game":"代号鸢","catalog_version":"older-fixture","records":$records}""",
            ),
            "keep_current",
            false,
        )
    private fun confirm(request: AchievementImportRequest) = service.preview("owner", request).let {
        service.confirm(
            "owner",
            request.copy(expectedRevision = it.expectedRevision, catalogVersion = it.catalogVersion, previewToken = it.previewToken),
        )
    }

    @Test
    fun `reads are pure and users accounts games remain isolated`() {
        assertEquals(0, service.archive("owner", "a").revision)
        service.export("owner", "a")
        service.archive("owner", "a")
        assertEquals(0, mongo.count(Query(), AchievementArchive::class.java))
        for (operation in listOf<() -> Any>({
            service.archive("other", "a")
        }, {
            service.update("other", "a", 0, listOf(completed))
        }, { service.export("other", "a") }, { service.preview("other", request("a")) })) {
            assertEquals(
                404,
                assertThrows(InventoryApiException::class.java) {
                    operation()
                    Unit
                }.status.value(),
            )
        }
        assertEquals(
            422,
            assertThrows(InventoryApiException::class.java) {
                service.update("other", "c", 0, listOf(completed))
            }.status.value(),
        )
        service.update("owner", "a", 0, listOf(completed))
        assertTrue(service.archive("owner", "b").records.isEmpty())
        assertTrue(service.archive("other", "c").records.isEmpty())
    }

    @Test
    fun `favorite and note do not confirm status and note edits preserve state and progress provenance`() {
        val favorite = fixturePatch("""{"achievement_id":"$id","favorite":true,"note":"<b>纯文本</b>"}""")
        val pending = service.update("owner", "a", 0, listOf(favorite)).records.single()
        assertEquals("pending", pending.status)
        assertNull(pending.stateSource)
        assertNull(pending.completedOn)
        val progress = fixturePatch("""{"achievement_id":"$id","progress":10}""")
        val reached = service.update("owner", "a", 1, listOf(progress)).records.single()
        assertEquals("pending", reached.status)
        assertEquals(10.0, reached.progress)
        val done = service.update("owner", "a", 2, listOf(completed)).records.single()
        assertNull(done.completedOn)
        val noted = service.update("owner", "a", 3, listOf(fixturePatch("""{"achievement_id":"$id","note":"改备注"}"""))).records.single()
        assertEquals(done.stateUpdatedAt, noted.stateUpdatedAt)
        assertEquals(reached.progressUpdatedAt, noted.progressUpdatedAt)
        val dated = service.update(
            "owner",
            "a",
            4,
            listOf(fixturePatch("""{"achievement_id":"$id","completed_on":"2026-01-01"}""")),
        ).records.single()
        assertEquals(LocalDate.parse("2026-01-01"), dated.completedOn)
        val restored = service.update(
            "owner",
            "a",
            5,
            listOf(fixturePatch("""{"achievement_id":"$id","status":"pending"}""")),
        ).records.single()
        assertEquals("pending", restored.status)
        assertNull(restored.completedOn)
        assertEquals(10.0, restored.progress)
    }

    @Test
    fun `numeric kind limits and explicit state prevent invented automatic progress`() {
        for (json in listOf(
            """{"achievement_id":"$id","progress":1.5}""",
            """{"achievement_id":"yh_fixture_dhy_2","progress":1}""",
            """{"achievement_id":"$id","completed_on":"2026-01-01"}""",
        )) {
            assertEquals(
                422,
                assertThrows(InventoryApiException::class.java) {
                    service.update("owner", "a", 0, listOf(fixturePatch(json)))
                }.status.value(),
            )
        }
        assertNull(repository.find("owner", "a"))
        val first = service.update("owner", "a", 0, listOf(completed))
        assertEquals(first, service.update("owner", "a", first.revision, listOf(completed)))
    }

    @Test
    fun `backup round trips with no stacking duplicates and preview never writes`() {
        service.update(
            "owner",
            "a",
            0,
            listOf(
                fixturePatch(
                    """{"achievement_id":"$id","status":"completed","favorite":true,"note":"资料","progress":12,"completed_on":"2026-01-01"}""",
                ),
            ),
        )
        val original = service.export("owner", "a")
        val request = request().copy(document = mapper.valueToTree(original))
        val preview = service.preview("owner", request)
        assertEquals(1, preview.stats["add"])
        assertNull(repository.find("owner", "b"))
        val first = confirm(request)
        assertEquals(12.0, first.records.single().progress)
        assertEquals("import", first.records.single().source)
        assertEquals("import", first.records.single().stateSource)
        val repeated = confirm(request)
        assertEquals(first, repeated)
        assertEquals(1, repository.find("owner", "b")!!.records.size)
    }

    @Test
    fun `import conflicts keep current by default explicit override never erases note by empty string`() {
        service.update(
            "owner",
            "b",
            0,
            listOf(fixturePatch("""{"achievement_id":"$id","status":"incomplete","note":"保留备注","progress":5}""")),
        )
        val request = request(records = """[{"achievement_id":"$id","status":"completed","note":"","progress":10}]""")
        assertEquals(1, service.preview("owner", request).stats["conflict"])
        assertEquals("incomplete", confirm(request).records.single().status)
        val result = confirm(request.copy(strategy = "use_file")).records.single()
        assertEquals("completed", result.status)
        assertEquals("保留备注", result.note)
        assertEquals(10.0, result.progress)
        assertNull(result.completedOn)
    }

    @Test
    fun `unknown IDs require skipping invalid duplicate and wrong game block all records`() {
        val request =
            request(records = """[{"achievement_id":"$id","status":"completed"},{"achievement_id":"removed","status":"completed"}]""")
        assertEquals(1, service.preview("owner", request).stats["unknown"])
        assertThrows(InventoryApiException::class.java) { confirm(request) }
        assertNull(repository.find("owner", "b"))
        assertEquals(1, confirm(request.copy(skipUnknown = true)).records.size)
        for (rows in listOf(
            """[{"achievement_id":"yh_fixture_dhy_2","status":"completed"},{"achievement_id":"$id","progress":-1}]""",
            """[{"achievement_id":"$id","status":"completed"},{"achievement_id":"$id","status":"completed"}]""",
            """[{"achievement_id":"yh_fixture_ry_1","status":"completed"}]""",
        )) {
            val next = request(records = rows)
            val before = repository.find("owner", "b")
            assertEquals(0, service.preview("owner", next).affected)
            assertThrows(InventoryApiException::class.java) { confirm(next) }
            assertEquals(before, repository.find("owner", "b"))
        }
        assertThrows(InventoryApiException::class.java) { service.preview("other", request("c")) }
    }

    @Test
    fun `stale preview revision and changed catalog conflict without overwriting`() {
        val request = request()
        val plan = service.preview("owner", request)
        service.update("owner", "b", 0, listOf(fixturePatch("""{"achievement_id":"$id","note":"来自另一设备"}""")))
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.confirm(
                    "owner",
                    request.copy(
                        expectedRevision = plan.expectedRevision,
                        catalogVersion = plan.catalogVersion,
                        previewToken = plan.previewToken,
                    ),
                )
            }.status.value(),
        )
        val fresh = service.preview("owner", request)
        every { catalog.catalog("代号鸢") } returns fixtureCatalog(version = "fixture-v2")
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.confirm(
                    "owner",
                    request.copy(
                        expectedRevision = fresh.expectedRevision,
                        catalogVersion = fresh.catalogVersion,
                        previewToken = fresh.previewToken,
                    ),
                )
            }.status.value(),
        )
        assertEquals("来自另一设备", service.archive("owner", "b").records.single().note)
    }

    @Test
    fun `preview is bound to owner account file and strategy even when both accounts have revision zero`() {
        val input = request()
        val preview = service.preview("owner", input)
        val confirmed = input.copy(
            expectedRevision = preview.expectedRevision,
            catalogVersion = preview.catalogVersion,
            previewToken = preview.previewToken,
        )
        for (changed in listOf(
            confirmed.copy(accountId = "a"),
            confirmed.copy(strategy = "use_file"),
            confirmed.copy(document = request(records = """[{"achievement_id":"$id","status":"incomplete"}]""").document),
        )) {
            assertEquals(409, assertThrows(InventoryApiException::class.java) { service.confirm("owner", changed) }.status.value())
        }
        assertNull(repository.find("owner", "a"))
        assertNull(repository.find("owner", "b"))
        assertEquals("completed", service.confirm("owner", confirmed).records.single().status)
    }

    @Test
    fun `unsupported schema oversized counts and forged file sources never become trusted provenance`() {
        val base = request()
        for (version in listOf("2", "4294967297", "\"1\"")) {
            val json = base.document.toString().replace("\"schema_version\":1", "\"schema_version\":$version")
            val invalid = base.copy(
                document = mapper.readTree(json),
            )
            assertThrows(InventoryApiException::class.java) { service.preview("owner", invalid) }
        }
        val oversized = mapper.createArrayNode()
        repeat(5001) { oversized.add(mapper.createObjectNode().put("achievement_id", "id$it").put("status", "completed")) }
        val document = base.document.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        document.set<com.fasterxml.jackson.databind.node.ObjectNode>("records", oversized)
        assertThrows(InventoryApiException::class.java) { service.preview("owner", base.copy(document = document)) }
        val forged =
            request(records = """[{"achievement_id":"$id","status":"completed","source":"third_party","state_source":"third_party"}]""")
        val record = confirm(forged).records.single()
        assertEquals("import", record.source)
        assertEquals("import", record.stateSource)
    }

    @Test
    fun `retired catalog records stay in archive and full export while new catalog never resets them`() {
        val before = service.update("owner", "a", 0, listOf(completed))
        every { catalog.catalog("代号鸢") } returns fixtureCatalog(version = "fixture-v2").let { it.copy(entries = it.entries.drop(1)) }
        assertEquals(before, service.archive("owner", "a"))
        assertEquals(id, service.export("owner", "a").records.single().achievementId)
    }

    @Test
    fun `real CAS allows only one concurrent writer and stale revision cannot overwrite`() {
        val results =
            concurrent(
                listOf({
                    service.update("owner", "a", 0, listOf(completed))
                }, { service.update("owner", "a", 0, listOf(fixturePatch("""{"achievement_id":"$id","favorite":true}"""))) }),
            )
        assertEquals(1, results.count { it.isSuccess })
        assertEquals(1, service.archive("owner", "a").revision)
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.update("owner", "a", 0, listOf(completed))
            }.status.value(),
        )
    }

    @Test
    fun `transaction failure after save rolls back entire import and account fence`() {
        every { repository.save(any()) } answers {
            callOriginal()
            throw IllegalStateException("injected failure after Mongo save")
        }
        assertThrows(IllegalStateException::class.java) { confirm(request()) }
        assertNull(repository.find("owner", "b"))
        assertEquals(0, mongo.findById("doc-b", SubAccount::class.java)!!.recruitmentFence)
    }

    @Test
    fun `account lifecycle locks substantive data permits empty game change and cascades atomically`() {
        service.archive("owner", "a")
        lifecycle.update("owner", "a", null, "如鸢")
        assertEquals("如鸢", service.archive("owner", "a").game)
        service.update("owner", "b", 0, listOf(completed))
        assertEquals(
            "achievement_game_locked",
            assertThrows(InventoryApiException::class.java) {
                lifecycle.update("owner", "b", null, "如鸢")
            }.code,
        )
        every { tokens.revokeByAccount("owner", "b") } throws IllegalStateException("injected cascade failure")
        assertThrows(IllegalStateException::class.java) { lifecycle.delete("owner", "b") }
        assertNotNull(repository.find("owner", "b"))
        assertNotNull(mongo.findById("doc-b", SubAccount::class.java))
        every { tokens.revokeByAccount("owner", "b") } returns Unit
        lifecycle.delete("owner", "b")
        assertNull(repository.find("owner", "b"))
        assertNull(mongo.findById("doc-b", SubAccount::class.java))
        assertEquals(
            404,
            assertThrows(InventoryApiException::class.java) {
                service.update("owner", "b", 0, listOf(completed))
            }.status.value(),
        )
    }

    @Test
    fun `deletion and game change racing writes cannot revive or convert records`() {
        concurrent(
            listOf({ service.update("owner", "a", 0, listOf(completed)) }, {
                lifecycle.delete("owner", "a")
                true
            }),
        )
        if (mongo.findById("doc-a", SubAccount::class.java) != null) lifecycle.delete("owner", "a")
        assertNull(repository.find("owner", "a"))
        concurrent(listOf({ service.update("owner", "b", 0, listOf(completed)) }, { lifecycle.update("owner", "b", null, "如鸢") }))
        val owner = mongo.findById("doc-b", SubAccount::class.java)!!
        val archive = repository.find("owner", "b")
        if (archive != null) assertEquals(owner.game, archive.game)
        if (owner.game == "如鸢") assertNull(archive)
        assertFalse(mongo.collectionExists("achievement_import_previews"))
    }

    private fun concurrent(actions: List<() -> Any>): List<Result<Any>> {
        val pool = Executors.newFixedThreadPool(actions.size)
        val start = CountDownLatch(1)
        return try {
            val futures = actions.map { action ->
                pool.submit(
                    Callable {
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching(action)
                    },
                )
            }
            start.countDown()
            futures.map { it.get(30, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `legacy fractional progress exports unchanged survives unrelated edits and rejects restore without truncation`() {
        repository.save(
            AchievementArchive(
                "legacy-fraction",
                "owner",
                "a",
                "代号鸢",
                records = listOf(
                    com.lhs.share.hub.repository.entity.AchievementRecord(
                        id,
                        progress = 1.5,
                        updatedAt = java.time.Instant.EPOCH,
                        revision = 1,
                        source = "manual",
                    ),
                ),
            ),
        )
        val read = service.archive("owner", "a")
        assertEquals(1.5, read.records.single().progress)
        val edited = service.update("owner", "a", read.revision, listOf(fixturePatch("""{"achievement_id":"$id","note":"保留小数"}""")))
        assertEquals(1.5, edited.records.single().progress)
        val exported = service.export("owner", "a")
        assertEquals(1.5, exported.records.single().progress)
        val request = AchievementImportRequest("b", mapper.valueToTree(exported), "use_file", false)
        val preview = service.preview("owner", request)
        assertEquals(1, preview.stats.getValue("invalid"))
        assertTrue(preview.items.single().message!!.contains("不能自动截断"))
        assertThrows(InventoryApiException::class.java) {
            service.confirm(
                "owner",
                request.copy(
                    expectedRevision = preview.expectedRevision,
                    catalogVersion = preview.catalogVersion,
                    previewToken = preview.previewToken,
                ),
            )
        }
        assertTrue(service.archive("owner", "b").records.isEmpty())
    }
}
