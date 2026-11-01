package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionRejectRequest
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionSubmitRequest
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.AchievementSuggestionRepository
import com.lhs.share.hub.repository.entity.AchievementCandidate
import com.lhs.share.hub.repository.entity.AchievementSuggestion
import com.lhs.share.hub.repository.entity.AchievementSuggestionStatus
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class AchievementSuggestionServiceTest {
    private val repo = mockk<AchievementSuggestionRepository>()
    private val catalogs = mockk<AchievementCatalogRepository>()
    private val admin = mockk<AchievementCatalogAdminService>()
    private val auth = mockk<AdminAuthorizationService>()
    private val service = AchievementSuggestionService(repo, catalogs, admin, auth, mockk<TransactionTemplate>())
    private val candidate = AchievementCandidate("如鸢", "cat_test", "候选成就", "测试条件")
    private val original = AchievementSuggestion("s1", "owner", "key", Instant.EPOCH, candidate, "https://example.com", "私人资料")
    private val content = CatalogContent("如鸢", categories = listOf(CatalogCategory("cat_test", "分类")))

    @Test
    fun `owner only detail and denied reviewer never return private data`() {
        every { repo.find("s1") } returns original
        assertEquals("私人资料", service.detail("owner", "s1").suggestion.submissionNote)
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(InventoryApiException::class.java) { service.detail("other", "s1") }.status)
        every { auth.hasPermission("calendar-only", AdminPermission.ACHIEVEMENT_CATALOG_WRITE) } returns false
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows(InventoryApiException::class.java) {
                service.queue("calendar-only", null, null, 1, 20)
            }.status,
        )
        assertThrows(InventoryApiException::class.java) {
            service.reject("calendar-only", "s1", AchievementSuggestionRejectRequest(0, "理由"))
        }
        verify(exactly = 0) {
            repo.list(any(), any(), any(), any(), any())
            repo.reject(any(), any(), any(), any())
        }
    }

    @Test
    fun `same request retries original even after category removal but different content conflicts`() {
        every { repo.findRequest("owner", "key") } returns original
        val request = AchievementSuggestionSubmitRequest("key", candidate, original.sourceUrl, "私人资料")
        assertEquals(original, service.submit("owner", request).suggestion)
        assertEquals(
            HttpStatus.CONFLICT,
            assertThrows(InventoryApiException::class.java) {
                service.submit("owner", request.copy(candidate = candidate.copy(name = "不同资料")))
            }.status,
        )
        assertThrows(InventoryApiException::class.java) { service.submit("owner", request.copy(sourceUrl = "javascript:alert(1)")) }
        verify {
            catalogs wasNot io.mockk.Called
            admin wasNot io.mockk.Called
        }
        verify(exactly = 0) { repo.insert(any()) }
    }

    @Test
    fun `new submission validates catalog reward game quantity and target`() {
        every { repo.findRequest(any(), any()) } returns null
        every { catalogs.published("如鸢") } returns CatalogPublication("v1", content, Instant.EPOCH, "admin")
        every { repo.insert(any()) } answers { firstArg() }
        val request = AchievementSuggestionSubmitRequest("new", candidate, "https://example.com/source", null)
        assertEquals(candidate, service.submit("owner", request).suggestion.original)
        for (invalid in listOf(
            candidate.copy(categoryId = "missing"),
            candidate.copy(name = ""),
            candidate.copy(target = 0),
            candidate.copy(target = 1000000000001),
            candidate.copy(linkedMetric = "other"),
            candidate.copy(rewards = listOf(com.lhs.share.hub.controller.achievement.response.AchievementReward("unknown", "未知", 1))),
        )) {
            assertThrows(InventoryApiException::class.java) { service.submit("owner", request.copy(candidate = invalid)) }
        }
        verify(exactly = 1) { repo.insert(any()) }
    }

    @Test
    fun `empty reads do not seed or initialize catalog and owner list is scoped`() {
        every { catalogs.published("如鸢") } returns null
        every { repo.list("owner", null, null, 1, 20) } returns (emptyList<AchievementSuggestion>() to 0L)
        assertEquals(0, service.mine("owner", null, 1, 20).items.size)
        repeat(2) { assertThrows(InventoryApiException::class.java) { service.options("如鸢") } }
        verify(exactly = 0) {
            catalogs.insert(any())
            catalogs.replace(any(), any())
            repo.insert(any())
        }
        verify { admin wasNot io.mockk.Called }
    }

    @Test
    fun `accepted list reads published projection once per game`() {
        val accepted = original.copy(status = AchievementSuggestionStatus.ACCEPTED, achievementId = "yh_accepted")
        every { repo.list("owner", null, null, 1, 20) } returns (listOf(accepted, accepted.copy(id = "s2")) to 2L)
        every { catalogs.published("如鸢") } returns CatalogPublication(
            "v1",
            content.copy(entries = listOf(candidate.entry("yh_accepted", 0))),
            Instant.EPOCH,
            "publisher",
        )
        assertEquals(listOf(true, true), service.mine("owner", null, 1, 20).items.map { it.currentlyPublished })
        verify(exactly = 1) { catalogs.published("如鸢") }
        verify { admin wasNot io.mockk.Called }
    }

    @Test
    fun `rejection requires reason version and pending state`() {
        every { auth.hasPermission("admin", AdminPermission.ACHIEVEMENT_CATALOG_WRITE) } returns true
        every { repo.find("s1") } returns original
        assertThrows(InventoryApiException::class.java) { service.reject("admin", "s1", AchievementSuggestionRejectRequest(0, " ")) }
        assertThrows(InventoryApiException::class.java) { service.reject("admin", "s1", AchievementSuggestionRejectRequest(1, "重复")) }
        val rejected = original.copy(status = AchievementSuggestionStatus.REJECTED, version = 1, reviewNote = "重复")
        every { repo.reject("s1", 0, "admin", "重复") } returns rejected
        assertEquals(rejected, service.reject("admin", "s1", AchievementSuggestionRejectRequest(0, "重复")).suggestion)
    }
}
