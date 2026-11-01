package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.RecruitmentExceptionHandler
import com.lhs.share.hub.controller.recruitment.RecruitmentExchangeController
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeAccount
import com.lhs.share.hub.controller.recruitment.request.RecruitmentExchangeDocument
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCommandResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportItem
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportPreviewResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentImportStats
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.service.recruitment.RecruitmentApiException
import com.lhs.share.hub.service.recruitment.RecruitmentExchangeService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

class RecruitmentExchangeControllerContractTest {
    private val service = mockk<RecruitmentExchangeService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private lateinit var mvc: MockMvc

    @BeforeEach fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(RecruitmentExchangeController(service, helper, mapper))
            .setControllerAdvice(RecruitmentExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test fun `export uses authentication account scope and snapshot contract without internal identifiers`() {
        every { helper.requireUserId() } returns "u"
        every { service.export("u", "a") } returns RecruitmentExchangeDocument(
            "yuanhub.recruitment.v1", Instant.parse("2026-10-01T00:00:00Z"), RecruitmentExchangeAccount("a"), "如鸢",
            7, 100, null, emptyList(), emptyList(), emptyList(), emptyList(),
        )
        mvc.perform(get("/v1/recruitment/export").param("account_id", "a")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.schema").value("yuanhub.recruitment.v1"))
            .andExpect(jsonPath("$.data.archive_revision").value(7))
            .andExpect(jsonPath("$.data.source_account.account_id").value("a"))
            .andExpect(jsonPath("$.data.user_id").doesNotExist()).andExpect(jsonPath("$.data.id").doesNotExist())
    }

    @Test fun `preview and commit expose bound choices token hash revision totals and durable result`() {
        every { helper.requireUserId() } returns "u"
        every { service.preview("u", match { it.accountId == "a" && it.options.stateStrategy == "keep_current" }) } returns
            RecruitmentImportPreviewResponse(
                "token", "hash", 7,
                Instant.parse(
                    "2026-10-01T00:10:00Z",
                ),
                listOf(RecruitmentImportItem("event", "e", "count_overlap", "风险")),
                RecruitmentImportStats(0, 0, 0, 1), listOf("确认总数"), 100, 80, 100, true,
            )
        mvc.perform(
            post("/v1/recruitment/import/preview").contentType(MediaType.APPLICATION_JSON).content("""{"account_id":"a","document":{}}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.preview_token").value("token"))
            .andExpect(jsonPath("$.data.document_hash").value("hash")).andExpect(jsonPath("$.data.candidate_known_total").value(100))
            .andExpect(jsonPath("$.data.items[0].status").value("count_overlap"))
        every { service.commit("u", match { it.previewToken == "token" && it.expectedRevision == 7L && it.requestId == "r" }) } returns
            RecruitmentCommandResponse(8, listOf("e"))
        mvc.perform(
            post("/v1/recruitment/import/commit").contentType(MediaType.APPLICATION_JSON).content(
                """{"account_id":"a","document":{},"preview_token":"token","document_hash":"hash","expected_revision":7,"request_id":"r"}""",
            ),
        ).andExpect(
            status().isOk,
        ).andExpect(jsonPath("$.data.archive_revision").value(8)).andExpect(jsonPath("$.data.event_ids[0]").value("e"))
    }

    @Test fun `export retains stable managed UP identity and import policy failure has no successful envelope`() {
        every { helper.requireUserId() } returns "u"
        every { service.export("u", "a") } returns RecruitmentExchangeDocument(
            "yuanhub.recruitment.v1", Instant.parse("2026-10-01T00:00:00Z"), RecruitmentExchangeAccount("a"), "如鸢", 7, 0, "p",
            listOf(
                RecruitmentPool(
                    "p",
                    RecruitmentPoolSnapshot(
                        "新池",
                        "如鸢",
                        "managed",
                        upAgents = listOf(RecruitmentUpAgent("managed:up:1", "占位1")),
                    ),
                    0,
                ),
            ),
            emptyList(), emptyList(), emptyList(),
        )
        mvc.perform(get("/v1/recruitment/export").param("account_id", "a")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.pools[0].snapshot.up_agents[0].id").value("managed:up:1"))
            .andExpect(jsonPath("$.data.pools[0].snapshot.up_agents[0].operator_id").isEmpty)
            .andExpect(jsonPath("$.data.pools[0].snapshot.up_agents[0].active").value(true))
        every { service.preview("u", any()) } throws RecruitmentApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "recruitment_invalid",
            "不能通过备份新增用户自定义卡池",
        )
        mvc.perform(
            post("/v1/recruitment/import/preview").contentType(MediaType.APPLICATION_JSON)
                .content("""{"account_id":"a","document":{}}"""),
        ).andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("recruitment_invalid"))
            .andExpect(jsonPath("$.data").doesNotExist())
        verify(exactly = 0) { service.commit(any(), any()) }
    }

    @Test fun `exchange errors retain actual HTTP statuses and malformed envelopes never reach service`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("/v1/recruitment/export").param("account_id", "a")).andExpect(status().isUnauthorized)
        every { helper.requireUserId() } returns "u"
        every { service.export("u", "a") } throws RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_preview_expired", "重新预览")
        mvc.perform(get("/v1/recruitment/export").param("account_id", "a")).andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("recruitment_preview_expired"))
        listOf(
            "{}",
            "[]",
            "null",
            """{"account_id":"a","document":{},"extra":1}""",
            """{"account_id":"a","document":{},"options":{"confirm_count_change":"true"}}""",
        ).forEach {
            mvc.perform(
                post("/v1/recruitment/import/preview").contentType(MediaType.APPLICATION_JSON).content(it),
            ).andExpect(status().isUnprocessableEntity)
        }
        listOf("null", "1.5", "\"7\"").forEach {
            mvc.perform(
                post("/v1/recruitment/import/commit").contentType(MediaType.APPLICATION_JSON).content(
                    """{"account_id":"a","document":{},"preview_token":"t","document_hash":"h","expected_revision":$it,"request_id":"r"}""",
                ),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 0) {
            service.preview(any(), any())
            service.commit(any(), any())
        }
    }
}
