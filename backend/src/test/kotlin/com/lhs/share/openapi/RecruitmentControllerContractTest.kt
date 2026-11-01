package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.handler.RecruitmentExceptionHandler
import com.lhs.share.hub.controller.recruitment.RecruitmentController
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAgentCount
import com.lhs.share.hub.controller.recruitment.response.RecruitmentArchiveResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCommandResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentEventPage
import com.lhs.share.hub.controller.recruitment.response.RecruitmentSummary
import com.lhs.share.hub.service.recruitment.RecruitmentApiException
import com.lhs.share.hub.service.recruitment.RecruitmentCatalog
import com.lhs.share.hub.service.recruitment.RecruitmentService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertFalse
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

class RecruitmentControllerContractTest {
    private val service = mockk<RecruitmentService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private lateinit var mvc: MockMvc

    @BeforeEach fun setup() {
        mvc =
            MockMvcBuilders.standaloneSetup(
                RecruitmentController(
                    service,
                    RecruitmentCatalog(mapper, mockk(relaxed = true), mockk(relaxed = true)),
                    helper,
                    mapper,
                ),
            )
                .setControllerAdvice(RecruitmentExceptionHandler())
                .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test fun `catalog remains public while private recruitment endpoints use the beta policy`() {
        mvc.perform(get("/v1/recruitment/catalog").param("game", "如鸢")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.pools").isEmpty)
        verify {
            helper wasNot io.mockk.Called
            service wasNot io.mockk.Called
        }
        assertFalse(BetaAccessPolicy.requiresBeta("GET", "/v1/recruitment/catalog"))
        listOf("archive", "events", "commands", "import/commit").forEach {
            org.junit.jupiter.api.Assertions.assertTrue(BetaAccessPolicy.requiresBeta("POST", "/v1/recruitment/$it"))
        }
    }

    @Test fun `private requests return HTTP auth conflict validation and not found error envelopes`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("/v1/recruitment/archive").param("account_id", "a")).andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))
        every { helper.requireUserId() } returns "u"
        verify(exactly = 0) { service.archive(any(), any()) }
        listOf(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY).forEach { code ->
            every { service.archive("u", "a") } throws RecruitmentApiException(code, "boundary", "test")
            mvc.perform(get("/v1/recruitment/archive").param("account_id", "a")).andExpect(status().`is`(code.value()))
                .andExpect(jsonPath("$.error.code").value("boundary"))
        }
        mvc.perform(get("/v1/recruitment/archive")).andExpect(status().isUnprocessableEntity)
        mvc.perform(
            post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON).content("{}"),
        ).andExpect(status().isUnprocessableEntity)
    }

    @Test fun `archive exposes complete stable slot counts including zero in snake case without records`() {
        every { helper.requireUserId() } returns "u"
        val summary = RecruitmentSummary(0, 0, 0, 0, 0, 0, 0, 0, false)
        every { service.archive("u", "a") } returns RecruitmentArchiveResponse(
            "a", "如鸢", 0, 0, null, emptyList(), emptyList(),
            summary.copy(
                averageGoldPulls = 23.45,
                permanentKnownTotalPulls = 123,
                mostObtainedGoldAgents = listOf(RecruitmentAgentCount("a", "甲", 3), RecruitmentAgentCount("b", "乙", 3)),
                mostNonUpGoldAgents = emptyList(),
                mostPermanentGoldAgents = listOf(RecruitmentAgentCount("a", "甲", 2), RecruitmentAgentCount("b", "乙", 2)),
                upGoldCount = 2,
                knownUpGoldCount = 3,
                unknownUpGoldCount = 0,
                totalUpRate = 66.7,
                guaranteedGoldCount = 1,
                pityHistoryAssumption = "first_gold_small_pity",
                pityStatus = "inferred",
            ),
            false,
            mapOf(
                "p" to summary.copy(
                    upAgentCounts = mapOf("catalog_p:up:A" to 2L, "catalog_p:up:B" to 0L),
                    averageGoldPulls = 18.2,
                    smallPityWinRate = 0.0,
                    upGoldCount = 0,
                    knownUpGoldCount = 1,
                    unknownUpGoldCount = 0,
                    totalUpRate = 0.0,
                    guaranteedGoldCount = 0,
                    pityHistoryAssumption = "first_gold_small_pity",
                    pityStatus = "inferred",
                ),
                "empty" to summary,
                "unknown" to summary.copy(
                    upGoldCount = 1,
                    knownUpGoldCount = 1,
                    unknownUpGoldCount = 1,
                    totalUpRate = 100.0,
                    pityHistoryAssumption = "first_gold_small_pity",
                    pityStatus = "insufficient_history",
                ),
                "no-samples" to summary.copy(
                    upGoldCount = 0,
                    knownUpGoldCount = 0,
                    unknownUpGoldCount = 0,
                    guaranteedGoldCount = 0,
                    pityHistoryAssumption = "first_gold_small_pity",
                    pityStatus = "no_samples",
                ),
                "permanent" to summary.copy(pityStatus = "not_applicable"),
            ),
        )
        mvc.perform(get("/v1/recruitment/archive").param("account_id", "a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.summary.average_gold_pulls").value(23.45))
            .andExpect(jsonPath("$.data.summary.up_gold_count").value(2))
            .andExpect(jsonPath("$.data.summary.known_up_gold_count").value(3))
            .andExpect(jsonPath("$.data.summary.unknown_up_gold_count").value(0))
            .andExpect(jsonPath("$.data.summary.total_up_rate").value(66.7))
            .andExpect(jsonPath("$.data.summary.guaranteed_gold_count").value(1))
            .andExpect(jsonPath("$.data.summary.pity_history_assumption").value("first_gold_small_pity"))
            .andExpect(jsonPath("$.data.summary.pity_status").value("inferred"))
            .andExpect(jsonPath("$.data.summary.upGoldCount").doesNotExist())
            .andExpect(jsonPath("$.data.summary.permanent_known_total_pulls").value(123))
            .andExpect(jsonPath("$.data.summary.most_obtained_gold_agents.length()").value(2))
            .andExpect(jsonPath("$.data.summary.most_obtained_gold_agents[0].agent_id").value("a"))
            .andExpect(jsonPath("$.data.summary.most_obtained_gold_agents[0].name").value("甲"))
            .andExpect(jsonPath("$.data.summary.most_obtained_gold_agents[0].count").value(3))
            .andExpect(jsonPath("$.data.summary.most_non_up_gold_agents.length()").value(0))
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents.length()").value(2))
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents[0].agent_id").value("a"))
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents[0].name").value("甲"))
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents[0].count").value(2))
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents[1].agent_id").value("b"))
            .andExpect(jsonPath("$.data.pool_summaries.p.up_agent_counts['catalog_p:up:A']").value(2))
            .andExpect(jsonPath("$.data.pool_summaries.p.up_agent_counts['catalog_p:up:B']").value(0))
            .andExpect(jsonPath("$.data.pool_summaries.p.average_gold_pulls").value(18.2))
            .andExpect(jsonPath("$.data.pool_summaries.p.small_pity_win_rate").value(0.0))
            .andExpect(jsonPath("$.data.pool_summaries.p.total_up_rate").value(0.0))
            .andExpect(jsonPath("$.data.pool_summaries.p.guaranteed_gold_count").value(0))
            .andExpect(jsonPath("$.data.pool_summaries.unknown.total_up_rate").value(100.0))
            .andExpect(jsonPath("$.data.pool_summaries.unknown.unknown_up_gold_count").value(1))
            .andExpect(jsonPath("$.data.pool_summaries.unknown.guaranteed_gold_count").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.pool_summaries.unknown.pity_status").value("insufficient_history"))
            .andExpect(jsonPath("$.data.pool_summaries['no-samples'].total_up_rate").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.pool_summaries['no-samples'].guaranteed_gold_count").value(0))
            .andExpect(jsonPath("$.data.pool_summaries['no-samples'].pity_status").value("no_samples"))
            .andExpect(jsonPath("$.data.pool_summaries.permanent.pity_status").value("not_applicable"))
            .andExpect(jsonPath("$.data.pool_summaries.permanent.up_gold_count").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.pool_summaries.empty.average_gold_pulls").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.pool_summaries.empty.small_pity_win_rate").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.pool_summaries.empty.most_permanent_gold_agents").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.records").doesNotExist())
        verify(exactly = 1) { service.archive("u", "a") }
    }

    @Test fun `permanent gold leaders distinguish unavailable from an empty computed list`() {
        every { helper.requireUserId() } returns "u"
        val summary = RecruitmentSummary(0, 0, 0, 0, 0, 0, 0, 0, false)
        val archive = RecruitmentArchiveResponse("a", "如鸢", 0, 0, null, emptyList(), emptyList(), summary, false)
        every { service.archive("u", "a") } returns archive
        mvc.perform(get("/v1/recruitment/archive").param("account_id", "a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents").value(org.hamcrest.Matchers.nullValue()))
        every { service.archive("u", "a") } returns archive.copy(summary = summary.copy(mostPermanentGoldAgents = emptyList()))
        mvc.perform(get("/v1/recruitment/archive").param("account_id", "a"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents").isArray)
            .andExpect(jsonPath("$.data.summary.most_permanent_gold_agents.length()").value(0))
    }

    @Test fun `event sort direction is forwarded and defaults to newest first`() {
        every { helper.requireUserId() } returns "u"
        every { service.page("u", "a", null, null, 50, null, null, "desc") } returns RecruitmentEventPage(emptyList(), null, 0)
        every { service.page("u", "a", null, null, 2, null, null, "asc") } returns RecruitmentEventPage(emptyList(), null, 0)
        mvc.perform(get("/v1/recruitment/events").param("account_id", "a"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.archive_revision").value(0))
        mvc.perform(get("/v1/recruitment/events").param("account_id", "a").param("limit", "2").param("order", "asc"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.items").isEmpty)
        verify(exactly = 1) { service.page("u", "a", null, null, 50, null, null, "desc") }
        verify(exactly = 1) { service.page("u", "a", null, null, 2, null, null, "asc") }
    }

    @Test fun `commands use snake case request and response contract`() {
        every { helper.requireUserId() } returns "u"
        every {
            service.command(
                "u",
                match {
                    it.accountId == "a" && it.expectedRevision == 1L && it.requestId == "r" &&
                        it.operation == "event_delete"
                },
            )
        } returns
            RecruitmentCommandResponse(2, listOf("B"))
        mvc.perform(
            post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"account_id":"a","expected_revision":1,"request_id":"r","operation":"event_delete","data":{"event_id":"B"}}""",
                ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.archive_revision").value(2))
            .andExpect(jsonPath("$.data.event_ids[0]").value("B"))
    }

    @Test fun `wishlist-only save forwards canonical choices and authenticated account scope`() {
        every { helper.requireUserId() } returns "u"
        every {
            service.command(
                "u",
                match {
                    it.accountId == "a" && it.operation == "pool_records_save" &&
                        it.data.path("wish_agent_ids").map { id -> id.asText() } == listOf("char_001_yangxiu", "char_002_jiaxu")
                },
            )
        } returns RecruitmentCommandResponse(2)
        mvc.perform(
            post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON).content(
                """{"account_id":"a","expected_revision":1,"request_id":"wish","operation":"pool_records_save","data":{"pool_id":"p","remaining_pulls":null,"entries":[],"wish_agent_ids":["char_001_yangxiu","char_002_jiaxu"]}}""",
            ),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.archive_revision").value(2))
    }

    @Test fun `pool dialog forwards per result spans remaining pulls and stable record IDs`() {
        every { helper.requireUserId() } returns "u"
        every {
            service.command(
                "u",
                match {
                    it.accountId == "a" && it.requestId == "dialog" && it.expectedRevision == 1L &&
                        it.operation == "pool_records_save" && it.data.path("pool_id").asText() == "p" &&
                        it.data.path("remaining_pulls").asInt() == 19 && it.data.path("entries")[0].path("pull_span").asInt() == 17 &&
                        it.data.path("ordered_event_ids")[0].asText() == "E"
                },
            )
        } returns RecruitmentCommandResponse(2, listOf("E"), poolId = "p")
        mvc.perform(
            post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"account_id":"a","expected_revision":1,"request_id":"dialog","operation":"pool_records_save","data":{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"E","agent_id":"A","pull_span":17}],"deleted_event_ids":[],"ordered_event_ids":["E"]}}""",
                ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.archive_revision").value(2))
            .andExpect(jsonPath("$.data.pool_id").value("p")).andExpect(jsonPath("$.data.event_ids[0]").value("E"))
    }

    @Test fun `pool dialog forwards explicitly null optional remaining pulls unchanged`() {
        every { helper.requireUserId() } returns "u"
        every {
            service.command(
                "u",
                match {
                    it.accountId == "a" && it.operation == "pool_records_save" &&
                        it.data.has("remaining_pulls") && it.data.path("remaining_pulls").isNull &&
                        it.data.path("entries")[0].path("event_id").asText() == "E"
                },
            )
        } returns RecruitmentCommandResponse(2, listOf("E"), poolId = "p")
        mvc.perform(
            post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"account_id":"a","expected_revision":1,"request_id":"optional-pity","operation":"pool_records_save","data":{"pool_id":"p","remaining_pulls":null,"entries":[{"event_id":"E","agent_id":"A","pull_span":null}]}}""",
                ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.event_ids[0]").value("E"))
    }

    @Test fun `command envelope rejects null decimal missing revision and unknown root fields`() {
        every { helper.requireUserId() } returns "u"
        listOf("null", "0.5", "\"0\"").forEach { revision ->
            mvc.perform(
                post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """
                        {"account_id":"a","expected_revision":$revision,"request_id":"r",
                        "operation":"baseline_set","data":{"baseline":0}}
                        """.trimIndent(),
                    ),
            )
                .andExpect(status().isUnprocessableEntity)
        }
        listOf(
            "null",
            "[]",
            "\"text\"",
            "1",
            """{"account_id":"a","request_id":"r","operation":"baseline_set","data":{"baseline":0}}""",
            """{"account_id":"a","expected_revision":0,"request_id":"r","operation":"baseline_set","data":{"baseline":0},"extra":true}""",
        ).forEach { body ->
            mvc.perform(
                post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON).content(body),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test fun `entry dates require ISO strings or null and reject JavaTime array coercion`() {
        every { helper.requireUserId() } returns "u"
        listOf("[2026,10,1]", "1", "{}", "true", "\"2026-02-30\"", "\"2026-10-01T00:00:00Z\"").forEach { date ->
            mvc.perform(
                post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON).content(
                    """{"account_id":"a","expected_revision":0,"request_id":"r","operation":"event_create","data":{"pool_id":"p","mode":"historical","entries":[{"agent_id":"A","pull_span":17,"acquired_date":$date}]}}""",
                ),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
        every { service.command("u", any()) } returns RecruitmentCommandResponse(1, listOf("E"))
        listOf("null", "\"2026-10-01\"").forEach { date ->
            mvc.perform(
                post("/v1/recruitment/commands").contentType(MediaType.APPLICATION_JSON).content(
                    """{"account_id":"a","expected_revision":0,"request_id":"r","operation":"event_update","data":{"event_id":"E","entry":{"agent_id":"A","pull_span":17,"acquired_date":$date}}}""",
                ),
            ).andExpect(status().isOk)
        }
        verify(exactly = 2) { service.command("u", any()) }
    }
}
