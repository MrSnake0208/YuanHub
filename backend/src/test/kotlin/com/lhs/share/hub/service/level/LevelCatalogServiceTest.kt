package com.lhs.share.hub.service.level

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.level.request.LevelCatalogWriteRequest
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.entity.level.LevelCatalogRevisionAction
import com.lhs.share.hub.repository.entity.level.LevelStatus
import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.repository.level.LevelCatalogRevisionRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class LevelCatalogServiceTest {
    private val repository = mockk<LevelCatalogRepository>(relaxed = true)
    private val revisionRepository = mockk<LevelCatalogRevisionRepository>(relaxed = true)
    private val transactionManager = RecordingTransactionManager()
    private val service = LevelCatalogService(
        repository,
        revisionRepository,
        ObjectMapper().findAndRegisterModules(),
        TransactionTemplate(transactionManager),
    )

    @BeforeEach
    fun setUp() {
        transactionManager.reset()
        every { repository.save(any()) } answers { firstArg() }
        every { revisionRepository.save(any()) } answers { firstArg() }
        every { repository.findByLevelKey(any()) } returns null
        every { repository.findByGameAndStageId(any(), any()) } returns null
        every { repository.findByGameAndLevelId(any(), any()) } returns null
        every { repository.findTopByOrderByUpdatedAtDesc() } returns null
        every { repository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns emptyList()
    }

    @Test
    fun `create normalizes fields and records create history`() {
        val result = service.create("admin", request())

        assertTrue(result.id.startsWith("lvl_"))
        assertEquals(0, result.revision)
        assertEquals("新关卡", result.name)
        verify {
            revisionRepository.save(match { it.action == LevelCatalogRevisionAction.CREATE && it.actorUserId == "admin" })
        }
        assertEquals(1, transactionManager.commits)
        assertEquals(0, transactionManager.rollbacks)
    }

    @Test
    fun `history failure rolls back the catalog transaction`() {
        every { revisionRepository.save(any()) } throws IllegalStateException("history unavailable")

        assertThrows(IllegalStateException::class.java) {
            service.create("admin", request())
        }

        assertEquals(0, transactionManager.commits)
        assertEquals(1, transactionManager.rollbacks)
    }

    @Test
    fun `same game stage id is rejected`() {
        every { repository.findByGameAndStageId("代号鸢", "stage_1") } returns entity()

        val exception = assertThrows(LevelCatalogApiException::class.java) {
            service.create("admin", request())
        }

        assertEquals(HttpStatus.CONFLICT, exception.status)
        assertEquals("level_conflict", exception.code)
    }

    @Test
    fun `stale update returns a revision conflict before compare and set`() {
        every { repository.findByLevelKey("lvl_existing") } returns entity()

        val exception = assertThrows(LevelCatalogApiException::class.java) {
            service.update("admin", "lvl_existing", request().copy(expectedRevision = 0))
        }

        assertEquals(HttpStatus.CONFLICT, exception.status)
        assertEquals("level_revision_conflict", exception.code)
        verify(exactly = 0) { repository.updateIfRevision(any(), any(), any()) }
    }

    @Test
    fun `compare and set failure returns a revision conflict`() {
        every { repository.findByLevelKey("lvl_existing") } returns entity()
        every { repository.updateIfRevision("lvl_existing", 1, any()) } returns null

        val exception = assertThrows(LevelCatalogApiException::class.java) {
            service.update("admin", "lvl_existing", request().copy(expectedRevision = 1))
        }

        assertEquals("level_revision_conflict", exception.code)
    }

    @Test
    fun `explicit null end time clears an existing value`() {
        val existing = entity().copy(endTime = Instant.parse("2027-01-01T00:00:00Z"))
        every { repository.findByLevelKey("lvl_existing") } returns existing
        every { repository.updateIfRevision("lvl_existing", 1, any()) } answers { thirdArg() }

        val result = service.update(
            "admin",
            "lvl_existing",
            request().copy(expectedRevision = 1, endTime = ObjectMapper().nullNode()),
        )

        assertEquals(null, result.endTime)
        verify {
            revisionRepository.save(
                match {
                    it.action == LevelCatalogRevisionAction.UPDATE &&
                        it.before?.endTime?.toEpochMilli() == existing.endTime?.toEpochMilli() &&
                        it.after?.endTime == null
                },
            )
        }
    }

    @Test
    fun `omitted end time preserves an existing value`() {
        val existing = entity().copy(endTime = Instant.parse("2027-01-01T00:00:00Z"))
        every { repository.findByLevelKey("lvl_existing") } returns existing
        every { repository.updateIfRevision("lvl_existing", 1, any()) } answers { thirdArg() }

        val result = service.update("admin", "lvl_existing", request().copy(expectedRevision = 1))

        assertEquals(existing.endTime, result.endTime)
    }

    @Test
    fun `generic update cannot bypass archive history semantics`() {
        every { repository.findByLevelKey("lvl_existing") } returns entity()

        val exception = assertThrows(LevelCatalogApiException::class.java) {
            service.update("admin", "lvl_existing", request().copy(expectedRevision = 1, status = "ARCHIVED"))
        }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, exception.status)
        assertEquals("status", exception.fieldPath)
        verify(exactly = 0) { repository.updateIfRevision(any(), any(), any()) }
        verify(exactly = 0) { revisionRepository.save(any()) }
    }

    @Test
    fun `archive records dedicated history action`() {
        every { repository.findByLevelKey("lvl_existing") } returns entity()
        every { repository.updateIfRevision("lvl_existing", 1, any()) } answers { thirdArg() }

        val result = service.archive("admin", "lvl_existing", 1)

        assertEquals("ARCHIVED", result.status)
        verify {
            revisionRepository.save(
                match {
                    it.action == LevelCatalogRevisionAction.ARCHIVE &&
                        it.before?.status == LevelStatus.ACTIVE &&
                        it.after?.status == LevelStatus.ARCHIVED
                },
            )
        }
    }

    @Test
    fun `catalog timestamp stays monotonic when wall clock is behind current version`() {
        val currentVersion = Instant.parse("2099-01-01T00:00:00Z")
        every { repository.findByLevelKey("lvl_existing") } returns entity()
        every { repository.findTopByOrderByUpdatedAtDesc() } returns entity("lvl_latest").copy(updatedAt = currentVersion)
        every { repository.updateIfRevision("lvl_existing", 1, any()) } answers { thirdArg() }

        val result = service.update("admin", "lvl_existing", request().copy(expectedRevision = 1))

        assertEquals(currentVersion.plusNanos(1), result.updatedAt)
    }

    @Test
    fun `archived entries are hidden from the default public catalog`() {
        val active = entity()
        val archived = entity("lvl_archived").copy(status = LevelStatus.ARCHIVED)
        every { repository.findAllByOrderBySortOrderAscLevelKeyAsc() } returns listOf(active, archived)
        every { repository.findTopByOrderByUpdatedAtDesc() } returns active

        val result = service.catalog()
        val withArchived = service.catalog(includeArchived = true)

        assertEquals(listOf("lvl_existing"), result.levels.map { it.id })
        assertEquals(2, withArchived.levels.size)
        assertFalse(result.levels.any { it.status == "ARCHIVED" })
    }

    @Test
    fun `import preview does not write entity or history`() {
        val body = ObjectMapper().readTree(
            """
            {"levels":[{
              "id":"lvl_imported","game":"如鸢","cat_one":"活动","cat_two":"","cat_three":"",
              "name":"导入关卡","level_id":"event/1","stage_id":"event_1"
            }]}
            """.trimIndent(),
        )

        val result = service.previewImport("admin", body)

        assertEquals(1, result.createdCount)
        assertEquals(0, result.errorCount)
        assertEquals("0", result.catalogVersion)
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { revisionRepository.save(any()) }
    }

    @Test
    fun `export shaped import creates one import history entry`() {
        val body = ObjectMapper().readTree(
            """
            {"levels":[{
              "id":"lvl_imported","game":"如鸢","cat_one":"活动","cat_two":"","cat_three":"",
              "name":"导入关卡","level_id":"event/1","stage_id":"event_1"
            }]}
            """.trimIndent(),
        )
        val saved = entity("lvl_imported").copy(
            game = "如鸢",
            catOne = "活动",
            catTwo = "",
            catThree = "",
            name = "导入关卡",
            levelId = "event/1",
            stageId = "event_1",
        )
        every { repository.save(any()) } returns saved
        every { repository.findByLevelKey("lvl_imported") } returns null

        val result = service.commitImport("admin", body)

        assertEquals(1, result.createdCount)
        verify { revisionRepository.save(match { it.action == LevelCatalogRevisionAction.IMPORT }) }
    }

    private fun request() = LevelCatalogWriteRequest(
        game = " 代号鸢 ",
        catOne = " 主线 ",
        catTwo = "第一章",
        catThree = "",
        name = " 新关卡 ",
        levelId = "level/1",
        stageId = "stage_1",
        isOpen = true,
        sortOrder = 0,
    )

    private fun entity(levelKey: String = "lvl_existing") = LevelCatalogEntity(
        levelKey = levelKey,
        game = "代号鸢",
        catOne = "主线",
        catTwo = "第一章",
        catThree = "",
        name = "旧关卡",
        levelId = "level/1",
        stageId = "stage_1",
        revision = 1,
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        createdBy = "seed",
        updatedBy = "seed",
    )

    private class RecordingTransactionManager : PlatformTransactionManager {
        var commits: Int = 0
            private set
        var rollbacks: Int = 0
            private set

        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        override fun commit(status: TransactionStatus) {
            commits += 1
        }

        override fun rollback(status: TransactionStatus) {
            rollbacks += 1
        }

        fun reset() {
            commits = 0
            rollbacks = 0
        }
    }
}
