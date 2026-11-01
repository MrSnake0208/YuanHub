package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.handler.GlobalExceptionHandler
import com.lhs.share.hub.controller.report.FeedbackReportController
import com.lhs.share.hub.controller.report.request.FeedbackReportCreateRequest
import com.lhs.share.hub.controller.report.response.FeedbackReportListItem
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackPublicService
import com.lhs.share.hub.service.report.FeedbackReportService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class FeedbackReportControllerContractTest {
    private val reportService = mockk<FeedbackReportService>()
    private val publicService = mockk<FeedbackPublicService>()
    private val storageService = mockk<MediaStorageService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        mockMvc = MockMvcBuilders
            .standaloneSetup(FeedbackReportController(reportService, publicService, storageService, helper))
            .setControllerAdvice(GlobalExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
        every { helper.requireUserId() } returns "u1"
    }

    @Test
    fun `ordinary OTHER feedback accepts content and custom board without title or consent`() {
        every { reportService.create("u1", any()) } answers { response().copy(type = secondArg<FeedbackReportCreateRequest>().type) }
        mockMvc.perform(
            post("/v1/reports").contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"OTHER","category":"CUSTOM_TEST","content":"普通反馈"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.type").value("OTHER"))
        verify {
            reportService.create(
                "u1",
                match {
                    it.type == "OTHER" && it.category == "CUSTOM_TEST" && it.title == null &&
                        !it.publicConsent &&
                        !it.clientInfoConsent
                },
            )
        }
    }

    @Test
    fun `public_consent snake case binds independently and missing consent defaults to false`() {
        every { reportService.create("u1", any()) } answers {
            response().copy(publicConsent = secondArg<FeedbackReportCreateRequest>().publicConsent)
        }

        for (consent in listOf(false, true)) {
            mockMvc.perform(
                post("/v1/reports")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """{"type":"BUG","category":"OPERATOR","content":"正文","title":"标题",
                            "public_consent":$consent,"client_info_consent":false}""",
                    ),
            )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.data.public_consent").value(consent))
            verify { reportService.create("u1", match { it.publicConsent == consent && !it.clientInfoConsent }) }
        }

        mockMvc.perform(
            post("/v1/reports").contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"BUG","category":"OPERATOR","content":"私下沟通"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.public_consent").value(false))
        verify { reportService.create("u1", match { !it.publicConsent && it.title == null }) }
    }

    @Test
    fun `actor_mode snake case binds for message and status success requests`() {
        every { reportService.appendMessage("u1", "rpt_1", any()) } returns response()
        every { reportService.updateStatus("u1", "rpt_1", any()) } returns response().copy(status = "RESOLVED")

        mockMvc.perform(
            post("/v1/reports/rpt_1/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"content":"补充","media_ids":[],"actor_mode":"REPORTER"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(200))

        mockMvc.perform(
            patch("/v1/reports/rpt_1/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"status":"RESOLVED","actor_mode":"ADMIN"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(200))

        verify {
            reportService.appendMessage(
                "u1",
                "rpt_1",
                match { it.content == "补充" && it.mediaIds.isEmpty() && it.actorMode == "REPORTER" },
            )
            reportService.updateStatus(
                "u1",
                "rpt_1",
                match { it.status == "RESOLVED" && it.actorMode == "ADMIN" },
            )
        }
    }

    @ParameterizedTest
    @CsvSource("CREATE,10,200", "CREATE,11,400", "REPORTER,10,200", "REPORTER,11,400", "ADMIN,10,200", "ADMIN,11,400")
    fun `attachment count accepts 10 and rejects 11 before calling the service`(actorMode: String, count: Int, expectedCode: Int) {
        every { reportService.create("u1", any()) } returns response()
        every { reportService.appendMessage("u1", "rpt_1", any()) } returns response()
        val mediaIds = (1..count).map { "med_$it" }
        val body = mutableMapOf<String, Any>("content" to "附件边界", "media_ids" to mediaIds)
        val creating = actorMode == "CREATE"
        if (creating) {
            body["type"] = "BUG"
            body["category"] = "OPERATOR"
        } else {
            body["actor_mode"] = actorMode
        }

        mockMvc.perform(
            post(if (creating) "/v1/reports" else "/v1/reports/rpt_1/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content(jacksonObjectMapper().writeValueAsString(body)),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(expectedCode))

        verify(exactly = if (creating && expectedCode == 200) 1 else 0) {
            reportService.create("u1", any())
        }
        verify(exactly = if (!creating && expectedCode == 200) 1 else 0) {
            reportService.appendMessage("u1", "rpt_1", any())
        }
        if (expectedCode == 200) {
            if (creating) {
                verify { reportService.create("u1", match { it.mediaIds == mediaIds }) }
            } else {
                verify { reportService.appendMessage("u1", "rpt_1", match { it.mediaIds == mediaIds && it.actorMode == actorMode }) }
            }
        }
    }

    @Test
    fun `complete_public_feedback binds false and defaults true for older clients`() {
        every { reportService.updateStatus("u1", "rpt_1", any()) } returns response().copy(status = "RESOLVED")
        for (sync in listOf(null, false, true)) {
            val field = sync?.let { ",\"complete_public_feedback\":$it" } ?: ""
            mockMvc.perform(
                patch("/v1/reports/rpt_1/status")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"status":"RESOLVED","actor_mode":"ADMIN"$field}"""),
            ).andExpect(status().isOk)
                .andExpect(jsonPath("$.status_code").value(200))
            verify { reportService.updateStatus("u1", "rpt_1", match { it.completePublicFeedback == (sync ?: true) }) }
        }
    }

    @Test
    fun `actor authorization errors remain ApiResult business status codes`() {
        every { reportService.appendMessage("u1", "rpt_1", any()) } throws
            ApiResultException(403, "当前用户不是工单提交人")
        every { reportService.updateStatus("u1", "rpt_1", any()) } throws
            ApiResultException(400, "请明确指定 actor_mode")

        mockMvc.perform(
            post("/v1/reports/rpt_1/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"content":"越权","actor_mode":"REPORTER"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(403))

        mockMvc.perform(
            patch("/v1/reports/rpt_1/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"status":"RESOLVED"}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(400))
    }

    @Test
    fun `feedback list serializes reporter boundary fields as snake case`() {
        val now = Instant.parse("2026-08-31T00:00:00Z")
        every { reportService.list(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            FeedbackReportListResponse(
                reports = listOf(
                    FeedbackReportListItem(
                        id = "rpt_1",
                        type = "BUG",
                        category = "OPERATOR",
                        area = "OPERATOR",
                        status = "OPEN",
                        content = "原始反馈",
                        hasAdminReply = false,
                        lastMessageSender = "REPORTER",
                        lastReporterMessageId = "rpm_123",
                        lastReporterMessageCreatedAt = now,
                        lastReporterMessageIndex = 4,
                        reporterUserId = "u1",
                        reporterName = "用户",
                        createdAt = now,
                        updatedAt = now,
                    ),
                ),
                total = 1,
                page = 1,
                pageSize = 20,
                mine = false,
                sortBy = "updatedAt",
                sortOrder = "desc",
            )

        mockMvc.perform(
            get("/v1/reports")
                .param("mine", "false")
                .param("sortBy", "updatedAt")
                .param("sortOrder", "desc"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.reports[0].last_reporter_message_id").value("rpm_123"))
            .andExpect(jsonPath("$.data.reports[0].last_reporter_message_created_at").value("2026-08-31T00:00:00Z"))
            .andExpect(jsonPath("$.data.reports[0].last_reporter_message_index").value(4))
    }

    @Test
    fun `feedback detail serializes application diagnostics as snake case`() {
        every { reportService.getById("u1", "rpt_1") } returns response().copy(
            clientInfo = null,
            diagnostics = FeedbackReportResponse.DiagnosticsResponse(
                productVersion = "0.9.0-beta.1",
                frontendCommit = "abc1234",
                buildTime = "2026-01-02T03:04:05Z",
            ),
        )

        mockMvc.perform(get("/v1/reports/rpt_1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.diagnostics.product_version").value("0.9.0-beta.1"))
            .andExpect(jsonPath("$.data.diagnostics.frontend_commit").value("abc1234"))
            .andExpect(jsonPath("$.data.diagnostics.build_time").value("2026-01-02T03:04:05Z"))
            // 版本诊断与 clientInfoConsent 无关：未附带 consent 时 diagnostics 仍然返回
            .andExpect(jsonPath("$.data.client_info").doesNotExist())
    }

    @Test
    fun `feedback detail without diagnostics keeps the field absent`() {
        every { reportService.getById("u1", "rpt_1") } returns response()

        mockMvc.perform(get("/v1/reports/rpt_1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.diagnostics").doesNotExist())
    }

    private fun response(): FeedbackReportResponse {
        val now = Instant.parse("2026-08-31T00:00:00Z")
        return FeedbackReportResponse(
            id = "rpt_1",
            type = "BUG",
            category = "OPERATOR",
            area = "OPERATOR",
            status = "OPEN",
            content = "原始反馈",
            messages = emptyList(),
            hasAdminReply = false,
            quota = FeedbackReportResponse.QuotaInfo(0, 3, true),
            viewerIsReporter = true,
            viewerCanManage = false,
            clientInfo = null,
            reporter = FeedbackReportResponse.UserInfo("u1", "用户"),
            handler = null,
            createdAt = now,
            updatedAt = now,
        )
    }
}
