package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorV3ImportRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
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
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate

class OperatorV3AnnotationImportServiceTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val accounts = mockk<SubAccountRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val operators = mockk<OperatorService>()
    private val audits = mockk<OperatorV3ImportRecordRepository>()
    private val events = mockk<AccountEventService>()
    private val subjective = mockk<OperatorSubjectiveService>()
    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        },
    )
    private val service = OperatorV3ImportService(
        mapper,
        OperatorV3SchemaValidator(mapper),
        accounts,
        catalog,
        operators,
        audits,
        events,
        mockk<OperatorScanReviewRepository>(),
        subjective,
        transactionTemplate,
    )

    @BeforeEach
    fun setUp() {
        every { accounts.findByUserIdAndAccountId("u1", "a1") } returns
            SubAccount(userId = "u1", accountId = "a1", name = "账号", game = "如鸢")
        every { catalog.getOperator("op1") } returns OperatorCatalogEntity(
            operatorId = "op1",
            name = "密探",
            rarity = 5,
            prof = listOf("火"),
            subProf = listOf("pojun"),
            games = listOf("如鸢"),
            discs = emptyList(),
            starStones = emptyList(),
            catalogVersion = "1",
        )
        every { audits.findByUserIdAndAccountIdAndRecordId("u1", "a1", any()) } returns null
        every { audits.save(any()) } answers { firstArg<OperatorV3ImportRecord>() }
        every { subjective.subjectiveState("u1", "a1", "op1") } returns linkedMapOf(
            "growth_state" to "active",
            "favorite" to true,
            "note" to "旧备注",
            "targets" to mapOf("level" to 90),
        )
        every { subjective.subjectiveRevision("u1", "a1", "op1") } returns 2
        every { subjective.subjectiveOperatorIds("u1", "a1") } returns setOf("op1")
        every { subjective.applyAnnotationEntry("u1", "a1", any()) } returns 3
        every { subjective.resetFull("u1", "a1") } just runs
        every { events.publish(any(), any(), any(), any(), any()) } just runs
    }

    @Test
    fun `listed annotation preview shows only fields present in entry`() {
        val preview = service.previewBrowser("u1", wrapped(listedDocument()))

        assertEquals(1, preview.accepted)
        assertEquals(setOf("note", "targets"), preview.items.single().changes.keys)
        assertEquals("active", subjective.subjectiveState("u1", "a1", "op1")["growth_state"])
        verify(exactly = 0) { subjective.applyAnnotationEntry(any(), any(), any()) }
        verify(exactly = 0) { subjective.resetFull(any(), any()) }
    }

    @Test
    fun `full annotation commit resets defaults and restores complete entries in one record audit`() {
        val record = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
        every { subjective.applyAnnotationEntry("u1", "a1", capture(record)) } returns 3

        val result = service.commitBrowser("u1", wrapped(fullDocument()))

        assertEquals(1, result.accepted)
        verifyOrder {
            subjective.resetFull("u1", "a1")
            subjective.applyAnnotationEntry("u1", "a1", any())
            audits.save(match { it.recordId == "annotation:full" })
        }
        assertEquals("graduated", record.captured.path("growth_state").asText())
        assertEquals(true, record.captured.path("favorite").booleanValue())
        assertEquals(31, record.captured.path("targets").path("star_level").intValue())
        verify(exactly = 0) { operators.patchCurrent(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `full preview reports omitted operators returning to subjective defaults`() {
        every { subjective.subjectiveOperatorIds("u1", "a1") } returns setOf("op1", "op2")
        every { subjective.subjectiveState("u1", "a1", "op2") } returns linkedMapOf(
            "growth_state" to "graduated",
            "favorite" to true,
            "note" to null,
            "targets" to null,
        )

        val preview = service.previewBrowser("u1", wrapped(fullDocument()))
        val reset = preview.items.single { it.operatorId == "op2" }

        assertEquals("accepted", reset.status)
        assertEquals(setOf("growth_state", "favorite"), reset.changes.keys)
        assertEquals("active", reset.changes.getValue("growth_state").after)
        assertEquals(false, reset.changes.getValue("favorite").after)
    }

    @Test
    fun `OpenAPI scan rejects annotation records`() {
        val error = assertThrows(OperatorApiException::class.java) {
            service.previewScan("u1", "a1", listedDocument())
        }

        assertEquals("scan_scope_not_allowed", error.code)
        verify(exactly = 0) { subjective.applyAnnotationEntry(any(), any(), any()) }
    }

    @Test
    fun `listed and full discarded imports preview state changes and preserve the imported value`() {
        for (document in listOf(listedDocument(), fullDocument())) {
            val entry = document.path("records").first().path("entries").first() as com.fasterxml.jackson.databind.node.ObjectNode
            entry.put("growth_state", "discarded")
            val preview = service.previewBrowser("u1", wrapped(document))
            assertEquals("discarded", preview.items.single().changes.getValue("growth_state").after)
            val captured = slot<com.fasterxml.jackson.databind.node.ObjectNode>()
            every { subjective.applyAnnotationEntry("u1", "a1", capture(captured)) } returns 3
            assertEquals(1, service.commitBrowser("u1", wrapped(document)).accepted)
            assertEquals("discarded", captured.captured.path("growth_state").asText())
        }
    }

    @Test
    fun `objective snapshots and scans never write or reset a discarded annotation`() {
        every { subjective.subjectiveState("u1", "a1", "op1") } returns linkedMapOf(
            "growth_state" to "discarded",
            "favorite" to true,
            "note" to "保留备注",
            "targets" to null,
        )
        every { operators.current("u1", "a1", "如鸢") } returns emptyList()
        val after = com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto.of(
            com.lhs.share.hub.repository.entity.OperatorEntry(level = 90, elite = 15, starLevel = 1, revision = 1),
        )
        every { operators.previewCurrentPatch(any(), any(), any(), any(), any()) } returns
            OperatorCurrentPatchPreview(null, after, stale = false)
        every { operators.patchCurrent(any(), any(), any(), any(), any()) } returns after
        every { operators.completeFullImport(any(), any(), any(), any(), any()) } just runs
        val reviews = mockk<OperatorScanReviewRepository>()
        every { reviews.deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(any(), any(), any(), any()) } just runs
        val objectiveService = OperatorV3ImportService(
            mapper, OperatorV3SchemaValidator(mapper), accounts, catalog, operators, audits, events,
            reviews, subjective, transactionTemplate,
        )
        val doc = document(
            """
            {"account_id":"source","record_id":"objective:discarded","record_type":"operator_snapshot",
              "game":"如鸢","effective_at":"2026-08-23T12:00:00+08:00","snapshot_scope":"listed","source_kind":"scan",
              "coverage":{"complete":false,"record_count":1,"unmatched_count":0,"interrupted":false},
              "entries":[{"operator_id":"op1","level":90,"elite":15,"star_level":1}]}
            """.trimIndent(),
        )
        objectiveService.commitBrowser("u1", wrapped(doc))
        objectiveService.commitScan("u1", "a1", doc)
        verify(exactly = 0) { subjective.applyAnnotationEntry(any(), any(), any()) }
        verify(exactly = 0) { subjective.resetFull(any(), any()) }
        assertEquals("discarded", subjective.subjectiveState("u1", "a1", "op1")["growth_state"])
    }

    private fun wrapped(document: com.fasterxml.jackson.databind.node.ObjectNode) = mapper.createObjectNode().also { root ->
        root.set<com.fasterxml.jackson.databind.JsonNode>("document", document)
        root.set<com.fasterxml.jackson.databind.JsonNode>("account_mapping", mapper.createObjectNode().put("source", "a1"))
    }

    private fun listedDocument() = document(
        """
        {
          "account_id":"source","record_id":"annotation:listed","record_type":"operator_annotation_snapshot",
          "game":"如鸢","effective_at":"2026-08-23T12:00:00+08:00","snapshot_scope":"listed","source_kind":"backup",
          "entries":[{"operator_id":"op1","note":null,"targets":{"level":100}}]
        }
        """.trimIndent(),
    )

    private fun fullDocument() = document(
        """
        {
          "account_id":"source","record_id":"annotation:full","record_type":"operator_annotation_snapshot",
          "game":"如鸢","effective_at":"2026-08-23T12:00:00+08:00","snapshot_scope":"full","source_kind":"backup",
          "entries":[{"operator_id":"op1","growth_state":"graduated","favorite":true,"note":"继续收集心纸",
            "targets":{"level":100,"elite":17,"star_level":31,"heart_paper":180}}]
        }
        """.trimIndent(),
    )

    private fun document(record: String) = mapper.readTree(
        """
        {
          "format":"myshare-operator-exchange","version":3,"exported_at":"2026-08-23T12:00:00+08:00",
          "producer":{"platform":"yuanhub","version":"3"},
          "accounts":[{"id":"source","name":"来源","game_scope":"如鸢"}],
          "records":[$record]
        }
        """.trimIndent(),
    ) as com.fasterxml.jackson.databind.node.ObjectNode
}
