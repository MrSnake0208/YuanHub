package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarLoadoutCurrentRequest
import com.lhs.share.hub.controller.star.request.StarScanApplyRequest
import com.lhs.share.hub.controller.star.request.StarScanObservation
import com.lhs.share.hub.controller.star.request.StarScanReportRequest
import com.lhs.share.hub.controller.star.request.StarScanSelection
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarStateRestoreRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepositoryImpl
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.StarScanRecordRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.repository.entity.snapshot
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
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
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Isolated, disposable replica-set database; the application's live collections are never used. */
@Tag("integration")
class StarStateMongoTransactionTest {
    private val database = TestMongo.database("star")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val states = factory.getRepository(
        StarStateCurrentRepository::class.java,
        RepositoryFragments.just(StarStateCurrentRepositoryImpl(template)),
    )
    private val loadouts = factory.getRepository(
        StarLoadoutCurrentRepository::class.java,
        RepositoryFragments.just(StarLoadoutCurrentRepositoryImpl(template)),
    )
    private val points = factory.getRepository(StarRecoveryPointRepository::class.java)
    private val operators = mockk<OperatorCurrentRepository>()
    private val accounts = mockk<SubAccountService>()
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val stateService = StarStateService(states, points, loadouts, operators, accounts, tx)
    private val loadoutService = StarLoadoutService(loadouts, states, accounts, stateService, tx)
    private val now = Instant.parse("2026-09-19T00:00:00Z")
    private val account = SubAccount(userId = "owner", accountId = "a", name = "test", game = "如鸢")

    @BeforeEach fun setup() {
        listOf("star_state_current", "star_recovery_points", "star_loadout_current").forEach { template.createCollection(it) }
        every { accounts.requireAccount("owner", "a") } returns account
        every { operators.findByUserIdAndAccountIdOrderByUpdatedAtDesc("owner", "a") } returns listOf(
            OperatorCurrent(
                userId = "owner",
                accountId = "a",
                game = "如鸢",
                entries = mapOf(
                    "operator.1" to OperatorEntry(elite = 0, starLevel = 0, level = 1),
                    "operator.2" to OperatorEntry(elite = 0, starLevel = 0, level = 1),
                ),
            ),
        )
    }

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun scanService(
        records: StarScanRecordRepository = factory.getRepository(StarScanRecordRepository::class.java),
    ): StarScanService = StarScanService(
        records,
        accounts,
        factory.getRepository(SubAccountRepository::class.java, RepositoryFragments.just(SubAccountRepositoryImpl(template))),
        stateService,
        loadouts,
        mockk<AccountEventService>(relaxed = true),
        jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE),
        tx,
    )

    private fun report() = StarScanReportRequest(
        format = "myshare-star-scan", version = 1, recordId = "scan1", expectedAccountId = "a", game = "如鸢",
        capturedAt = now, width = 720, height = 1280, dpi = 320,
        sections = mapOf("main" to true, "support" to true, "experience" to true),
        entries = listOf(StarScanObservation("o1", "main", "天府", "orange", 20)),
    )

    private fun prepareScan(): Pair<StarScanService, StarScanApplyRequest> {
        template.createCollection("star_scan_records")
        template.insert(account)
        stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                0,
                0,
                listOf(main("kept").copy(level = 20, breakthroughStage = IntNode(2))),
                mapOf("kept" to 50),
                StarWorkspaceExperienceRequest(3, 4, 5),
                StarWorkspaceBagRequest(1, 100),
            ),
        )
        val equipped = loadoutService.putCurrent("owner", "a", loadout(0, 0, "kept"))
        val service = scanService()
        service.upload("owner", "a", report())
        return service to StarScanApplyRequest(
            0,
            1,
            equipped.revision,
            listOf(StarScanSelection("o1", "kept", "main", "天府", "orange", 20)),
            experience = StarWorkspaceExperienceRequest(orange = 0),
        )
    }

    @Test fun `scan upload stages only then reviewed import preserves relations and retries exactly once`() {
        val (service, command) = prepareScan()
        assertEquals(1, stateService.current("owner", "a").revision)
        assertEquals("needs_review", service.upload("owner", "a", report()).status)
        assertThrows(InventoryApiException::class.java) { service.upload("owner", "a", report().copy(warnings = listOf("different"))) }
        val receipt = service.apply("owner", "a", "scan1", command)
        assertEquals("kept", receipt.state.inventory.single().instanceId)
        assertEquals(2, receipt.state.inventory.single().breakthroughStage)
        assertEquals(mapOf("kept" to 50), receipt.state.planTargets)
        assertEquals("kept", receipt.loadout.loadouts["operator.1"]?.get("main1"))
        assertEquals(0, receipt.state.experience.orange)
        assertEquals(4, receipt.state.experience.purple)
        assertNotNull(receipt.recoveryPoint)
        assertEquals(receipt, service.apply("owner", "a", "scan1", command))
        assertEquals(2, stateService.current("owner", "a").revision)
        assertTrue(service.pending("owner", "a").isEmpty())
        assertThrows(InventoryApiException::class.java) { service.apply("owner", "a", "scan1", command.copy(confirmRemovals = true)) }
        val point = points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", receipt.recoveryPoint!!.recoveryPointId)!!
        assertEquals("kept", point.loadouts!!.single().slots.main1)
    }

    @Test fun `real MaaYuan emulator report stages and imports without merging identical owned stars`() {
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val captured = javaClass.getResourceAsStream("/star/maayuan-720x1280-scan.json")!!.use {
            mapper.readValue(it, StarScanReportRequest::class.java)
        }
        assertEquals(230, captured.entries.size)
        assertEquals(4, captured.experience.purple)
        assertEquals(150, captured.experience.white)
        val capturedAccount = account.copy(game = captured.game)
        every { accounts.requireAccount("owner", "a") } returns capturedAccount
        template.createCollection("star_scan_records")
        template.insert(capturedAccount)
        val service = scanService()
        val before = stateService.current("owner", "a")
        service.upload("owner", "a", captured)
        assertEquals(before, stateService.current("owner", "a"))
        val command = StarScanApplyRequest(
            before.generation,
            before.revision,
            0,
            captured.entries.map {
                // Simulate the player filling unresolved levels before explicit confirmation.
                StarScanSelection(it.observationId, null, it.kind, checkNotNull(it.name), checkNotNull(it.quality), it.level ?: 1)
            },
            captured.experience,
            captured.bag,
        )
        val receipt = service.apply("owner", "a", captured.recordId, command)
        assertEquals(230, receipt.state.inventory.size)
        assertEquals(230, receipt.state.inventory.map { it.instanceId }.toSet().size)
        assertEquals(230, receipt.state.bag.currentCount)
        assertEquals(receipt, service.apply("owner", "a", captured.recordId, command))
        assertTrue(service.pending("owner", "a").isEmpty())
    }

    @Test fun `scan rejects stale loadouts missing removal confirmation foreign records and discarded batches`() {
        val (service, command) = prepareScan()
        assertThrows(InventoryApiException::class.java) { service.apply("owner", "a", "scan1", command.copy(expectedLoadoutRevision = 0)) }
        assertThrows(InventoryApiException::class.java) { service.apply("owner", "a", "scan1", command.copy(entries = emptyList())) }
        every { accounts.requireAccount("owner", "b") } returns account.copy(accountId = "b")
        assertThrows(InventoryApiException::class.java) { service.review("owner", "b", "scan1") }
        assertThrows(InventoryApiException::class.java) { service.upload("owner", "b", report()) }
        assertEquals(1, stateService.current("owner", "a").revision)
        service.discard("owner", "a", "scan1")
        assertEquals("discarded", service.upload("owner", "a", report()).status)
        assertThrows(InventoryApiException::class.java) { service.apply("owner", "a", "scan1", command) }
        assertEquals(1, stateService.current("owner", "a").revision)
    }

    @Test fun `scan receipt failure rolls back state loadouts and recovery point`() {
        val (_, command) = prepareScan()
        val real = factory.getRepository(StarScanRecordRepository::class.java)
        val failing = mockk<StarScanRecordRepository>()
        every { failing.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } answers {
            real.findByUserIdAndAccountIdAndRecordId(firstArg(), secondArg(), thirdArg())
        }
        every { failing.save(any()) } throws IllegalStateException("receipt write failed")
        assertThrows(IllegalStateException::class.java) {
            scanService(failing).apply("owner", "a", "scan1", command.copy(entries = emptyList(), confirmRemovals = true))
        }
        assertEquals("kept", stateService.current("owner", "a").inventory.single().instanceId)
        assertEquals(1, stateService.current("owner", "a").revision)
        assertEquals("kept", loadouts.findByUserIdAndAccountId("owner", "a")!!.loadouts.single().slots.main1)
        assertEquals(0, points.count())
        assertEquals(null, real.findByUserIdAndAccountIdAndRecordId("owner", "a", "scan1")!!.receipt)
    }

    @Test fun `legacy PATCH preserves breakthroughs explicit null clears and rebuild never inherits`() {
        val known = main("same").copy(level = 20, breakthroughStage = IntNode(2))
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(known)))
        fun patch(revision: Long, entry: StarInventoryEntryRequest) = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(1, revision, listOf(entry), emptyMap(), StarWorkspaceExperienceRequest(), StarWorkspaceBagRequest()),
        )
        val legacy = known.copy(breakthroughStage = null)
        val preserved = patch(1, legacy)
        assertEquals(2, preserved.state.inventory.single().breakthroughStage)
        assertEquals(1, preserved.state.revision)
        val cleared = patch(1, known.copy(breakthroughStage = NullNode.instance))
        assertEquals(null, cleared.state.inventory.single().breakthroughStage)
        patch(cleared.state.revision, known)
        val rebuilt = stateService.rebuild("owner", "a", rebuild(1, 3, "import_data_safety", listOf(legacy)))
        assertEquals(null, rebuilt.state.inventory.single().breakthroughStage)
        val restored = stateService.restore("owner", "a", rebuilt.recoveryPoint!!.recoveryPointId, StarStateRestoreRequest(2, 4))
        assertEquals(2, restored.state.inventory.single().breakthroughStage)
    }

    @Test fun `star quality limits and explicit impossible breakthroughs fail before persisting`() {
        for (entry in listOf(
            main("bad").copy(quality = "white", level = 31),
            main("bad").copy(level = 21, breakthroughStage = IntNode(1)),
        )) {
            assertThrows(InventoryApiException::class.java) {
                stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(entry)))
            }
        }
        assertEquals(null, states.findByUserIdAndAccountId("owner", "a"))
    }

    @Test fun `OCR rebuild checkpoints StarState and Loadout then restore creates a new generation`() {
        val first = stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old.1"))))
        assertEquals(1, first.state.generation)
        val equipped = loadoutService.putCurrent("owner", "a", loadout(1, 1, "old.1"))
        assertEquals("old.1", equipped.loadouts["operator.1"]?.get("main1"))
        val rebuilt = stateService.rebuild("owner", "a", rebuild(1, 1, "pre_ocr_rebuild", listOf(main("new.1"))))
        assertEquals(2, rebuilt.state.generation)
        assertTrue(rebuilt.loadout.loadouts.isEmpty())
        val pointId = rebuilt.recoveryPoint!!.recoveryPointId
        val point = points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", pointId)!!
        assertEquals("old.1", point.state.inventory.single().instanceId)
        assertEquals("old.1", point.loadouts!!.single().slots.main1)
        val restored = stateService.restore("owner", "a", pointId, StarStateRestoreRequest(2, 2))
        assertEquals(3, restored.state.generation)
        assertEquals("old.1", restored.loadout.loadouts["operator.1"]?.get("main1"))
        assertEquals(1, restored.recoverySummary!!.restoredSlots)
        assertNotNull(restored.recoveryPoint)
        assertThrows(InventoryApiException::class.java) {
            loadoutService.putCurrent("owner", "a", loadout(1, restored.loadout.revision, "old.1"))
        }.also { assertEquals("star_generation_changed", it.code) }
    }

    @Test fun `rebuild and restore preserve complete snapshots and a restorable safety point`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old"))))
        template.getCollection("star_loadout_preset_current").insertOne(
            Document("_id", "owner").append("sentinel", "stable"),
        )
        val old = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                1,
                listOf(main("old").copy(level = 40)),
                mapOf("old" to 60),
                StarWorkspaceExperienceRequest(4, 5, 6),
                StarWorkspaceBagRequest(7, 30),
            ),
        ).state
        loadoutService.putCurrent("owner", "a", loadout(1, 1, "old"))

        val replacement = stateService.rebuild(
            "owner",
            "a",
            StarStateRebuildRequest(
                1,
                old.revision,
                listOf(main("new")),
                emptyMap(),
                StarWorkspaceExperienceRequest(1, 2, 3),
                StarWorkspaceBagRequest(8, 40),
                "pre_ocr_rebuild",
            ),
        )
        val originalPoint = points.findByUserIdAndAccountIdAndRecoveryPointId(
            "owner",
            "a",
            replacement.recoveryPoint!!.recoveryPointId,
        )!!
        assertEquals(40, originalPoint.state.inventory.single().level)
        assertEquals(60, originalPoint.state.planTargets.single().targetLevel)
        assertEquals(4, originalPoint.state.experience.orange)
        assertEquals(5, originalPoint.state.experience.purple)
        assertEquals(6, originalPoint.state.experience.white)
        assertEquals(7, originalPoint.state.bag.currentCount)
        assertEquals(30, originalPoint.state.bag.capacity)
        assertEquals("old", originalPoint.loadouts!!.single().slots.main1)
        assertTrue(replacement.state.planTargets.isEmpty())
        assertEquals(1, replacement.state.experience.orange)
        assertEquals(8, replacement.state.bag.currentCount)
        assertTrue(replacement.loadout.loadouts.isEmpty())

        val restored = stateService.restore(
            "owner",
            "a",
            originalPoint.recoveryPointId,
            StarStateRestoreRequest(replacement.state.generation, replacement.state.revision),
        )
        assertEquals(3, restored.state.generation)
        assertEquals(old.inventory, restored.state.inventory)
        assertEquals(old.planTargets, restored.state.planTargets)
        assertEquals(old.experience, restored.state.experience)
        assertEquals(old.bag, restored.state.bag)
        assertEquals("old", restored.loadout.loadouts["operator.1"]?.get("main1"))

        val safetyId = restored.recoveryPoint!!.recoveryPointId
        val safety = points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", safetyId)!!
        assertEquals("restore_safety", safety.reason)
        assertEquals("new", safety.state.inventory.single().instanceId)
        assertTrue(safety.loadouts!!.isEmpty())
        val returned = stateService.restore(
            "owner",
            "a",
            safetyId,
            StarStateRestoreRequest(restored.state.generation, restored.state.revision),
        )
        assertEquals(4, returned.state.generation)
        assertEquals(replacement.state.inventory, returned.state.inventory)
        assertEquals(replacement.state.planTargets, returned.state.planTargets)
        assertEquals(replacement.state.experience, returned.state.experience)
        assertEquals(replacement.state.bag, returned.state.bag)
        assertTrue(returned.loadout.loadouts.isEmpty())
        assertEquals(
            "stable",
            template.getCollection("star_loadout_preset_current")
                .find(Document("_id", "owner")).first()?.getString("sentinel"),
        )
    }

    @Test fun `failed rebuild leaves current state loadout and recovery points untouched`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old"))))
        loadoutService.putCurrent("owner", "a", loadout(1, 1, "old"))
        val beforeState = states.findByUserIdAndAccountId("owner", "a")!!
        val beforeLoadout = loadouts.findByUserIdAndAccountId("owner", "a")!!
        assertEquals(0, points.count())

        assertEquals(
            "star_state_invalid_snapshot",
            assertThrows(InventoryApiException::class.java) {
                stateService.rebuild(
                    "owner",
                    "a",
                    StarStateRebuildRequest(
                        1,
                        1,
                        listOf(main("new")),
                        mapOf("new" to 50),
                        StarWorkspaceExperienceRequest(),
                        StarWorkspaceBagRequest(),
                        "pre_ocr_rebuild",
                    ),
                )
            }.code,
        )
        assertEquals(
            "star_state_revision_conflict",
            assertThrows(InventoryApiException::class.java) {
                stateService.rebuild("owner", "a", rebuild(1, 0, "pre_ocr_rebuild", listOf(main("new"))))
            }.code,
        )
        assertEquals(beforeState, states.findByUserIdAndAccountId("owner", "a"))
        assertEquals(beforeLoadout, loadouts.findByUserIdAndAccountId("owner", "a"))
        assertEquals(0, points.count())
    }

    @Test fun `same generation PATCH prunes deleted and historically stale Loadout references`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("keep"), main("remove"))))
        loadoutService.putCurrent(
            "owner",
            "a",
            StarLoadoutCurrentRequest(
                1,
                mapOf(
                    "operator.1" to mapOf(
                        "main1" to "remove",
                        "main2" to "keep",
                        "main3" to null,
                        "support1" to null,
                        "support2" to null,
                        "support3" to null,
                    ),
                ),
                1,
            ),
        )
        val edited = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                1,
                listOf(main("keep"), main("remove").copy(level = 50)),
                emptyMap(),
                StarWorkspaceExperienceRequest(),
                StarWorkspaceBagRequest(),
            ),
        )
        assertEquals(1, edited.state.generation)
        assertEquals(50, edited.state.inventory.single { it.instanceId == "remove" }.level)
        assertEquals("remove", edited.loadout.loadouts["operator.1"]?.get("main1"))
        assertEquals("keep", edited.loadout.loadouts["operator.1"]?.get("main2"))

        val patched = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                2,
                listOf(main("keep")),
                mapOf("keep" to 40, "remove" to 50),
                StarWorkspaceExperienceRequest(),
                StarWorkspaceBagRequest(),
            ),
        )
        assertEquals(1, patched.state.generation)
        assertEquals(3, patched.state.revision)
        assertEquals(null, patched.loadout.loadouts["operator.1"]?.get("main1"))
        assertEquals("keep", patched.loadout.loadouts["operator.1"]?.get("main2"))
        assertEquals(mapOf("keep" to 40), patched.state.planTargets)
        assertEquals(
            "star_state_revision_conflict",
            assertThrows(InventoryApiException::class.java) {
                stateService.patch(
                    "owner",
                    "a",
                    StarStatePatchRequest(
                        1,
                        1,
                        listOf(main("keep")),
                        emptyMap(),
                        StarWorkspaceExperienceRequest(),
                        StarWorkspaceBagRequest(),
                    ),
                )
            }.code,
        )
    }

    @Test fun `historical checkpoint without Loadout preserves only valid current references`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("same"))))
        loadoutService.putCurrent("owner", "a", loadout(1, 1, "same"))
        points.insert(
            StarRecoveryPoint(
                id = "owner:a:legacy", userId = "owner", accountId = "a",
                recoveryPointId = "legacy", reason = "pre_ocr_rebuild", createdAt = now,
                sourceGeneration = 0, state = states.findByUserIdAndAccountId("owner", "a")!!.snapshot(), loadouts = null,
            ),
        )
        val result = stateService.restore("owner", "a", "legacy", StarStateRestoreRequest(1, 1))
        assertEquals(2, result.state.generation)
        assertEquals(false, result.recoverySummary!!.historicalLoadoutAvailable)
        assertEquals("same", result.loadout.loadouts["operator.1"]?.get("main1"))
    }

    @Test fun `restore skips historical operator removed from Current without touching its ledger`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old"))))
        loadoutService.putCurrent("owner", "a", loadout(1, 1, "old"))
        val point = stateService.rebuild("owner", "a", rebuild(1, 1, "pre_ocr_rebuild", listOf(main("new")))).recoveryPoint!!
        every { operators.findByUserIdAndAccountIdOrderByUpdatedAtDesc("owner", "a") } returns emptyList()
        val restored = stateService.restore("owner", "a", point.recoveryPointId, StarStateRestoreRequest(2, 2))
        assertTrue(restored.loadout.loadouts.isEmpty())
        assertEquals(1, restored.recoverySummary!!.skippedOperators)
        assertEquals(1, restored.recoverySummary!!.skippedSlots)
        assertEquals(listOf("operator.1"), restored.recoverySummary!!.skippedOperatorIds)
    }

    @Test fun `same generation no-op PATCH clears historically stale references absent before this write`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("current"))))
        val revision = loadouts.findByUserIdAndAccountId("owner", "a")!!.revision
        loadouts.replaceForGeneration(
            "owner",
            "a",
            revision,
            1,
            listOf(StarOperatorLoadout("operator.1", StarLoadoutSlots(main1 = "from-older-ocr"))),
            now,
        )
        val result = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                1,
                listOf(main("current")),
                emptyMap(),
                StarWorkspaceExperienceRequest(),
                StarWorkspaceBagRequest(),
            ),
        )
        assertEquals(1, result.state.revision)
        assertEquals(null, result.loadout.loadouts["operator.1"]?.get("main1"))
    }

    @Test fun `deleting equipped inventory clears every dirty reference and preserves unrelated slots and plans`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("a"), main("b"), main("c"))))
        val withPlans = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                1,
                listOf(main("a"), main("b"), main("c")),
                mapOf("a" to 50, "b" to 45),
                StarWorkspaceExperienceRequest(),
                StarWorkspaceBagRequest(),
            ),
        )
        loadouts.replaceForGeneration(
            "owner",
            "a",
            1,
            1,
            listOf(
                StarOperatorLoadout("operator.1", StarLoadoutSlots(main1 = "a", main2 = "b", main3 = "a")),
                StarOperatorLoadout("operator.2", StarLoadoutSlots(main1 = "a", main2 = "c")),
            ),
            now,
        )
        val deleted = stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                1,
                withPlans.state.revision,
                listOf(main("b"), main("c")),
                mapOf("a" to 50, "b" to 45),
                StarWorkspaceExperienceRequest(),
                StarWorkspaceBagRequest(),
            ),
        )
        assertEquals(listOf("b", "c"), deleted.state.inventory.map { it.instanceId })
        assertEquals(mapOf("b" to 45), deleted.state.planTargets)
        assertEquals(null, deleted.loadout.loadouts["operator.1"]?.get("main1"))
        assertEquals(null, deleted.loadout.loadouts["operator.1"]?.get("main3"))
        assertEquals(null, deleted.loadout.loadouts["operator.2"]?.get("main1"))
        assertEquals("b", deleted.loadout.loadouts["operator.1"]?.get("main2"))
        assertEquals("c", deleted.loadout.loadouts["operator.2"]?.get("main2"))
    }

    @Test fun `concurrent Loadout PUT cannot reintroduce a deleted instance`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old"))))
        val (loadoutWrite, deletion) = raceLoadoutWriteAgainst { service ->
            service.patch(
                "owner",
                "a",
                StarStatePatchRequest(
                    1,
                    1,
                    emptyList(),
                    emptyMap(),
                    StarWorkspaceExperienceRequest(),
                    StarWorkspaceBagRequest(),
                ),
            )
        }
        assertTrue(loadoutWrite.isSuccess || deletion.isSuccess)
        if (deletion.isFailure) {
            stateService.patch(
                "owner",
                "a",
                StarStatePatchRequest(
                    1,
                    1,
                    emptyList(),
                    emptyMap(),
                    StarWorkspaceExperienceRequest(),
                    StarWorkspaceBagRequest(),
                ),
            )
        }
        assertTrue(states.findByUserIdAndAccountId("owner", "a")!!.inventory.isEmpty())
        assertLoadoutReferencesCurrentState()
    }

    @Test fun `concurrent stale generation Loadout PUT cannot survive rebuild`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("old"))))
        val (loadoutWrite, rebuildWrite) = raceLoadoutWriteAgainst { service ->
            service.rebuild("owner", "a", rebuild(1, 1, "pre_ocr_rebuild", listOf(main("new"))))
        }
        assertTrue(loadoutWrite.isSuccess || rebuildWrite.isSuccess)
        if (rebuildWrite.isFailure) {
            stateService.rebuild("owner", "a", rebuild(1, 1, "pre_ocr_rebuild", listOf(main("new"))))
        }
        val state = states.findByUserIdAndAccountId("owner", "a")!!
        assertEquals(2, state.generation)
        assertEquals(listOf("new"), state.inventory.map { it.instanceId })
        assertEquals(
            "star_generation_changed",
            assertThrows(InventoryApiException::class.java) {
                loadoutService.putCurrent("owner", "a", loadout(1, loadouts.findByUserIdAndAccountId("owner", "a")!!.revision, "old"))
            }.code,
        )
        assertLoadoutReferencesCurrentState()
    }

    private fun raceLoadoutWriteAgainst(mutateState: (StarStateService) -> Unit): Pair<Result<Unit>, Result<Unit>> {
        val fenced = CountDownLatch(1)
        val releaseLoadout = CountDownLatch(1)
        val stateWriteAttempted = CountDownLatch(1)
        val loadoutStates = mockk<StarStateCurrentRepository>()
        every { loadoutStates.findByUserIdAndAccountId("owner", "a") } answers { states.findByUserIdAndAccountId("owner", "a") }
        every { loadoutStates.fenceLoadoutWrite("owner", "a", any(), any()) } answers {
            states.fenceLoadoutWrite("owner", "a", args[2] as Long, args[3] as Long).also {
                fenced.countDown()
                check(releaseLoadout.await(10, TimeUnit.SECONDS))
            }
        }
        val mutationStates = mockk<StarStateCurrentRepository>()
        every { mutationStates.findByUserIdAndAccountId("owner", "a") } answers { states.findByUserIdAndAccountId("owner", "a") }
        every { mutationStates.replace(any(), any(), any(), any(), any(), any(), any()) } answers {
            stateWriteAttempted.countDown()
            states.replace(
                args[0] as String,
                args[1] as String,
                args[2] as Long,
                args[3] as Long,
                args[4] as Long,
                args[5] as StarStateSnapshot,
                args[6] as Instant,
            )
        }
        val racingLoadout = StarLoadoutService(loadouts, loadoutStates, accounts, stateService, tx)
        val racingState = StarStateService(mutationStates, points, loadouts, operators, accounts, tx)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val loadoutResult = executor.submit(
                Callable {
                    runCatching {
                        racingLoadout.putCurrent("owner", "a", loadout(1, 1, "old"))
                        Unit
                    }
                },
            )
            assertTrue(fenced.await(10, TimeUnit.SECONDS), "Loadout transaction did not acquire the StarState write fence")
            val stateResult = executor.submit(Callable { runCatching { mutateState(racingState) } })
            assertTrue(stateWriteAttempted.await(10, TimeUnit.SECONDS), "StarState mutation did not attempt the concurrent write")
            releaseLoadout.countDown()
            return loadoutResult.get(10, TimeUnit.SECONDS) to stateResult.get(10, TimeUnit.SECONDS)
        } finally {
            releaseLoadout.countDown()
            executor.shutdownNow()
        }
    }

    private fun assertLoadoutReferencesCurrentState() {
        val state = states.findByUserIdAndAccountId("owner", "a")!!
        val loadout = loadouts.findByUserIdAndAccountId("owner", "a")!!
        assertEquals(state.generation, loadout.generation)
        val inventoryIds = state.inventory.mapTo(HashSet()) { it.instanceId }
        assertTrue(loadout.loadouts.flatMap { it.slots.values().mapNotNull { (_, id) -> id } }.all { it in inventoryIds })
    }

    @Test fun `fourth checkpoint evicts oldest and restore safety obeys the same retention`() {
        stateService.rebuild("owner", "a", rebuild(0, 0, "pre_ocr_rebuild", listOf(main("v0"))))
        val first = stateService.rebuild("owner", "a", rebuild(1, 1, "pre_ocr_rebuild", listOf(main("v1")))).recoveryPoint!!.recoveryPointId
        val second = stateService.rebuild(
            "owner",
            "a",
            rebuild(2, 2, "pre_ocr_rebuild", listOf(main("v2"))),
        ).recoveryPoint!!.recoveryPointId
        val third = stateService.rebuild("owner", "a", rebuild(3, 3, "pre_ocr_rebuild", listOf(main("v3")))).recoveryPoint!!.recoveryPointId
        assertEquals(3, points.count())
        val fourth = stateService.rebuild(
            "owner",
            "a",
            rebuild(4, 4, "pre_ocr_rebuild", listOf(main("v4"))),
        ).recoveryPoint!!.recoveryPointId
        assertEquals(3, points.count())
        assertEquals(null, points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", first))
        assertNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", second))
        assertNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", third))
        assertNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", fourth))
        val restored = stateService.restore("owner", "a", fourth, StarStateRestoreRequest(5, 5))
        assertEquals(3, points.count())
        val safety = points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", restored.recoveryPoint!!.recoveryPointId)
        assertNotNull(safety)
        assertEquals("v4", safety!!.state.inventory.single().instanceId)
    }

    private fun main(id: String) = StarInventoryEntryRequest(id, "main", "天府", "orange", 20)
    private fun rebuild(gen: Long, rev: Long, reason: String, entries: List<StarInventoryEntryRequest>) =
        StarStateRebuildRequest(gen, rev, entries, emptyMap(), StarWorkspaceExperienceRequest(), StarWorkspaceBagRequest(), reason)
    private fun loadout(gen: Long, rev: Long, id: String) = StarLoadoutCurrentRequest(
        rev,
        mapOf(
            "operator.1" to mapOf(
                "main1" to id,
                "main2" to null,
                "main3" to null,
                "support1" to null,
                "support2" to null,
                "support3" to null,
            ),
        ),
        gen,
    )
}
