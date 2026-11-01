package com.lhs.share.openapi

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.controller.report.AdminFeedbackController
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.service.report.FeedbackReportService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class AdminFeedbackQueueContractTest {
    private val reports = mockk<FeedbackReportService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mvc = MockMvcBuilders.standaloneSetup(AdminFeedbackController(mockk(), reports, mockk(), helper)).build()

    @Test
    fun `queue forwards filters and chosen sorting to the authorized service`() {
        every { helper.requireUserId() } returns "operator"
        every { reports.list(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            FeedbackReportListResponse(emptyList(), 0, 2, 20, false, "createdAt", "asc")

        mvc.perform(
            get("/v1/admin/feedback/queue")
                .param("queue", "NEEDS_REPLY").param("page", "2").param("workArea", "STAR")
                .param("type", "EXPERIENCE").param("q", "保存")
                .param("sortBy", "createdAt").param("sortOrder", "asc"),
        ).andExpect(status().isOk)

        verify(exactly = 1) {
            reports.list("operator", 2, 20, null, "EXPERIENCE", "STAR", null, false, null, "保存", "createdAt", "asc", "NEEDS_REPLY")
        }
    }

    @Test
    fun `queue keeps the existing sorting defaults when parameters are absent`() {
        every { helper.requireUserId() } returns "operator"
        every { reports.list(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            FeedbackReportListResponse(emptyList(), 0, 1, 20, false, "updatedAt", "desc")

        mvc.perform(get("/v1/admin/feedback/queue")).andExpect(status().isOk)

        verify { reports.list("operator", 1, 20, null, null, null, null, false, null, null, "updatedAt", "desc", "UNASSIGNED") }
    }
}
