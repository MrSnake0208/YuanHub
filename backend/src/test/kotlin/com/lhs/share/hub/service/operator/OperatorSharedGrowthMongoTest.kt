package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorCurrentRepositoryImpl
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.star.StarStateService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

/** Uses only owned disposable Mongo; does not load the application's configured services. */
@Tag("integration")
class OperatorSharedGrowthMongoTest {
    private val database = TestMongo.database("sp_growth")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val current = factory.getRepository(
        OperatorCurrentRepository::class.java,
        RepositoryFragments.just(OperatorCurrentRepositoryImpl(template)),
    )
    private val corrections = factory.getRepository(OperatorCorrectionRecordRepository::class.java)
    private val records = factory.getRepository(OperatorRecordRepository::class.java)
    private val audits = factory.getRepository(OperatorV3ImportRecordRepository::class.java)
    private val accounts = mockk<SubAccountRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val transactions = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val service =
        OperatorService(
            accounts,
            current,
            records,
            mockk<OperatorCatalogRepository>(),
            catalog,
            transactions,
            corrections,
            mockk<StarStateService>(relaxed = true),
        )
    private val imports = OperatorV3ImportService(
        mapper, OperatorV3SchemaValidator(mapper), accounts, catalog, service, audits,
        mockk<AccountEventService>(relaxed = true), mockk<OperatorScanReviewRepository>(relaxed = true),
        transactionTemplate = transactions,
        subjectiveService = mockk(relaxed = true),
    )

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId("owner", "account") } returns
            SubAccount(userId = "owner", accountId = "account", name = "test", game = "如鸢")
        every { catalog.getOperator(any()) } answers {
            val id = firstArg<String>()
            OperatorCatalogEntity(
                operatorId = id, name = id, rarity = 5,
                prof = listOf("风"),
                subProf = listOf("shenji"),
                games = listOf("如鸢"),
                discs = emptyList(),
                starStones = emptyList(),
                catalogVersion = "test",
                spOf = if (id == "base") null else "base",
            )
        }
        every { catalog.spFormsOf("base") } returns listOf("movie", "sibling")
        listOf("operator_current", "operator_correction_records", "operator_records", "operator_v3_import_records").forEach {
            template.createCollection(it)
        }
        resetCurrent()
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun resetCurrent(starLevel: Int = 31) {
        current.save(
            OperatorCurrent(
                "state",
                "owner",
                "account",
                "如鸢",
                entries = mapOf(
                    "base" to
                        OperatorEntry(
                            16,
                            starLevel,
                            90,
                            revision = 7,
                            combatStats = OperatorCombatStats(observedAttack = 100, observedStatus = "valid"),
                        ),
                    "movie" to OperatorEntry(16, 2, 90, revision = 7),
                ),
            ),
        )
    }

    private fun document(id: String, reverse: Boolean = false, conflict: Boolean = false): ObjectNode {
        val rows = listOf(
            """{"operator_id":"base","level":100,"elite":17,"star_level":31,"section_status":{"basic":"ready","huaji":"ready"}}""",
            """{"operator_id":"movie","level":${if (conflict) 95 else 100},"elite":17,"star_level":3,
              "section_status":{"basic":"ready","huaji":"ready"}}""",
        ).let { if (reverse) it.reversed() else it }
        return mapper.readTree(
            """{"account_mapping":{"local":"account"},"document":{
          "format":"myshare-operator-exchange","version":3,"exported_at":"2026-10-05T00:00:00Z",
          "producer":{"platform":"test","version":"1"},"accounts":[{"id":"local","name":"测试账号","game_scope":"如鸢"}],
          "records":[{"account_id":"local","record_id":"$id","record_type":"operator_snapshot","game":"如鸢",
          "effective_at":"2026-10-05T00:00:00Z","snapshot_scope":"listed","source_kind":"scan","entries":[${rows.joinToString(",")}]}]}}""",
        ) as ObjectNode
    }

    @Test
    fun `consistent multi-form v3 commits in either order with final revisions and independent stars`() {
        for (reverse in listOf(false, true)) {
            resetCurrent()
            val result = imports.commitBrowser("owner", document("batch-$reverse", reverse))
            val entries = current.findById("state").orElseThrow().entries
            assertEquals(setOf(100), entries.values.map { it.level }.toSet())
            assertEquals(setOf(17), entries.values.map { it.elite }.toSet())
            assertEquals(31, entries.getValue("base").starLevel)
            assertEquals(3, entries.getValue("movie").starLevel)
            assertEquals(0, entries.getValue("sibling").starLevel)
            assertEquals("stale", entries.getValue("base").combatStats?.observedStatus)
            result.items.forEach { assertEquals(entries.getValue(it.operatorId).revision, it.revision) }
        }
    }

    @Test
    fun `30 scan remains idempotent for confirmed awake values and contradictory body cannot overwrite`() {
        for (awakened in listOf(true, false)) {
            resetCurrent()
            val patch = mapper.readTree(
                """{"expected_revision":7,"reason":"manual_correction","huaji":{"owned":true,"stage":25,"awakened":$awakened}}""",
            ) as ObjectNode
            val confirmed = service.patchCurrent("owner", "account", "如鸢", "base", patch)
            val command = document("thirty-$awakened")
            val record = command.path("document").path("records").get(0) as ObjectNode
            record.put("effective_at", Instant.now().plusSeconds(1).toString())
            record.set<com.fasterxml.jackson.databind.JsonNode>(
                "entries",
                mapper.readTree("""[{"operator_id":"base","star_level":30}]"""),
            )
            val before = current.findById("state").orElseThrow()
            assertEquals(1, imports.previewBrowser("owner", command).unchanged)
            assertEquals(1, imports.commitBrowser("owner", command).unchanged)
            assertEquals(1, imports.commitBrowser("owner", command).unchanged)
            record.put("record_id", "thirty-again-$awakened")
            assertEquals(1, imports.commitBrowser("owner", command).unchanged)
            assertEquals(before, current.findById("state").orElseThrow())
            val read = service.current("owner", "account", "如鸢").single().entries.getValue("base")
            assertEquals(confirmed.revision, read.revision)
            assertEquals(awakened, read.huaji?.awakened)
            (record.path("entries").get(0) as ObjectNode).put("star_level", 19)
            assertEquals(1, imports.commitBrowser("owner", command).rejected)
            assertEquals(before, current.findById("state").orElseThrow())
        }
    }

    @Test
    fun `v2 camelCase 30 and 31 roundtrip preserves independent facts and semantic retries`() {
        every { accounts.findAllByUserIdAndAccountIdIn("owner", any()) } returns listOf(
            SubAccount(userId = "owner", accountId = "account", name = "test", game = "如鸢"),
        )
        for (awakened in listOf(true, false)) {
            resetCurrent(25)
            service.patchCurrent(
                "owner",
                "account",
                "如鸢",
                "base",
                mapper.readTree(
                    """{"expected_revision":7,"reason":"manual_correction","huaji":{"owned":true,"stage":25,"awakened":$awakened}}""",
                ) as ObjectNode,
            )
            val before = current.findById("state").orElseThrow()
            val document = mapper.readValue(
                """{"format":"myshare-operator-exchange","version":2,"exported_at":"2026-10-13T00:00:00Z",
                "producer":{"platform":"test"},"records":[{"account_id":"account","record_id":"v2-$awakened",
                "record_type":"operator_snapshot","game":"如鸢","effective_at":"${Instant.now().plusSeconds(1)}","snapshot_scope":"listed",
                "entries":[{"id":"base","elite":16,"level":90,"starLevel":30}]}]}""",
                com.lhs.share.hub.controller.operator.request.OperatorImportRequest::class.java,
            )
            val wire = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(document)
            assertEquals(30, wire.path("records").get(0).path("entries").get(0).path("starLevel").asInt())
            assertEquals(1, service.import("owner", document).accepted)
            assertEquals(1, service.import("owner", document).duplicates)
            val precisionConflict = document.copy(
                records = document.records.map {
                    it.copy(effectiveAt = Instant.parse(it.effectiveAt).plusNanos(1).toString())
                },
            )
            assertThrows(OperatorApiException::class.java) { service.import("owner", precisionConflict) }
            val again = document.copy(records = document.records.map { it.copy(recordId = "v2-again-$awakened") })
            assertEquals(1, service.import("owner", again).accepted)
            val after = current.findById("state").orElseThrow()
            val baselineAt = Instant.parse(document.records.single().effectiveAt).truncatedTo(java.time.temporal.ChronoUnit.MILLIS)
            assertEquals(
                before.copy(
                    updatedAt = after.updatedAt,
                    entries = before.entries + ("base" to before.entries.getValue("base").copy(listedBaselineAt = baselineAt)),
                ),
                after,
            )
            val conflicting = again.copy(
                records = again.records.map {
                    it.copy(entries = it.entries.map { row -> row.copy(starLevel = 19) })
                },
            )
            assertThrows(OperatorApiException::class.java) { service.import("owner", conflicting) }
            assertEquals(after, current.findById("state").orElseThrow())
            val awake = document.copy(
                records = document.records.map {
                    it.copy(recordId = "v2-awake-$awakened", entries = it.entries.map { row -> row.copy(starLevel = 31) })
                },
            )
            assertEquals(1, service.import("owner", awake).accepted)
            val read = service.current("owner", "account", "如鸢").single().entries.getValue("base")
            assertEquals(25, read.huaji?.stage)
            assertEquals(true, read.huaji?.awakened)
        }
    }

    @Test
    fun `five star awakening uses CAS and rejects lower star writes without side effects`() {
        val request = mapper.readTree(
            """{"expected_revision":7,"reason":"manual_correction","huaji":{"owned":true,"stage":25,"awakened":false}}""",
        ) as ObjectNode
        val beforeInvalid = current.findById("state").orElseThrow()
        val invalid = request.deepCopy().apply {
            (get("huaji") as ObjectNode).put("stage", 24).put("awakened", true)
        }
        assertThrows(OperatorApiException::class.java) { service.patchCurrent("owner", "account", "如鸢", "base", invalid) }
        assertEquals(beforeInvalid, current.findById("state").orElseThrow())
        val first = service.patchCurrent("owner", "account", "如鸢", "base", request)
        val beforeSibling = current.findById("state").orElseThrow().entries.getValue("movie")
        request.put("expected_revision", first.revision)
        request.set<com.fasterxml.jackson.databind.JsonNode>("huaji", mapper.readTree("""{"awakened":true}"""))
        val second = service.patchCurrent("owner", "account", "如鸢", "base", request)
        assertEquals(25, second.huaji?.stage)
        assertEquals(true, service.current("owner", "account", "如鸢").single().entries.getValue("base").huaji?.awakened)
        assertEquals(beforeSibling, current.findById("state").orElseThrow().entries.getValue("movie"))
        val before = current.findById("state").orElseThrow()
        val auditCount = corrections.count()
        assertThrows(OperatorApiException::class.java) { service.patchCurrent("owner", "account", "如鸢", "base", request) }
        assertEquals(before, current.findById("state").orElseThrow())
        assertEquals(auditCount, corrections.count())
    }

    @Test
    fun `v4 backup and import normalize confirmed awakening to five stars and preserve legacy trace`() {
        val source = current.findById("state").orElseThrow()
        val facts = com.lhs.share.hub.repository.entity.OperatorHuaji(true, null, true)
        val trace = com.lhs.share.hub.repository.entity.OperatorHuajiLegacy(31, "legacy_current")
        current.save(source.copy(entries = mapOf("base" to source.entries.getValue("base").copy(huaji = facts, huajiLegacy = trace))))
        val annotations = mockk<com.lhs.share.hub.repository.OperatorAnnotationRepository>()
        val targets = mockk<com.lhs.share.hub.repository.OperatorGrowthTargetRepository>()
        val favorites = mockk<com.lhs.share.hub.repository.InventoryAgentFavoriteRepository>()
        every { accounts.findByUserIdAndAccountId("owner", "account") } returns
            SubAccount(userId = "owner", accountId = "account", name = "测试", game = "如鸢")
        every { annotations.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("owner", "account") } returns emptyList()
        every { targets.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("owner", "account") } returns emptyList()
        every { favorites.findAllByUserIdAndAccountIdOrderByAgentIdAsc("owner", "account") } returns emptyList()
        every { catalog.currentCatalogVersion() } returns "test"
        val exporter = OperatorV3ExportService(mapper, accounts, current, annotations, targets, favorites, catalog)
        val exported = exporter.export("owner", "account", null, 4)
        OperatorV3SchemaValidator(mapper).validate(exported)
        val firstRecord = exported.path("records").get(0) as ObjectNode
        val entry = firstRecord.path("entries").get(0)
        assertEquals(25, entry.path("huaji").path("stage").asInt())
        assertEquals(true, entry.path("huaji").path("awakened").asBoolean())
        assertEquals(31, entry.path("huaji_legacy").path("raw").asInt())
        (exported.path("records") as com.fasterxml.jackson.databind.node.ArrayNode).remove(1)
        // Export files cross JSON transport, which removes JVM-specific LongNode/IntNode distinctions.
        val transported = mapper.readTree(mapper.writeValueAsString(exported)) as ObjectNode
        current.deleteAll()
        val committed = imports.commitBrowser("owner", transported)
        assertEquals(0, committed.rejected)
        val read = service.current("owner", "account", "如鸢").single().entries.getValue("base")
        assertEquals(facts.copy(stage = 25), read.huaji)
        assertEquals(trace, read.huajiLegacy)
        assertEquals(1, imports.commitBrowser("owner", transported).unchanged)
        val invalid = transported.deepCopy()
        val invalidFacts = invalid.path("records").get(0).path("entries").get(0).path("huaji") as ObjectNode
        invalidFacts.put("owned", false).put("stage", 25)
        assertThrows(OperatorApiException::class.java) { imports.previewBrowser("owner", invalid) }
    }

    @Test
    fun `v4 false null and missing facts retain their distinct meanings through Mongo`() {
        for (awakened in listOf(false, null)) {
            resetCurrent()
            val command = document("v4-$awakened")
            val root = command.path("document") as ObjectNode
            root.put("version", 4)
            val record = root.path("records").get(0) as ObjectNode
            record.put("source_kind", "backup")
            record.set<com.fasterxml.jackson.databind.JsonNode>(
                "entries",
                mapper.readTree(
                    """[{"operator_id":"base","huaji":{"owned":true,"stage":null,"awakened":$awakened},"huaji_legacy":{"raw":31,"source":"legacy_fixture"}}]""",
                ),
            )
            assertEquals(1, imports.commitBrowser("owner", command).accepted)
            val before = current.findById("state").orElseThrow()
            val read = service.current("owner", "account", "如鸢").single().entries.getValue("base")
            assertEquals(true, read.huaji?.owned)
            assertEquals(null, read.huaji?.stage)
            assertEquals(awakened, read.huaji?.awakened)
            record.put("record_id", "missing-$awakened")
            record.set<com.fasterxml.jackson.databind.JsonNode>("entries", mapper.readTree("""[{"operator_id":"base","level":90}]"""))
            assertEquals(1, imports.commitBrowser("owner", command).unchanged)
            assertEquals(before, current.findById("state").orElseThrow())
            assertEquals(awakened, service.current("owner", "account", "如鸢").single().entries.getValue("base").huaji?.awakened)
        }
    }

    @Test
    fun `hidden legacy anomaly remains isolated while another valid entry commits`() {
        val hidden = catalog.getOperator("base")!!.copy(operatorId = "hidden", rarity = 3)
        every { catalog.getOperator("hidden") } returns hidden
        every { catalog.spFormsOf("hidden") } returns emptyList()
        for (raw in listOf(20, 24, 25, 30, 31)) {
            val command = document("hidden-$raw")
            val record = command.path("document").path("records").get(0) as ObjectNode
            record.put("source_kind", "backup")
            record.set<com.fasterxml.jackson.databind.JsonNode>(
                "entries",
                mapper.readTree(
                    """[{"operator_id":"hidden","star_level":$raw},{"operator_id":"base","star_level":25}]""",
                ),
            )
            val result = imports.commitBrowser("owner", command)
            assertEquals(1, result.review)
            assertEquals(0, result.rejected)
            assertEquals(false, current.findById("state").orElseThrow().entries.containsKey("hidden"))
            assertEquals(25, service.current("owner", "account", "如鸢").single().entries.getValue("base").huaji?.stage)
            val audit = audits.findByUserIdAndAccountIdAndRecordId("owner", "account", "hidden-$raw")!!
            assertEquals(raw, mapper.readTree(audit.payload).path("entries").get(0).path("star_level").asInt())
            assertEquals(1, imports.commitBrowser("owner", command).review)
        }
    }

    @Test
    fun `three star historical normalized nodes survive unrelated PATCH and export as review trace`() {
        val hidden = catalog.getOperator("base")!!.copy(rarity = 3)
        every { catalog.getOperator("base") } returns hidden
        every { catalog.spFormsOf("base") } returns emptyList()
        val before = current.findById("state").orElseThrow()
        val historical = before.entries.getValue(
            "base",
        ).copy(starLevel = 22, huaji = com.lhs.share.hub.repository.entity.OperatorHuaji(true, 22, null))
        current.save(before.copy(entries = mapOf("base" to historical)))
        val request = mapper.readTree("""{"expected_revision":7,"reason":"manual_correction","elite":17}""") as ObjectNode
        val shown = service.patchCurrent("owner", "account", "如鸢", "base", request)
        assertNull(shown.huaji?.stage)
        assertEquals(22, shown.huajiLegacy?.raw)
        val stored = current.findById("state").orElseThrow().entries.getValue("base")
        assertEquals(22, stored.huaji?.stage)
        assertEquals(22, stored.starLevel)
        val annotations = mockk<com.lhs.share.hub.repository.OperatorAnnotationRepository>()
        val targets = mockk<com.lhs.share.hub.repository.OperatorGrowthTargetRepository>()
        val favorites = mockk<com.lhs.share.hub.repository.InventoryAgentFavoriteRepository>()
        every { annotations.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(any(), any()) } returns emptyList()
        every { targets.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(any(), any()) } returns emptyList()
        every { favorites.findAllByUserIdAndAccountIdOrderByAgentIdAsc(any(), any()) } returns emptyList()
        every { catalog.currentCatalogVersion() } returns "test"
        val exports = OperatorV3ExportService(mapper, accounts, current, annotations, targets, favorites, catalog)
        val document = exports.export("owner", "account", null, 5)
        OperatorV3SchemaValidator(mapper).validate(document)
        val exported = document.path("records")[0].path("entries")[0]
        assertEquals(true, exported.path("huaji").path("stage").isNull)
        assertEquals(22, exported.path("huaji_legacy").path("raw").asInt())
    }

    @Test
    fun `final upgrade is atomic and hidden terminal or forged execute cannot consume inventory`() {
        val inventories = factory.getRepository(com.lhs.share.hub.repository.InventoryCurrentRepository::class.java)
        val inventoryRecords = factory.getRepository(com.lhs.share.hub.repository.InventoryRecordRepository::class.java)
        val revisions = factory.getRepository(
            com.lhs.share.hub.repository.InventoryRevisionRepository::class.java,
            RepositoryFragments.just(com.lhs.share.hub.repository.InventoryRevisionRepositoryImpl(template)),
        )
        val upgrades = factory.getRepository(com.lhs.share.hub.repository.OperatorUpgradeTransactionRepository::class.java)
        listOf("inventory_current", "inventory_records", "inventory_revision", "operator_upgrade_transaction").forEach {
            template.createCollection(it)
        }
        val growth = current.findById("state").orElseThrow()
        current.save(
            growth.copy(
                entries = growth.entries + (
                    "base" to growth.entries.getValue("base").copy(
                        starLevel = 24,
                        huaji = com.lhs.share.hub.repository.entity.OperatorHuaji(true, 24, false),
                    )
                    ),
            ),
        )
        inventories.save(
            com.lhs.share.hub.repository.entity.InventoryCurrent(
                id = "heart-stock",
                userId = "owner",
                accountId = "account",
                entityType = "agent",
                entries = mapOf("base" to com.lhs.share.hub.repository.entity.StockEntry(1000)),
            ),
        )
        inventories.save(
            com.lhs.share.hub.repository.entity.InventoryCurrent(
                id = "glass-stock",
                userId = "owner",
                accountId = "account",
                entityType = "item",
                entries = mapOf("zhuangjinboli" to com.lhs.share.hub.repository.entity.StockEntry(100)),
            ),
        )
        val upgrade = OperatorUpgradeService(
            accounts, catalog, current, inventories, inventoryRecords, revisions, upgrades,
            mockk<AccountEventService>(relaxed = true), transactions, corrections,
        )
        val request = com.lhs.share.hub.controller.operator.request.OperatorUpgradeRequest("account", "如鸢", "base", "huaji", 25, 7)
        val preview = upgrade.preview("owner", request)
        val original = catalog.getOperator("base")!!
        val before = current.findById("state").orElseThrow()
        val stockBefore = inventories.findAll()
        every { catalog.getOperator("base") } returns original.copy(rarity = 3)
        assertThrows(OperatorApiException::class.java) { upgrade.preview("owner", request) }
        val execute = com.lhs.share.hub.controller.operator.request.OperatorUpgradeExecuteRequest(
            "account",
            "如鸢",
            "base",
            "huaji",
            25,
            7,
            0,
            preview.previewToken,
        )
        assertThrows(OperatorApiException::class.java) { upgrade.execute("owner", "denied", execute) }
        assertEquals(before, current.findById("state").orElseThrow())
        assertEquals(stockBefore, inventories.findAll())
        assertEquals(0L, inventoryRecords.count())
        assertEquals(0L, upgrades.count())
        assertEquals(0L, revisions.count())
        every { catalog.getOperator("base") } returns original
        val first = upgrade.execute("owner", "five-star", execute)
        assertEquals(first, upgrade.execute("owner", "five-star", execute))
        assertEquals(920, inventories.findById("heart-stock").orElseThrow().entries.getValue("base").count)
        assertEquals(100, inventories.findById("glass-stock").orElseThrow().entries.getValue("zhuangjinboli").count)
        assertEquals(false, current.findById("state").orElseThrow().entries.getValue("base").huaji?.awakened)
        assertEquals(1L, inventoryRecords.count())
        assertEquals(1L, upgrades.count())
        val conflicting = execute.copy(target = 24)
        assertThrows(OperatorApiException::class.java) { upgrade.execute("owner", "five-star", conflicting) }
        assertEquals(920, inventories.findById("heart-stock").orElseThrow().entries.getValue("base").count)

        val foreignStock = inventories.save(
            com.lhs.share.hub.repository.entity.InventoryCurrent(
                id = "foreign-stock",
                userId = "other-owner",
                accountId = "account",
                entityType = "agent",
                entries = mapOf("base" to com.lhs.share.hub.repository.entity.StockEntry(500)),
                updatedAt = Instant.EPOCH,
            ),
        )
        val awakeningRequest = request.copy(dimension = "awakening", target = 1, expectedOperatorRevision = 8)
        val beforeAwakening = current.findById("state").orElseThrow()
        val stockBeforeAwakening = inventories.findAll().associateBy { it.id }
        val correctionsBefore = corrections.count()
        val failingUpgrades = object : com.lhs.share.hub.repository.OperatorUpgradeTransactionRepository by upgrades {
            override fun <S : com.lhs.share.hub.repository.entity.OperatorUpgradeTransaction> save(entity: S): S =
                throw IllegalStateException("injected late write failure")
        }
        val failingService = OperatorUpgradeService(
            accounts, catalog, current, inventories, inventoryRecords, revisions, failingUpgrades,
            mockk<AccountEventService>(relaxed = true), transactions, corrections,
        )
        val failedPreview = failingService.preview("owner", awakeningRequest)
        val awakeningExecute = execute.copy(
            dimension = "awakening",
            target = 1,
            expectedOperatorRevision = 8,
            expectedInventoryRevision = 1,
            previewToken = failedPreview.previewToken,
        )
        assertThrows(IllegalStateException::class.java) { failingService.execute("owner", "rolled-back-awakening", awakeningExecute) }
        assertEquals(beforeAwakening, current.findById("state").orElseThrow())
        assertEquals(stockBeforeAwakening, inventories.findAll().associateBy { it.id })
        assertEquals(correctionsBefore, corrections.count())
        assertEquals(1L, inventoryRecords.count())
        assertEquals(1L, upgrades.count())
        assertEquals(1L, revisions.findByUserIdAndAccountId("owner", "account")!!.revision)

        val awakeningPreview = upgrade.preview("owner", awakeningRequest)
        val confirmed = awakeningExecute.copy(previewToken = awakeningPreview.previewToken)
        val awakened = upgrade.execute("owner", "awakening", confirmed)
        assertEquals(awakened, upgrade.execute("owner", "awakening", confirmed))
        assertEquals(25, awakened.operator.starLevel)
        assertEquals(com.lhs.share.hub.repository.entity.OperatorHuaji(true, 25, true), awakened.operator.huaji)
        assertEquals(820, inventories.findById("heart-stock").orElseThrow().entries.getValue("base").count)
        assertEquals(99, inventories.findById("glass-stock").orElseThrow().entries.getValue("zhuangjinboli").count)
        assertEquals(foreignStock, inventories.findById("foreign-stock").orElseThrow())
        val afterAwakening = current.findById("state").orElseThrow()
        for (id in listOf("movie", "sibling")) assertEquals(beforeAwakening.entries[id], afterAwakening.entries[id])
        assertEquals(3L, inventoryRecords.count())
        assertEquals(2L, upgrades.count())
        assertEquals(2L, revisions.findByUserIdAndAccountId("owner", "account")!!.revision)
        assertThrows(OperatorApiException::class.java) {
            upgrade.preview("owner", awakeningRequest.copy(expectedOperatorRevision = 9))
        }
        assertEquals(3L, inventoryRecords.count())
    }

    @Test
    fun `conflicting group rejects preview and commit without current corrections or audit writes`() {
        val before = current.findById("state").orElseThrow()
        assertEquals(2, imports.previewBrowser("owner", document("conflict", conflict = true)).rejected)
        assertEquals(2, imports.commitBrowser("owner", document("conflict", conflict = true)).rejected)
        assertEquals(before, current.findById("state").orElseThrow())
        assertEquals(0L, corrections.count())
        assertEquals(0L, audits.count())
    }

    @Test
    fun `breakthrough v5 shares facts keeps unknown captures and rolls back atomically`() {
        val before = current.findById("state").orElseThrow()
        val captured = com.lhs.share.hub.repository.entity.OperatorObservedInputs(level = 90, levelBreakthroughStage = null)
        current.save(
            before.copy(
                entries = before.entries.mapValues { (_, value) ->
                    value.copy(combatStats = value.combatStats?.copy(observedInputs = captured, observedStatus = "unverified"))
                },
            ),
        )
        val doc = document("breakthrough")
        (doc.path("document") as ObjectNode).put("version", 5)
        val record = doc.path("document").path("records").get(0) as ObjectNode
        record.put("source_kind", "manual")
        record.set<com.fasterxml.jackson.databind.JsonNode>(
            "entries",
            mapper.readTree(
                """[{"operator_id":"base","level_breakthrough_stage":9}]""",
            ),
        )
        assertEquals(1, imports.commitBrowser("owner", doc).accepted)
        val changed = current.findById("state").orElseThrow()
        assertEquals(setOf(9), changed.entries.values.map { it.levelBreakthroughStage }.toSet())
        assertEquals(captured, changed.entries.getValue("base").combatStats!!.observedInputs)
        assertEquals("stale", changed.entries.getValue("base").combatStats!!.observedStatus)
        val correctionsCount = corrections.count()
        imports.commitBrowser("owner", doc)
        assertEquals(changed, current.findById("state").orElseThrow())
        assertEquals(correctionsCount, corrections.count())
        assertThrows(IllegalStateException::class.java) {
            transactions.executeWithoutResult {
                service.patchCurrent(
                    "owner",
                    "account",
                    "如鸢",
                    "movie",
                    mapper.readTree(
                        """{"level_breakthrough_stage":8,"expected_revision":8,"reason":"manual_correction"}""",
                    ) as ObjectNode,
                )
                error("force breakthrough rollback")
            }
        }
        assertEquals(changed, current.findById("state").orElseThrow())
        assertEquals(correctionsCount, corrections.count())
        every { catalog.currentCatalogVersion() } returns "test"
        val exporter = OperatorV3ExportService(
            mapper,
            accounts,
            current,
            mockk<com.lhs.share.hub.repository.OperatorAnnotationRepository>(relaxed = true),
            mockk<com.lhs.share.hub.repository.OperatorGrowthTargetRepository>(relaxed = true),
            mockk<com.lhs.share.hub.repository.InventoryAgentFavoriteRepository>(relaxed = true),
            catalog,
        )
        val backup = exporter.export("owner", "account", null, 5)
        current.deleteById("state")
        val wrapper = mapper.createObjectNode()
        wrapper.set<com.fasterxml.jackson.databind.JsonNode>("document", backup)
        wrapper.set<com.fasterxml.jackson.databind.JsonNode>("account_mapping", mapper.createObjectNode().put("account", "account"))
        imports.commitBrowser("owner", wrapper)
        val restored = current.findByUserIdAndAccountIdAndGame("owner", "account", "如鸢")!!
        assertEquals(setOf(9), restored.entries.values.map { it.levelBreakthroughStage }.toSet())
        assertEquals(captured, restored.entries.getValue("base").combatStats!!.observedInputs)
        assertEquals(
            changed.entries.getValue("base").combatStats!!.observedStatus,
            restored.entries.getValue("base").combatStats!!.observedStatus,
        )
    }

    @Test
    fun `related CAS conflict cannot overwrite another form and transaction rollback removes all group writes`() {
        val entries = current.findById("state").orElseThrow().entries
        val stale = entries.mapValues { (_, value) -> value.copy(levelBreakthroughStage = 9, revision = 8) }
        current.compareAndSetEntries(
            "owner",
            "account",
            "如鸢",
            "movie",
            7,
            mapOf(
                "movie" to entries.getValue("movie").copy(starLevel = 3, revision = 8),
            ),
            Instant.now(),
        )
        assertNull(current.compareAndSetEntries("owner", "account", "如鸢", "base", 7, stale, Instant.now()))
        resetCurrent()
        assertThrows(IllegalStateException::class.java) {
            transactions.executeWithoutResult {
                service.patchCurrent(
                    "owner",
                    "account",
                    "如鸢",
                    "base",
                    mapper.readTree("""{"level":100,"expected_revision":7,"reason":"manual_correction"}""") as ObjectNode,
                )
                error("force rollback")
            }
        }
        assertEquals(entries, current.findById("state").orElseThrow().entries)
        assertEquals(0L, corrections.count())
    }
}
