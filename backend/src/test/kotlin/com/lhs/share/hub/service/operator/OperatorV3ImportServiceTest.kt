package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorScanImportEvent
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorScanReview
import com.lhs.share.hub.repository.entity.OperatorV3ImportRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.openapi.OpenApiOperatorController
import com.lhs.share.openapi.OpenApiPermission
import com.lhs.share.openapi.OpenApiPrincipal
import com.lhs.share.openapi.OpenApiTokenService
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.slot
import io.mockk.verify
import io.mockk.verifyOrder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class OperatorV3ImportServiceTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val accountRepository = mockk<SubAccountRepository>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val operatorService = mockk<OperatorService>()
    private val importRecordRepository = mockk<OperatorV3ImportRecordRepository>()
    private val scanReviewRepository = mockk<OperatorScanReviewRepository>()
    private val accountEventService = mockk<AccountEventService>()
    private val service = OperatorV3ImportService(
        mapper,
        OperatorV3SchemaValidator(mapper),
        accountRepository,
        catalogService,
        operatorService,
        importRecordRepository,
        accountEventService,
        scanReviewRepository,
    )

    @BeforeEach
    fun setUp() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns
            SubAccount(userId = "u1", accountId = "acc1", name = "账号", game = "如鸢")
        every { catalogService.getOperator("op1") } returns catalog()
        every { operatorService.current("u1", "acc1", "如鸢") } returns emptyList()
        every { operatorService.completeFullImport(any(), any(), any(), any(), any()) } just runs
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "scan:1") } returns null
        every { importRecordRepository.save(any()) } answers { firstArg<OperatorV3ImportRecord>() }
        every { scanReviewRepository.findByUserIdAndAccountIdAndRecordIdAndOperatorId(any(), any(), any(), any()) } returns null
        every { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(any(), any(), any()) } returns emptyList()
        every { scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(any(), any(), any(), any()) } just runs
        every { scanReviewRepository.save(any()) } answers { firstArg() }
        every { scanReviewRepository.deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(any(), any(), any(), any()) } just runs
        every { accountEventService.publish(any(), any(), any(), any(), any()) } just runs
    }

    @Test
    fun `listed scan preview validates and never writes`() {
        val patch = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", capture(patch)) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)

        val result = service.previewBrowser("u1", wrappedDocument())

        assertEquals(1, result.accepted)
        assertEquals(1, result.items.single().targetRevision)
        assertEquals(90, patch.captured.path("level").intValue())
        assertEquals("scan", patch.captured.path("combat_stats").path("source").asText())
        verify(exactly = 0) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { importRecordRepository.save(any()) }
        verify(exactly = 0) { scanReviewRepository.save(any()) }
    }

    @ParameterizedTest
    @ValueSource(strings = ["ready", "partial"])
    fun `decimal oddities preview and commit preserve only reported keys`(status: String) {
        val request = oddityDocument(status, "0.50")
        val patch = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", capture(patch)) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)
        stubCommittedEntry()
        val preview = service.previewBrowser("u1", request)
        assertEquals(0, preview.rejected)
        val values = patch.captured.path("combat_stats").path("oddities")
        assertEquals(0.5, values.path("special").path("current").doubleValue())
        assertEquals(status == "ready", values.has("attack"))
        assertEquals(status == "ready", values.has("hp"))
        val commit = service.commitBrowser("u1", request)
        assertEquals(0, commit.rejected)
        verify {
            operatorService.patchCurrent(
                "u1",
                "acc1",
                "如鸢",
                "op1",
                match {
                    it.path("combat_stats").path("oddities").path("special").path("current").doubleValue() == 0.5
                },
            )
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0.55", "-0.5", "\"0.5\"", "null", "true"])
    fun `invalid decimal document uses combat field error and never writes`(value: String) {
        val error = assertThrows(OperatorApiException::class.java) { service.commitBrowser("u1", oddityDocument("partial", value)) }
        assertEquals("invalid_combat_stats", error.code)
        assertEquals("combat_stats.oddities.special.current", error.fieldPath)
        verify(exactly = 0) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { importRecordRepository.save(any()) }
    }

    @Test
    fun `attack hp decimals and ready missing keys are rejected`() {
        for (key in listOf("attack", "hp")) {
            val request = oddityDocument("ready", "0.5")
            val values = request.path("document").path("records").get(0).path("entries").get(0)
                .path("combat_stats").path("oddities") as com.fasterxml.jackson.databind.node.ObjectNode
            values.set<com.fasterxml.jackson.databind.JsonNode>(key, mapper.readTree("""{"current":0.5}"""))
            val error = assertThrows(OperatorApiException::class.java) { service.previewBrowser("u1", request) }
            assertEquals("combat_stats.oddities.$key.current", error.fieldPath)
        }
        val request = oddityDocument("partial", "0.5")
        val status = request.path("document").path("records").get(0).path("entries").get(0).path("section_status")
            as com.fasterxml.jackson.databind.node.ObjectNode
        status.put("oddities", "ready")
        assertEquals("invalid_oddities", service.previewBrowser("u1", request).items.single().blockingErrors.single().code)
    }

    private fun oddityDocument(status: String, value: String) = wrappedDocument().also { request ->
        val entry = request.path("document").path("records").get(0).path("entries").get(0) as com.fasterxml.jackson.databind.node.ObjectNode
        val combat = entry.path("combat_stats") as com.fasterxml.jackson.databind.node.ObjectNode
        val integers = if (status == "ready") "\"attack\":{\"current\":10},\"hp\":{\"current\":20}," else ""
        combat.set<com.fasterxml.jackson.databind.JsonNode>("oddities", mapper.readTree("{$integers\"special\":{\"current\":$value}}"))
        (entry.path("section_status") as com.fasterxml.jackson.databind.node.ObjectNode).put("oddities", status)
    }

    @Test
    fun `scan review is saved for its owner before notification and can be resumed`() {
        val request = document().also { root ->
            val entry = root.path("records").get(0).path("entries").get(0) as com.fasterxml.jackson.databind.node.ObjectNode
            (entry.path("section_status") as com.fasterxml.jackson.databind.node.ObjectNode)
                .put("basic", "review").put("combat_stats", "review")
        }
        val saved = slot<OperatorScanReview>()
        every { scanReviewRepository.save(capture(saved)) } answers { firstArg() }
        every { scanReviewRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "acc1") } answers { listOf(saved.captured) }

        val result = service.commitScan("u1", "acc1", request)
        val pending = service.listScanReviews("u1", "acc1").single()

        assertEquals(1, result.review)
        assertEquals("op1", pending.operatorId)
        assertEquals("scan:1", pending.recordId)
        assertEquals(1, pending.document.path("records").size())
        assertEquals("review", pending.document.path("records").get(0).path("entries").get(0).path("section_status").path("basic").asText())
        verify(exactly = 0) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
        verify(exactly = 1) { scanReviewRepository.save(any()) }
        verify(exactly = 1) { accountEventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `rejected scan entry remains available for correction`() {
        every { catalogService.getOperator("op1") } returns null
        val saved = slot<OperatorScanReview>()
        every { scanReviewRepository.save(capture(saved)) } answers { firstArg() }

        val result = service.commitScan("u1", "acc1", document())

        assertEquals(1, result.rejected)
        assertEquals("rejected", saved.captured.status)
        assertEquals("op1", saved.captured.operatorId)
        verify(exactly = 0) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `review stores source even when a reliable section was already written`() {
        val request = document().also { root ->
            val entry = root.path("records").get(0).path("entries").get(0)
            (entry.path("section_status") as com.fasterxml.jackson.databind.node.ObjectNode).put("combat_stats", "review")
        }
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)
        stubCommittedEntry()

        val result = service.commitScan("u1", "acc1", request)

        assertEquals(1, result.review)
        verify(exactly = 1) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
        verify(exactly = 1) { importRecordRepository.save(any()) }
        verify(exactly = 1) { scanReviewRepository.save(any()) }
    }

    @Test
    fun `scan review read and close reject a foreign account before repository access`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "other") } returns null

        assertThrows(OperatorApiException::class.java) { service.listScanReviews("u1", "other") }
        assertThrows(OperatorApiException::class.java) { service.closeScanReview("u1", "other", "scan:1", "op1") }

        verify(exactly = 0) { scanReviewRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(any(), any()) }
        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(any(), any(), any(), any()) }
        verify(exactly = 0) { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(any(), any(), any()) }
        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(any(), any(), any(), any()) }
    }

    @Test
    fun `historical backlog lists only the latest result per operator without writing`() {
        val newest = pendingReview("latest")
        val other = pendingReview("other", "op2")
        val backlog = (1..112).map { pendingReview("old:$it") }
        every { scanReviewRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "acc1") } returns
            listOf(newest, other) + backlog

        val result = service.listScanReviews("u1", "acc1")

        assertEquals(listOf("latest", "other"), result.map { it.recordId })
        assertEquals(listOf("op1", "op2"), result.map { it.operatorId })
        verify(exactly = 0) { scanReviewRepository.save(any()) }
        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(any(), any(), any(), any()) }
    }

    @Test
    fun `new pending scan saves before pruning the previous records and publishing`() {
        every { catalogService.getOperator("op1") } returns null
        val oldRecords = listOf("old:1", "old:2")
        every { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("u1", "acc1", "op1") } returns
            oldRecords.map { pendingReview(it) }

        assertEquals(1, service.commitScan("u1", "acc1", document()).rejected)

        verifyOrder {
            scanReviewRepository.save(match { it.recordId == "scan:1" && it.accountId == "acc1" && it.operatorId == "op1" })
            scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn("u1", "acc1", "op1", oldRecords)
            accountEventService.publish("u1", "acc1", any(), any(), any())
        }
    }

    @Test
    fun `completing one review clears its entire older backlog but preserves a newer scan`() {
        val backlog = (1..112).map { pendingReview("old:$it") }
        every { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("u1", "acc1", "op1") } returns
            listOf(pendingReview("newer"), pendingReview("selected")) + backlog

        service.closeScanReview("u1", "acc1", "selected", "op1")

        verify(exactly = 1) {
            scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(
                "u1",
                "acc1",
                "op1",
                listOf("selected") + backlog.map { it.recordId },
            )
        }
    }

    @Test
    fun `closing an already replaced review leaves its replacement intact`() {
        every { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc("u1", "acc1", "op1") } returns
            listOf(pendingReview("newer"))

        service.closeScanReview("u1", "acc1", "gone", "op1")

        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(any(), any(), any(), any()) }
    }

    @Test
    fun `audited scan retry never recreates or removes pending reviews`() {
        val request = document()
        val record = request.path("records").get(0)
        (record.path("entries").get(0).path("section_status") as com.fasterxml.jackson.databind.node.ObjectNode)
            .put("basic", "review").put("combat_stats", "review")
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "scan:1") } returns
            OperatorV3ImportRecord(
                userId = "u1", accountId = "acc1", sourceAccountId = "local", recordId = "scan:1",
                game = "如鸢", sourceKind = "scan", snapshotScope = "listed",
                payload = mapper.writeValueAsString(record), revisions = emptyMap(), statuses = mapOf("op1" to "review"),
            )

        service.commitScan("u1", "acc1", request)

        verify(exactly = 0) { scanReviewRepository.save(any()) }
        verify(exactly = 0) { scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(any(), any(), any()) }
        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(any(), any(), any(), any()) }
        verify(exactly = 0) { scanReviewRepository.deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(any(), any(), any(), any()) }
    }

    private fun pendingReview(recordId: String, operatorId: String = "op1") = OperatorScanReview(
        userId = "u1",
        accountId = "acc1",
        recordId = recordId,
        operatorId = operatorId,
        status = "review",
        document = mapper.writeValueAsString(document()),
        warnings = emptyList(),
        blockingErrors = emptyList(),
    )

    @Test
    fun `commit creates revision one and writes an idempotency audit`() {
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)
        stubCommittedEntry()
        val result = service.commitBrowser("u1", wrappedDocument())

        assertEquals(1, result.accepted)
        assertEquals(1, result.items.single().revision)
        verify(exactly = 1) { operatorService.patchCurrent("u1", "acc1", "如鸢", "op1", any()) }
        verify(exactly = 1) {
            importRecordRepository.save(match { it.recordId == "scan:1" && it.revisions == mapOf("op1" to 1L) })
        }
        verify(exactly = 0) { accountEventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `OpenAPI commit publishes one account scoped event after each entry`() {
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)
        stubCommittedEntry()

        service.commitScan("u1", "acc1", document())

        verify(exactly = 1) {
            accountEventService.publish(
                "u1",
                "acc1",
                OperatorV3ImportService.SCAN_EVENT_NAME,
                any(),
                match<OperatorScanImportEvent> {
                    it.operatorId == "op1" && it.status == "accepted" && it.revision == 1L
                },
            )
        }
    }

    @Test
    fun `OpenAPI scan endpoints keep a signatureless observation valid through current GET`() {
        val currentRepository = mockk<OperatorCurrentRepository>()
        val recordRepository = mockk<OperatorRecordRepository>()
        val catalogRepository = mockk<OperatorCatalogRepository>()
        val correctionRepository = mockk<OperatorCorrectionRecordRepository>()
        var current = OperatorCurrent(
            id = "current-1",
            userId = "u1",
            accountId = "acc1",
            game = "如鸢",
            entries = mapOf(
                "op1" to OperatorEntry(
                    elite = 1,
                    starLevel = 1,
                    level = 10,
                    combatStats = OperatorCombatStats(
                        observedAttack = 900,
                        observedHp = 5000,
                        source = "scan",
                        observedStatus = "valid",
                        combatInputSignature = "old-signature",
                    ),
                    revision = 7,
                ),
            ),
        )
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "如鸢") } answers { current }
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "universal") } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "*") } returns null
        every { currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "acc1") } answers { listOf(current) }
        every { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) } answers {
            current = current.copy(entries = current.entries + arg<Map<String, OperatorEntry>>(5), updatedAt = arg(6))
            current
        }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { current = it } }
        every { correctionRepository.save(any()) } answers { firstArg<OperatorCorrectionRecord>() }
        every { catalogService.spFormsOf(any()) } returns emptyList()
        val transactionTemplate = TransactionTemplate(
            object : PlatformTransactionManager {
                override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
                override fun commit(status: TransactionStatus) = Unit
                override fun rollback(status: TransactionStatus) = Unit
            },
        )
        val realOperatorService = OperatorService(
            accountRepository,
            currentRepository,
            recordRepository,
            catalogRepository,
            catalogService,
            transactionTemplate,
            correctionRepository,
            mockk<com.lhs.share.hub.service.star.StarStateService>(relaxed = true),
        )
        val realImportService = OperatorV3ImportService(
            mapper,
            OperatorV3SchemaValidator(mapper),
            accountRepository,
            catalogService,
            realOperatorService,
            importRecordRepository,
            accountEventService,
            scanReviewRepository,
        )
        val tokenService = mockk<OpenApiTokenService>()
        every { tokenService.validateAuthorization("Bearer scan", OpenApiPermission.OPERATOR_SCAN_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { tokenService.validateAuthorization("Bearer read", OpenApiPermission.OPERATOR_READ) } returns
            OpenApiPrincipal("u1", "acc1")
        val controller = OpenApiOperatorController(
            tokenService,
            realOperatorService,
            mockk<SubAccountService>(),
            realImportService,
        )
        val event = slot<OperatorScanImportEvent>()
        every {
            accountEventService.publish(
                "u1",
                "acc1",
                OperatorV3ImportService.SCAN_EVENT_NAME,
                any(),
                capture(event),
            )
        } just runs
        val request = document().also { root ->
            val entry = root.path("records").get(0).path("entries").get(0) as com.fasterxml.jackson.databind.node.ObjectNode
            entry.put("level", 93).put("elite", 14).put("star_level", 3)
            entry.set<com.fasterxml.jackson.databind.JsonNode>(
                "equipped_star_stones",
                mapper.readTree("""[{"type":"main1","name":"攻击力","level":60}]"""),
            )
            entry.set<com.fasterxml.jackson.databind.JsonNode>(
                "combat_stats",
                mapper.readTree(
                    """
                    {
                      "observed_attack":4001,
                      "observed_hp":20245,
                      "source":"scan",
                      "observed_status":"valid",
                      "oddities":{
                        "attack":{"current":0},
                        "hp":{"current":0},
                        "special":{"current":0.5}
                      }
                    }
                    """.trimIndent(),
                ),
            )
            entry.set<com.fasterxml.jackson.databind.JsonNode>(
                "section_status",
                mapper.readTree(
                    """{"basic":"ready","huaji":"ready","equipment":"ready","combat_stats":"ready","oddities":"ready"}""",
                ),
            )
        }

        val preview = checkNotNull(controller.previewScanImport("Bearer scan", request).data)
        val committed = checkNotNull(controller.commitScanImport("Bearer scan", request).data)
        val saved = checkNotNull(controller.current("Bearer read", "如鸢").data).single().entries.getValue("op1")

        assertEquals(false, preview.items.single().stale)
        assertEquals("valid", preview.items.single().observedStatus)
        assertEquals("valid", committed.items.single().observedStatus)
        assertEquals(false, event.captured.stale)
        assertEquals("valid", event.captured.observedStatus)
        assertEquals("valid", saved.combatStats?.observedStatus)
        assertEquals(93, saved.combatStats?.observedInputs?.level)
        assertEquals(true, saved.combatStats?.combatInputSignature?.startsWith("sha256:"))
        assertEquals(4001, saved.combatStats?.manualAttack)
        assertEquals(20245, saved.combatStats?.manualHp)
        assertEquals("manual", saved.combatStats?.displayMode?.attack)
        assertEquals("manual", saved.combatStats?.displayMode?.hp)
        assertEquals(0.5, saved.combatStats?.oddities?.get("special")?.current)

        val annotations = mockk<com.lhs.share.hub.repository.OperatorAnnotationRepository>()
        val targets = mockk<com.lhs.share.hub.repository.OperatorGrowthTargetRepository>()
        val favorites = mockk<com.lhs.share.hub.repository.InventoryAgentFavoriteRepository>()
        every { annotations.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("u1", "acc1") } returns emptyList()
        every { targets.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("u1", "acc1") } returns emptyList()
        every { favorites.findAllByUserIdAndAccountIdOrderByAgentIdAsc("u1", "acc1") } returns emptyList()
        every { catalogService.currentCatalogVersion() } returns "v1"
        val exporter =
            OperatorV3ExportService(mapper, accountRepository, currentRepository, annotations, targets, favorites, catalogService)
        val exported = exporter.export("u1", "acc1", null)
        // Exercise the objective exchange path; annotations have their own independent suite.
        (exported.path("records") as com.fasterxml.jackson.databind.node.ArrayNode).remove(1)
        OperatorV3SchemaValidator(mapper).validate(exported)
        val exportedValues = exported.path("records").get(0).path("entries").get(0).path("combat_stats").path("oddities")
        assertEquals(0.5, exportedValues.path("special").path("current").doubleValue())
        assertEquals(true, exportedValues.path("attack").path("current").isIntegralNumber)
        assertEquals(true, exportedValues.path("hp").path("current").isIntegralNumber)
        current = current.copy(
            entries = mapOf(
                "op1" to current.entries.getValue("op1").copy(
                    combatStats = current.entries.getValue("op1").combatStats!!.copy(
                        oddities = mapOf("special" to com.lhs.share.hub.repository.entity.OperatorOddityValue(0.0)),
                    ),
                ),
            ),
        )
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", any()) } returns null
        assertEquals(0, realImportService.previewBrowser("u1", exported).rejected)
        assertEquals(0, realImportService.commitBrowser("u1", exported).rejected)
        assertEquals(0.5, current.entries.getValue("op1").combatStats?.oddities?.get("special")?.current)

        val partial = oddityDocument("partial", "0.6")
        (partial.path("document").path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("record_id", "scan:2")
        val oldRevision = current.entries.getValue("op1").revision
        val staleScan = realImportService.commitBrowser("u1", partial)
        assertEquals(1, staleScan.review)
        assertEquals(oldRevision, current.entries.getValue("op1").revision)
        assertEquals(0.5, current.entries.getValue("op1").combatStats?.oddities?.get("special")?.current)
        val freshRecord = partial.path("document").path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode
        freshRecord.put("record_id", "scan:3").put("effective_at", Instant.now().plusSeconds(1).toString())
        assertEquals(0, realImportService.commitBrowser("u1", partial).rejected)
        val merged = current.entries.getValue("op1").combatStats!!.oddities
        assertEquals(0.6, merged.getValue("special").current)
        assertEquals(0.0, merged.getValue("attack").current)
        assertEquals(0.0, merged.getValue("hp").current)
    }

    @Test
    fun `OpenAPI rejects source kind and scope outside listed scan`() {
        val invalid = document().also { root ->
            (root.path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode)
                .put("source_kind", "backup")
                .put("snapshot_scope", "full")
        }

        val error = assertThrows(OperatorApiException::class.java) {
            service.previewScan("u1", "acc1", invalid)
        }

        assertEquals("scan_scope_not_allowed", error.code)
        verify(exactly = 0) { operatorService.previewCurrentPatch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `same record is unchanged and changed record idempotency conflicts`() {
        val rawRecord = document().path("records").get(0)
        val audit = OperatorV3ImportRecord(
            userId = "u1",
            accountId = "acc1",
            sourceAccountId = "local",
            recordId = "scan:1",
            game = "如鸢",
            sourceKind = "scan",
            snapshotScope = "listed",
            payload = mapper.writeValueAsString(rawRecord),
            revisions = mapOf("op1" to 4L),
        )
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "scan:1") } returns audit

        val duplicate = service.previewBrowser("u1", wrappedDocument())
        assertEquals(1, duplicate.unchanged)
        assertEquals(4, duplicate.items.single().revision)

        val changed = wrappedDocument().also {
            (it.path("document").path("records").get(0).path("entries").get(0) as com.fasterxml.jackson.databind.node.ObjectNode)
                .put("level", 91)
        }
        val conflict = service.previewBrowser("u1", changed)
        assertEquals(1, conflict.rejected)
        assertEquals("idempotency_conflict", conflict.items.single().blockingErrors.single().code)
    }

    @Test
    fun `decimal records retain existing idempotency semantics`() {
        val request = oddityDocument("partial", "0.5")
        val record = request.path("document").path("records").get(0)
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "scan:1") } returns
            OperatorV3ImportRecord(
                userId = "u1", accountId = "acc1", sourceAccountId = "local", recordId = "scan:1",
                game = "如鸢", sourceKind = "scan", snapshotScope = "listed",
                payload = mapper.writeValueAsString(record), revisions = mapOf("op1" to 4L),
            )
        assertEquals(1, service.previewBrowser("u1", request).unchanged)
        val value = record.path("entries").get(0).path("combat_stats").path("oddities").path("special")
            as com.fasterxml.jackson.databind.node.ObjectNode
        value.put("current", 0.6)
        val conflict = service.commitBrowser("u1", request)
        assertEquals(1, conflict.rejected)
        assertEquals("idempotency_conflict", conflict.items.single().blockingErrors.single().code)
        verify(exactly = 0) { operatorService.patchCurrent(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { importRecordRepository.save(any()) }
    }

    @Test
    fun `browser mapping cannot target an account outside the current user`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc2") } returns null
        val request = wrappedDocument().also {
            (it.path("account_mapping") as com.fasterxml.jackson.databind.node.ObjectNode).put("local", "acc2")
        }

        val error = assertThrows(OperatorApiException::class.java) {
            service.previewBrowser("u1", request)
        }

        assertEquals("account_scope_mismatch", error.code)
        verify(exactly = 0) { operatorService.previewCurrentPatch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `OpenAPI maps arbitrary source account to the token bound account and rejects preferences`() {
        val valid = document().also {
            (it.path("accounts").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("id", "acc_other")
            (it.path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("account_id", "acc_other")
        }
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)

        assertEquals(1, service.previewScan("u1", "acc1", valid).accepted)
        verify { accountRepository.findByUserIdAndAccountId("u1", "acc1") }

        val preference = valid.also {
            (it.path("records").get(0).path("entries").get(0).path("combat_stats") as com.fasterxml.jackson.databind.node.ObjectNode)
                .set<com.fasterxml.jackson.databind.JsonNode>("display_mode", mapper.createObjectNode().put("attack", "auto"))
        }
        val rejected = service.previewScan("u1", "acc1", preference)
        assertEquals(1, rejected.rejected)
        assertEquals("scan_field_not_allowed", rejected.items.single().blockingErrors.single().code)
    }

    @Test
    fun `full commit completes baseline while listed commit never removes outside entries`() {
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)
        stubCommittedEntry()

        service.commitBrowser("u1", wrappedDocument())
        verify(exactly = 0) { operatorService.completeFullImport(any(), any(), any(), any(), any()) }

        val full = wrappedDocument().also {
            (it.path("document").path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode)
                .put("record_id", "full:1")
                .put("source_kind", "backup")
                .put("snapshot_scope", "full")
        }
        every { importRecordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "full:1") } returns null
        service.commitBrowser("u1", full)

        verify(exactly = 1) {
            operatorService.completeFullImport("u1", "acc1", "如鸢", setOf("op1"), any())
        }
    }

    @Test
    fun `catalog invalid oddity is rejected even when section awaits review`() {
        val request = wrappedDocument().also {
            val entry = it.path("document").path("records").get(0).path("entries").get(0)
            (entry.path("section_status") as com.fasterxml.jackson.databind.node.ObjectNode).put("oddities", "review")
            (entry.path("combat_stats") as com.fasterxml.jackson.databind.node.ObjectNode).set<com.fasterxml.jackson.databind.JsonNode>(
                "oddities",
                mapper.readTree("""{"attack":{"current":501}}"""),
            )
        }

        val result = service.previewBrowser("u1", request)

        assertEquals(1, result.rejected)
        assertEquals("invalid_combat_stats", result.items.single().blockingErrors.single().code)
        verify(exactly = 0) { operatorService.previewCurrentPatch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `four star catalog accepts attack oddity 350 and flags any other reported max`() {
        every { catalogService.getOperator("op1") } returns catalog().copy(rarity = 4)
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)

        fun preview(oddities: String) = service.previewBrowser(
            "u1",
            wrappedDocument().also { request ->
                val entry = request.path("document").path("records").get(0).path("entries").get(0)
                (entry.path("combat_stats") as com.fasterxml.jackson.databind.node.ObjectNode).set<com.fasterxml.jackson.databind.JsonNode>(
                    "oddities",
                    mapper.readTree(oddities),
                )
            },
        )

        val boundary = preview(
            """{"attack":{"current":350,"max":350},"hp":{"current":1820,"max":1820},"special":{"current":11,"max":11}}""",
        )
        assertEquals(1, boundary.accepted)
        assertEquals(emptyList<String>(), boundary.items.single().warnings.map { it.code })

        val overflow = preview(
            """{"attack":{"current":351},"hp":{"current":1820},"special":{"current":11}}""",
        )
        assertEquals(1, overflow.rejected)
        assertEquals("invalid_combat_stats", overflow.items.single().blockingErrors.single().code)

        val staleMax = preview(
            """{"attack":{"current":0,"max":305},"hp":{"current":1820,"max":1820},"special":{"current":11,"max":11}}""",
        )
        assertEquals(1, staleMax.accepted)
        assertEquals(listOf("oddity_max_mismatch"), staleMax.items.single().warnings.map { it.code })
    }

    @Test
    fun `universal record materializes through the account game`() {
        val request = wrappedDocument().also {
            (it.path("document").path("records").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("game", "universal")
        }
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), stale = false)

        assertEquals(1, service.previewBrowser("u1", request).accepted)
        verify { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", any()) }
    }

    @Test
    fun `v5 unsigned scan snapshots only its own breakthrough and old versions cannot add the field`() {
        val wrapper = wrappedDocument()
        val doc = wrapper.path("document") as com.fasterxml.jackson.databind.node.ObjectNode
        doc.put("version", 5)
        val source = doc.path("records").get(0).path("entries").get(0) as com.fasterxml.jackson.databind.node.ObjectNode
        source.put("level_breakthrough_stage", 9)
        val captured = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", capture(captured)) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), false)
        assertEquals(1, service.previewBrowser("u1", wrapper).accepted)
        assertEquals(9, captured.captured.path("level_breakthrough_stage").asInt())
        assertEquals(false, captured.captured.path("combat_stats").has("observed_inputs"))
        source.putNull("level_breakthrough_stage")
        service.previewBrowser("u1", wrapper)
        assertEquals(false, captured.captured.has("level_breakthrough_stage"))
        assertEquals(false, captured.captured.path("combat_stats").has("observed_inputs"))
        doc.put("version", 4)
        assertThrows(OperatorApiException::class.java) { OperatorV3SchemaValidator(mapper).validate(doc) }
    }

    @ParameterizedTest
    @ValueSource(ints = [3, 4, 5])
    fun `backup import forwards independent targets into the mapped account patch`(version: Int) {
        val wrapper = wrappedDocument()
        val document = wrapper.path("document") as com.fasterxml.jackson.databind.node.ObjectNode
        document.put("version", version)
        val source = document.path("records")[0].path("entries")[0] as com.fasterxml.jackson.databind.node.ObjectNode
        val loadouts = mapper.readTree(
            """[
              {"id":"one","name":"命盘一","discs":[],"status":"reroll","target_discs":[]},
              {"id":"two","name":"命盘二","discs":[],"status":"perfect","target_discs":[]}
            ]""",
        )
        source.set<com.fasterxml.jackson.databind.JsonNode>("disc_loadouts", loadouts)
        val captured = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
        every { operatorService.previewCurrentPatch("u1", "acc1", "如鸢", "op1", capture(captured)) } returns
            OperatorCurrentPatchPreview(null, entry(level = 90, revision = 1), false)
        assertEquals(1, service.previewBrowser("u1", wrapper).accepted)
        assertEquals(loadouts, captured.captured.path("disc_loadouts"))
        stubCommittedEntry()
        assertEquals(1, service.commitBrowser("u1", wrapper).accepted)
        verify { operatorService.patchCurrent("u1", "acc1", "如鸢", "op1", match { it.path("disc_loadouts") == loadouts }) }
    }

    private fun wrappedDocument() = mapper.createObjectNode().apply {
        set<com.fasterxml.jackson.databind.JsonNode>("document", document())
        set<com.fasterxml.jackson.databind.JsonNode>(
            "account_mapping",
            mapper.createObjectNode().put("local", "acc1"),
        )
    }

    private fun document() = mapper.readTree(
        """
        {
          "format":"myshare-operator-exchange",
          "version":3,
          "exported_at":"2026-08-21T10:30:00+08:00",
          "producer":{"platform":"collector","version":"1"},
          "accounts":[{"id":"local","name":"本地账号","game_scope":"如鸢"}],
          "records":[{
            "account_id":"local",
            "record_id":"scan:1",
            "record_type":"operator_snapshot",
            "game":"如鸢",
            "effective_at":"2026-08-21T10:30:00+08:00",
            "snapshot_scope":"listed",
            "source_kind":"scan",
            "entries":[{
              "operator_id":"op1",
              "name":"密探",
              "level":90,
              "combat_stats":{"observed_attack":1000,"source":"scan","observed_status":"valid"},
              "section_status":{"basic":"ready","combat_stats":"ready"}
            }]
          }]
        }
        """.trimIndent(),
    ) as com.fasterxml.jackson.databind.node.ObjectNode

    private fun catalog() = OperatorCatalogEntity(
        operatorId = "op1",
        name = "密探",
        rarity = 5,
        specialOddityName = "增伤值",
        prof = emptyList(),
        subProf = emptyList(),
        games = listOf("如鸢"),
        discs = emptyList(),
        starStones = emptyList(),
        catalogVersion = "v1",
    )

    private fun stubCommittedEntry() {
        every { operatorService.patchCurrent("u1", "acc1", "如鸢", "op1", any()) } answers {
            val state = OperatorCurrent(
                "state",
                "u1",
                "acc1",
                "如鸢",
                entries = mapOf(
                    "op1" to OperatorEntry(elite = 0, starLevel = 0, level = 90, revision = 1),
                ),
            )
            every { operatorService.current("u1", "acc1", "如鸢") } returns listOf(OperatorCurrentResponse.of(state))
            entry(level = 90, revision = 1)
        }
    }

    private fun entry(level: Int, revision: Long): OperatorCurrentEntryDto = OperatorCurrentEntryDto.of(
        OperatorEntry(elite = 0, starLevel = 0, level = level, revision = revision),
    )
}
