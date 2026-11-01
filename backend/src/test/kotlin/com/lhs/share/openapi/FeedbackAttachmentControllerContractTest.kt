package com.lhs.share.openapi

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.FeedbackReportController
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackPublicService
import com.lhs.share.hub.service.report.FeedbackReportService
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class FeedbackAttachmentControllerContractTest {
    private val reportService = mockk<FeedbackReportService>()
    private val publicService = mockk<FeedbackPublicService>()
    private val storageService = mockk<MediaStorageService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
            FeedbackReportController(reportService, publicService, storageService, helper),
        ).build()
        every { helper.requireUserId() } returns "u1"
    }

    @Test
    fun `download returns private attachment headers and bytes`() {
        val bytes = "log body".toByteArray()
        val asset = MediaAsset(
            id = "med_log",
            ownerUserId = "u1",
            originalName = "../错误 日志.log",
            mime = "text/plain",
            size = bytes.size.toLong(),
            storagePath = "med_log.log",
            kind = MediaKind.FILE,
        )
        every { reportService.getAttachment("u1", "rpt_1", "med_log") } returns asset
        every { storageService.loadAuthorizedAsset(asset) } returns ByteArrayResource(bytes)

        mockMvc.perform(get("/v1/reports/rpt_1/attachments/med_log"))
            .andExpect(status().isOk)
            .andExpect(content().bytes(bytes))
            .andExpect(content().contentType("text/plain"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("Cache-Control", "no-store, private"))
            .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
            .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(".."))))
    }

    @Test
    fun `download permission error uses real HTTP status`() {
        every { reportService.getAttachment("u1", "rpt_1", "med_log") } throws
            ApiResultException(403, "没有该反馈模块的查看权限")

        mockMvc.perform(get("/v1/reports/rpt_1/attachments/med_log"))
            .andExpect(status().isForbidden)
    }
}
