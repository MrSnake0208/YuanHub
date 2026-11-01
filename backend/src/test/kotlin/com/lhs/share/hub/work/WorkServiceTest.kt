package com.lhs.share.hub.work

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.WorkRecordRepository
import com.lhs.share.hub.repository.entity.WorkRecord
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.work.adapter.MaaYuanWorkAdapter
import com.lhs.share.hub.work.adapter.YuanAssistWorkAdapter
import com.lhs.share.hub.work.model.PauseAction
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkRound
import com.lhs.share.hub.work.model.WorkStatus
import com.lhs.share.hub.work.parser.MaaYuanLegacyParser
import com.lhs.share.hub.work.repository.MaaCopilotPage
import com.lhs.share.hub.work.repository.MaaCopilotWorkSource
import com.lhs.share.hub.work.repository.MaaCopilotWorkSourceRepository
import com.lhs.share.hub.work.service.WorkDocumentValidator
import com.lhs.share.hub.work.service.WorkIdResolver
import com.lhs.share.hub.work.service.WorkRevisionConflictException
import com.lhs.share.hub.work.service.WorkService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.bson.types.ObjectId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

class WorkServiceTest {
    private val sourceRepository = mockk<MaaCopilotWorkSourceRepository>()
    private val levelRepository = mockk<LevelCatalogRepository>()
    private val recordRepository = mockk<WorkRecordRepository>()
    private val service = WorkService(
        sourceRepository,
        levelRepository,
        MaaYuanLegacyParser(jacksonObjectMapper()),
        MaaYuanWorkAdapter(),
        YuanAssistWorkAdapter(),
        recordRepository,
        WorkDocumentValidator(levelRepository),
        WorkIdResolver(),
    )

    @Test
    fun `detail uses raw content and links only one exact catalog match`() {
        every { sourceRepository.findPublicById(7) } returns source(tags = listOf("如鸢"))
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns listOf(level("lvl_1", "如鸢"))

        val detail = service.get(7)

        assertEquals("lvl_1", detail.work!!.levelId)
        assertEquals("如鸢", detail.work!!.game)
        assertEquals("attack", (detail.work!!.rounds.single().actions.single() as com.lhs.share.hub.work.model.SlotAction).type)
        assertEquals(RAW_CONTENT, detail.source.rawContent)
    }

    @Test
    fun `ambiguous game tags do not guess a protocol game`() {
        every { sourceRepository.findPublicById(7) } returns source(tags = listOf("代号鸢", "如鸢"))
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()

        val detail = service.get(7)

        assertNull(detail.work)
        assertTrue(detail.conversion.issues.any { it.code == "ambiguous_game" })
    }

    @Test
    fun `native draft is owner only and compare and set preserves revision`() {
        val id = ObjectId("66ed00000000000000000001")
        val current = WorkRecord(id = id, ownerId = "owner", revision = 1, document = nativeDocument())
        every { recordRepository.findByIdAndDeletedAtIsNull(id) } returns current
        every { recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(id, "owner") } returns current
        every { recordRepository.replaceIfRevision(any(), 1) } answers { firstArg() }

        assertThrows(com.lhs.share.hub.work.service.WorkApiException::class.java) {
            service.get("w_${id.toHexString()}")
        }
        assertEquals(WorkStatus.DRAFT, service.get("w_${id.toHexString()}", "owner").metadata.status)

        val updated = service.update("owner", "w_${id.toHexString()}", 1, nativeDocument().copy(doc = WorkDoc("新标题", "")))
        assertEquals(2, updated.metadata.revision)
        assertEquals("新标题", updated.work!!.doc.title)

        val stale = current.copy(revision = 3)
        every { recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(id, "owner") } returns stale
        val conflict = assertThrows(WorkRevisionConflictException::class.java) {
            service.update("owner", "w_${id.toHexString()}", 1, nativeDocument())
        }
        assertEquals(3, conflict.currentRevision)
    }

    @Test
    fun `soft delete uses owner scoped revision update`() {
        val id = ObjectId("66ed00000000000000000002")
        val current = WorkRecord(id = id, ownerId = "owner", revision = 4, document = nativeDocument())
        every { recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(id, "owner") } returns current
        every { recordRepository.replaceIfRevision(any(), 4) } answers { firstArg() }

        service.delete("owner", "w_${id.toHexString()}", 4)

        verify {
            recordRepository.replaceIfRevision(
                match { it.deletedAt != null && it.revision == 5L && it.ownerId == "owner" },
                4,
            )
        }
    }

    @Test
    fun `public list merges native and legacy by time with combined total`() {
        val id = ObjectId("66ed00000000000000000003")
        val native = WorkRecord(
            id = id,
            ownerId = "owner",
            status = WorkStatus.PUBLIC,
            document = nativeDocument(),
            publishedAt = Instant.parse("2026-09-18T10:00:00Z"),
        )
        every { sourceRepository.findPublic(1, 1) } returns MaaCopilotPage(
            listOf(source(tags = listOf("如鸢")).copy(uploadTime = LocalDateTime.of(2026, 9, 18, 9, 0))),
            1,
        )
        every {
            recordRepository.findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(
                WorkStatus.PUBLIC,
                any(),
            )
        } returns listOf(native)
        every { recordRepository.countByStatusAndDeletedAtIsNull(WorkStatus.PUBLIC) } returns 1
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()

        val result = service.list(1, 1)

        assertEquals(2, result.total)
        assertTrue(result.hasNext)
        assertEquals("w_${id.toHexString()}", result.items.single().id)
        assertNotNull(result.items.single().uploadTime)
    }

    @Test
    fun `public merge slices only after interleaving both bounded sources`() {
        val firstNativeId = ObjectId("66ed00000000000000000006")
        val secondNativeId = ObjectId("66ed00000000000000000007")
        every { sourceRepository.findPublic(1, 4) } returns MaaCopilotPage(
            listOf(
                source(tags = listOf("如鸢")).copy(copilotId = 9, uploadTime = localTime(10)),
                source(tags = listOf("如鸢")).copy(copilotId = 8, uploadTime = localTime(8)),
            ),
            2,
        )
        every {
            recordRepository.findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(
                WorkStatus.PUBLIC,
                any(),
            )
        } returns listOf(
            WorkRecord(
                id = firstNativeId,
                ownerId = "owner",
                status = WorkStatus.PUBLIC,
                document = nativeDocument(),
                publishedAt = localTime(9).atZone(ZoneId.systemDefault()).toInstant(),
            ),
            WorkRecord(
                id = secondNativeId,
                ownerId = "owner",
                status = WorkStatus.PUBLIC,
                document = nativeDocument(),
                publishedAt = localTime(7).atZone(ZoneId.systemDefault()).toInstant(),
            ),
        )
        every { recordRepository.countByStatusAndDeletedAtIsNull(WorkStatus.PUBLIC) } returns 2
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()

        val result = service.list(2, 2)

        assertEquals(listOf("8", "w_${secondNativeId.toHexString()}"), result.items.map { it.id })
        assertEquals(4, result.total)
        assertTrue(!result.hasNext)
    }

    @Test
    fun `public merge keeps numeric legacy tie order stable across pages`() {
        every { sourceRepository.findPublic(1, any()) } answers {
            MaaCopilotPage(
                listOf(
                    source(tags = listOf("如鸢")).copy(copilotId = 10, uploadTime = localTime(10)),
                    source(tags = listOf("如鸢")).copy(copilotId = 9, uploadTime = localTime(10)),
                ).take(secondArg<Int>()),
                2,
            )
        }
        every {
            recordRepository.findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(WorkStatus.PUBLIC, any())
        } returns emptyList()
        every { recordRepository.countByStatusAndDeletedAtIsNull(WorkStatus.PUBLIC) } returns 0
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()

        assertEquals(listOf("10"), service.list(1, 1).items.map { it.id })
        assertEquals(listOf("9"), service.list(2, 1).items.map { it.id })
    }

    @Test
    fun `public merge ranks missing upload time like the legacy source query`() {
        every { sourceRepository.findPublic(1, any()) } answers {
            MaaCopilotPage(
                listOf(
                    source(tags = listOf("如鸢")).copy(copilotId = 9, uploadTime = localTime(10)),
                    source(tags = listOf("如鸢")).copy(
                        copilotId = 10,
                        uploadTime = null,
                        firstUploadTime = localTime(12),
                    ),
                ).take(secondArg<Int>()),
                2,
            )
        }
        every {
            recordRepository.findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(WorkStatus.PUBLIC, any())
        } returns emptyList()
        every { recordRepository.countByStatusAndDeletedAtIsNull(WorkStatus.PUBLIC) } returns 0
        every { levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()

        assertEquals(listOf("9"), service.list(1, 1).items.map { it.id })
        assertEquals(listOf("10"), service.list(2, 1).items.map { it.id })
    }

    @Test
    fun `unsaved and saved compatibility use the same adapter`() {
        val id = ObjectId("66ed00000000000000000004")
        val record = WorkRecord(
            id = id,
            ownerId = "owner",
            status = WorkStatus.PUBLIC,
            document = nativeDocument(),
            publishedAt = Instant.EPOCH,
        )
        every { recordRepository.findByIdAndDeletedAtIsNull(id) } returns record

        val preview = service.preview(record.document, "MAAYUAN")
        val saved = service.compatibility("w_${id.toHexString()}", "MAAYUAN")

        assertEquals(preview, saved)
    }

    @Test
    fun `adapter incompatibility does not block publication`() {
        val id = ObjectId("66ed00000000000000000005")
        val document = nativeDocument().copy(rounds = listOf(WorkRound(1, actions = listOf(PauseAction()))))
        val current = WorkRecord(id = id, ownerId = "owner", document = document)
        every { recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(id, "owner") } returns current
        every { recordRepository.replaceIfRevision(any(), 1) } answers { firstArg() }

        val published = service.publish("owner", "w_${id.toHexString()}", 1)

        assertEquals(WorkStatus.PUBLIC, published.metadata.status)
        assertEquals(2, published.metadata.revision)
    }

    private fun source(tags: List<String>) = MaaCopilotWorkSource(
        copilotId = 7,
        stageName = "数据库冗余关卡",
        name = "数据库冗余标题",
        content = RAW_CONTENT,
        tags = tags,
    )

    private fun level(key: String, game: String) = LevelCatalogEntity(
        levelKey = key,
        game = game,
        catOne = "活动",
        catTwo = "测试活动",
        catThree = "",
        name = "测试关卡",
        levelId = "level-1",
        stageId = "stage-1",
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        createdBy = "test",
        updatedBy = "test",
    )

    private fun nativeDocument() = WorkDocument(
        format = "yuanhub-work",
        version = 1,
        game = "如鸢",
        stageName = "测试关卡",
        doc = WorkDoc("测试", ""),
        operators = listOf("一", "二", "三", "四", "五"),
        rounds = listOf(WorkRound(1, actions = listOf(com.lhs.share.hub.work.model.SlotAction(1, "attack")))),
    )

    private fun localTime(hour: Int) = LocalDateTime.of(2026, 9, 18, hour, 0)

    private companion object {
        const val RAW_CONTENT =
            "{\"stage_name\":\"测试关卡\",\"stage_id\":\"stage-1\",\"doc\":{\"title\":\"content 标题\",\"details\":\"\"}," +
                "\"opers\":[{\"name\":\"一\"},{\"name\":\"二\"},{\"name\":\"三\"},{\"name\":\"四\"},{\"name\":\"五\"}]," +
                "\"actions\":{\"回合1行动1\":{\"text_doc\":\"1普\"}}}"
    }
}
