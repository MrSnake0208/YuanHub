package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.repository.FeedbackAgentReviewRepository
import com.lhs.share.hub.repository.entity.FeedbackAgentClassification
import com.lhs.share.hub.repository.entity.FeedbackAgentReview
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class FeedbackAgentAnalysisServiceTest {
    private val repository = mockk<FeedbackAgentReviewRepository>()
    private val reports = mockk<FeedbackReportService>()
    private val categories = mockk<FeedbackCategoryService>()
    private val service = FeedbackAgentAnalysisService(repository, reports, categories)

    @Test
    fun `analysis persists separately against the exact ticket version`() {
        val updatedAt = Instant.parse("2026-10-02T12:00:00Z")
        every { reports.getByIdForAutomation("admin", "rpt_1", setOf("UI")) } returns ticket(updatedAt)
        every { categories.keys() } returns setOf("UI", "STAR")
        val saved = slot<FeedbackAgentReview>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val result = service.save(
            ownerUserId = "admin",
            integrationTokenId = "int_1",
            ticketId = "rpt_1",
            allowedAreas = setOf("UI"),
            input = input(updatedAt),
        )

        assertFalse(result.stale)
        assertEquals("rpt_1", saved.captured.ticketId)
        assertEquals("int_1", saved.captured.integrationTokenId)
        assertEquals("BUG", saved.captured.classification.suggestedType)
        assertEquals("UI", saved.captured.classification.suggestedArea)
        assertEquals("HIGH", saved.captured.classification.severity)
        verify(exactly = 1) { reports.getByIdForAutomation("admin", "rpt_1", setOf("UI")) }
    }

    @Test
    fun `analysis write refuses a stale ticket snapshot without persistence`() {
        val current = Instant.parse("2026-10-02T12:00:00Z")
        every { reports.getByIdForAutomation("admin", "rpt_1", null) } returns ticket(current)

        val error = assertThrows(ApiResultException::class.java) {
            service.save(
                ownerUserId = "admin",
                integrationTokenId = "int_1",
                ticketId = "rpt_1",
                allowedAreas = null,
                input = input(Instant.parse("2026-10-02T11:59:59Z")),
            )
        }

        assertEquals(409, error.statusCode)
        assertEquals("ticket_changed", error.message)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `latest analysis becomes stale when ticket updatedAt changes`() {
        val oldVersion = Instant.parse("2026-10-02T12:00:00Z")
        val currentVersion = Instant.parse("2026-10-02T12:05:00Z")
        every { reports.getByIdForAutomation("admin", "rpt_1", null) } returns ticket(currentVersion)
        every { repository.findFirstByTicketIdOrderByUpdatedAtDesc("rpt_1") } returns review(oldVersion)

        val result = service.latest("admin", "rpt_1", null)

        assertTrue(result?.stale == true)
        assertEquals(oldVersion, result?.review?.ticketUpdatedAt)
    }

    private fun input(ticketUpdatedAt: Instant) = FeedbackAgentReviewInput(
        ticketUpdatedAt = ticketUpdatedAt,
        source = "webcodex",
        model = "test-model",
        summary = "定位到移动端布局问题",
        suggestedType = "bug",
        suggestedArea = "ui",
        severity = "high",
        suspectedModules = listOf("feedback"),
        suspectedFiles = listOf("YuanHub/src/pages/feedback/manage.vue"),
        suggestedAction = "code_investigation",
        confidence = 0.9,
        evidence = listOf("fixed editor overlaps keyboard"),
        implementationResult = null,
    )

    private fun review(ticketUpdatedAt: Instant) = FeedbackAgentReview(
        id = "far_1",
        ticketId = "rpt_1",
        ticketUpdatedAt = ticketUpdatedAt,
        integrationTokenId = "int_1",
        actorUserId = "admin",
        source = "WEBCODEX",
        summary = "summary",
        classification = FeedbackAgentClassification(severity = "UNKNOWN"),
        suggestedAction = "CODE_INVESTIGATION",
        createdAt = ticketUpdatedAt,
        updatedAt = ticketUpdatedAt,
    )

    private fun ticket(updatedAt: Instant) = FeedbackReportResponse(
        id = "rpt_1",
        type = "BUG",
        category = "UI",
        area = "UI",
        status = "OPEN",
        content = "content",
        messages = emptyList(),
        hasAdminReply = false,
        quota = FeedbackReportResponse.QuotaInfo(0, 3, false),
        viewerIsReporter = false,
        viewerCanManage = true,
        clientInfo = null,
        reporter = FeedbackReportResponse.UserInfo("reporter-secret", "Reporter"),
        handler = null,
        createdAt = Instant.parse("2026-10-02T10:00:00Z"),
        updatedAt = updatedAt,
    )
}
