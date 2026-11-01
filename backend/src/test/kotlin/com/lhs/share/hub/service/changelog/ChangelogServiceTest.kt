package com.lhs.share.hub.service.changelog

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.changelog.request.ChangelogDraftRequest
import com.lhs.share.hub.repository.ChangelogEntryRepository
import com.lhs.share.hub.repository.entity.ChangelogEntry
import com.lhs.share.hub.repository.entity.ChangelogPublishedRevision
import com.lhs.share.hub.repository.entity.ChangelogRevisionState
import com.lhs.share.hub.repository.entity.ChangelogWorkingRevision
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import java.time.Instant
import java.util.Optional

class ChangelogServiceTest {
    private val repository = mockk<ChangelogEntryRepository>()
    private val validator = mockk<ChangelogContentValidator>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val audit = mockk<AdminAuditService>()
    private val service = ChangelogService(repository, validator, authorization, audit)
    private val body = mapOf<String, Any?>("type" to "doc", "content" to listOf(mapOf("type" to "paragraph")))
    private val json = jacksonObjectMapper().valueToTree<com.fasterxml.jackson.databind.JsonNode>(body)

    @Test
    fun `待审修订不改变公开快照且批准后原子替换`() {
        var current = publishedEntry()
        every { authorization.hasPermission(any(), any()) } returns true
        every { repository.findById("chg_1") } answers { Optional.of(current) }
        every { repository.save(any()) } answers {
            current = firstArg<ChangelogEntry>().copy(version = (current.version ?: 0) + 1)
            current
        }
        every { validator.validate(any(), "editor", any()) } returns ValidatedChangelogContent(body, emptySet())
        every { audit.record(any()) } answers { firstArg() }

        val draft = service.saveDraft("editor", "chg_1", ChangelogDraftRequest("新版", "2.0", json, 2))
        assertEquals("旧版", draft.publishedRevision?.title)
        val submitted = service.submit("editor", "chg_1", draft.version)
        assertEquals("旧版", submitted.publishedRevision?.title)
        val approved = service.approve("reviewer", "chg_1", submitted.version)

        assertEquals("新版", approved.publishedRevision?.title)
        assertEquals("editor", approved.publishedRevision?.submittedBy)
        assertNull(approved.workingRevision)
    }

    @Test
    fun `作者不能审核自己的内容`() {
        val entry = publishedEntry().copy(
            version = 3,
            workingRevision = ChangelogWorkingRevision(
                2,
                ChangelogRevisionState.IN_REVIEW,
                "新版",
                "2.0",
                body,
                emptySet(),
                "editor",
                "editor",
                Instant.EPOCH,
            ),
        )
        every { authorization.hasPermission(any(), any()) } returns true
        every { repository.findById("chg_1") } returns Optional.of(entry)

        val error = assertThrows(ChangelogApiException::class.java) { service.approve("editor", "chg_1", 3) }
        assertEquals("self_review_forbidden", error.code)
    }

    @Test
    fun `退回后可编辑且撤回不删除公开快照`() {
        var current = publishedEntry().copy(
            version = 3,
            workingRevision = ChangelogWorkingRevision(
                2,
                ChangelogRevisionState.IN_REVIEW,
                "新版",
                "2.0",
                body,
                emptySet(),
                "editor",
                "editor",
                Instant.EPOCH,
            ),
        )
        every { authorization.hasPermission(any(), any()) } returns true
        every { repository.findById("chg_1") } answers { Optional.of(current) }
        every { repository.save(any()) } answers {
            current = firstArg<ChangelogEntry>().copy(version = (current.version ?: 0) + 1)
            current
        }
        every { audit.record(any()) } answers { firstArg() }

        val rejected = service.reject("reviewer", "chg_1", 3, "请补充说明")
        assertEquals(ChangelogRevisionState.DRAFT.name, rejected.workingRevision?.state)
        assertEquals("请补充说明", rejected.workingRevision?.rejectionReason)

        val withdrawn = service.withdraw("reviewer", "chg_1", rejected.version)
        assertEquals("旧版", withdrawn.publishedRevision?.title)
        assertEquals("reviewer", withdrawn.withdrawnBy)

        val submitted = service.submit("editor", "chg_1", withdrawn.version)
        val republished = service.approve("reviewer", "chg_1", submitted.version)
        assertEquals("新版", republished.publishedRevision?.title)
        assertNull(republished.withdrawnAt)
    }

    @Test
    fun `拒绝无权限和过期版本`() {
        every { authorization.hasPermission("outsider", AdminPermission.CHANGELOG_REVIEW) } returns false
        val forbidden = assertThrows(ChangelogApiException::class.java) {
            service.withdraw("outsider", "chg_1", 2)
        }
        assertEquals(403, forbidden.status.value())

        every { authorization.hasPermission("reviewer", AdminPermission.CHANGELOG_REVIEW) } returns true
        every { repository.findById("chg_1") } returns Optional.of(publishedEntry())
        val conflict = assertThrows(ChangelogApiException::class.java) {
            service.withdraw("reviewer", "chg_1", 1)
        }
        assertEquals("version_conflict", conflict.code)
    }

    @Test
    fun `持久化乐观锁冲突不会覆盖新版本`() {
        every { authorization.hasPermission("editor", AdminPermission.CHANGELOG_WRITE) } returns true
        every { repository.findById("chg_1") } returns Optional.of(publishedEntry())
        every { validator.validate(any(), "editor", any()) } returns ValidatedChangelogContent(body, emptySet())
        every { repository.save(any()) } throws OptimisticLockingFailureException("stale")

        val conflict = assertThrows(ChangelogApiException::class.java) {
            service.saveDraft("editor", "chg_1", ChangelogDraftRequest("新版", "2.0", json, 2))
        }

        assertEquals("version_conflict", conflict.code)
    }

    private fun publishedEntry() = ChangelogEntry(
        id = "chg_1",
        createdBy = "editor",
        createdAt = Instant.EPOCH,
        updatedBy = "reviewer",
        updatedAt = Instant.EPOCH,
        publishedRevision = ChangelogPublishedRevision(
            1,
            "旧版",
            "1.0",
            body,
            emptySet(),
            "editor",
            "editor",
            Instant.EPOCH,
            "reviewer",
            Instant.EPOCH,
        ),
        version = 2,
    )
}
