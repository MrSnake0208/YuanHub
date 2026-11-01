package com.lhs.share.openapi

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.handler.IntegrationExceptionHandler
import com.lhs.share.hub.controller.report.response.FeedbackMessageResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackAgentAnalysisService
import com.lhs.share.hub.service.report.FeedbackReportService
import com.lhs.share.hub.service.report.FeedbackWorkflowService
import com.lhs.share.openapi.feedback.OpenApiFeedbackController
import com.lhs.share.openapi.integration.IntegrationPrincipal
import com.lhs.share.openapi.integration.IntegrationScope
import com.lhs.share.openapi.integration.IntegrationTokenService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class OpenApiFeedbackControllerContractTest {
    private val tokens = mockk<IntegrationTokenService>()
    private val reports = mockk<FeedbackReportService>()
    private val workflow = mockk<FeedbackWorkflowService>()
    private val analysis = mockk<FeedbackAgentAnalysisService>()
    private val mediaStorage = mockk<MediaStorageService>()
    private val controller = OpenApiFeedbackController(tokens, reports, workflow, analysis, mediaStorage)
    private val mvc = MockMvcBuilders.standaloneSetup(controller)
        .setControllerAdvice(IntegrationExceptionHandler())
        .build()

    @Test
    fun `queue intersects token areas through the existing feedback service`() {
        every { tokens.validateAuthorization("Bearer secret", IntegrationScope.FEEDBACK_READ) } returns principal(setOf("UI", "STAR"))
        every {
            reports.listForAutomation(
                "admin",
                2,
                20,
                null,
                "BUG",
                "UI",
                null,
                null,
                "keyboard",
                "updatedAt",
                "desc",
                "DEV",
                setOf("UI", "STAR"),
            )
        } returns FeedbackReportListResponse(emptyList(), 0, 2, 20, false, "updatedAt", "desc")

        mvc.perform(
            get("/open-api/feedback/queue")
                .header("Authorization", "Bearer secret")
                .param("queue", "DEV")
                .param("page", "2")
                .param("work_area", "UI")
                .param("type", "BUG")
                .param("q", "keyboard"),
        ).andExpect(status().isOk)

        verify(exactly = 1) {
            reports.listForAutomation(
                "admin",
                2,
                20,
                null,
                "BUG",
                "UI",
                null,
                null,
                "keyboard",
                "updatedAt",
                "desc",
                "DEV",
                setOf("UI", "STAR"),
            )
        }
    }

    @Test
    fun `detail response omits reporter identity client network data and message author identity`() {
        every { tokens.validateAuthorization("Bearer secret", IntegrationScope.FEEDBACK_READ) } returns principal(setOf("UI"))
        every { reports.getByIdForAutomation("admin", "rpt_1", setOf("UI")) } returns detail()

        mvc.perform(
            get("/open-api/feedback/rpt_1")
                .header("Authorization", "Bearer secret"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("rpt_1"))
            .andExpect(jsonPath("$.data.reporter").doesNotExist())
            .andExpect(jsonPath("$.data.clientInfo").doesNotExist())
            .andExpect(jsonPath("$.data.client_info").doesNotExist())
            .andExpect(jsonPath("$.data.messages[0].author").doesNotExist())
            .andExpect(jsonPath("$.data.messages[0].content").value("用户补充"))

        verify(exactly = 1) { reports.getByIdForAutomation("admin", "rpt_1", setOf("UI")) }
    }

    @Test
    fun `direct ticket id cannot bypass backend ticket authorization`() {
        every { tokens.validateAuthorization("Bearer secret", IntegrationScope.FEEDBACK_READ) } returns principal(setOf("UI"))
        every { reports.getByIdForAutomation("admin", "rpt_secret", setOf("UI")) } throws
            ApiResultException(403, "没有该反馈模块的后台查看权限")

        mvc.perform(
            get("/open-api/feedback/rpt_secret")
                .header("Authorization", "Bearer secret"),
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("feedback_forbidden"))
    }

    @Test
    fun `attachment access delegates to token-area-bounded ticket lookup`() {
        every { tokens.validateAuthorization("Bearer secret", IntegrationScope.FEEDBACK_READ) } returns principal(setOf("UI"))
        val asset = MediaAsset(
            id = "med_1",
            ownerUserId = "reporter-secret-id",
            originalName = "debug.txt",
            mime = "text/plain",
            size = 5,
            storagePath = "med_1.txt",
            kind = MediaKind.FILE,
        )
        every { reports.getAttachmentForAutomation("admin", "rpt_1", "med_1", setOf("UI")) } returns asset
        every { mediaStorage.loadAuthorizedAsset(asset) } returns ByteArrayResource("hello".toByteArray())

        mvc.perform(
            get("/open-api/feedback/rpt_1/attachments/med_1")
                .header("Authorization", "Bearer secret"),
        ).andExpect(status().isOk)

        verify(exactly = 1) {
            reports.getAttachmentForAutomation("admin", "rpt_1", "med_1", setOf("UI"))
        }
    }

    private fun principal(areas: Set<String>?) = IntegrationPrincipal(
        tokenId = "int_1",
        ownerUserId = "admin",
        name = "WebCodex",
        scopes = setOf("feedback:read"),
        feedbackAreas = areas,
    )

    private fun detail() = FeedbackReportResponse(
        id = "rpt_1",
        type = "BUG",
        category = "UI",
        area = "UI",
        status = "OPEN",
        workflowStage = "PROCESSING",
        workArea = "UI",
        operatorAssigneeUserId = "operator-secret-id",
        operatorAssigneeName = "运营",
        content = "正文",
        messages = listOf(
            FeedbackMessageResponse(
                id = "rpm_1",
                senderKind = "REPORTER",
                author = FeedbackMessageResponse.AuthorInfo("reporter-secret-id", "用户昵称"),
                content = "用户补充",
                images = emptyList(),
                files = emptyList(),
                createdAt = Instant.parse("2026-10-02T10:05:00Z"),
            ),
        ),
        hasAdminReply = false,
        quota = FeedbackReportResponse.QuotaInfo(0, 3, false),
        viewerIsReporter = false,
        viewerCanManage = true,
        clientInfo = FeedbackReportResponse.ClientInfoResponse(
            consent = true,
            userAgent = "Secret-UA",
            ip = "203.0.113.10",
            ipLocation = "Secret-Location",
        ),
        reporter = FeedbackReportResponse.UserInfo("reporter-secret-id", "用户昵称"),
        handler = FeedbackReportResponse.UserInfo("operator-secret-id", "运营"),
        createdAt = Instant.parse("2026-10-02T10:00:00Z"),
        updatedAt = Instant.parse("2026-10-02T10:05:00Z"),
    )
}
