package com.lhs.share.openapi

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorController
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.repository.entity.OperatorCombatDisplayMode
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.OperatorStarStone
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.operator.OperatorService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class OperatorControllerContractTest {
    private val service = mockk<OperatorService>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        mockMvc = MockMvcBuilders
            .standaloneSetup(OperatorController(service, catalogService, helper))
            .setControllerAdvice(OperatorExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
        every { helper.requireUserId() } returns "u1"
    }

    @Test
    fun `DELETE orphan current takes owner from authentication and requires account`() {
        every { service.removeOrphanCurrent("u1", "acc1", "char_130_zhoutai") } returns Unit
        mockMvc.perform(delete("/v1/operator/current/char_130_zhoutai").param("account_id", "acc1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").value(true))
        verify(exactly = 1) { service.removeOrphanCurrent("u1", "acc1", "char_130_zhoutai") }
        mockMvc.perform(delete("/v1/operator/current/char_130_zhoutai"))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET current exposes foundation fields in snake case`() {
        every { service.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse(
                userId = "u1",
                accountId = "acc1",
                game = "代号鸢",
                fullBaselineAt = null,
                entries = mapOf("op1" to entry()),
                updatedAt = Instant.parse("2026-08-21T12:00:00Z"),
            ),
        )

        mockMvc.perform(
            get("/v1/operator/current")
                .param("account_id", "acc1")
                .param("game", "代号鸢"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data[0].entries.op1.level_breakthrough_stage").value(9))
            .andExpect(jsonPath("$.data[0].entries.op1.star_level").value(27))
            .andExpect(jsonPath("$.data[0].entries.op1.star_stones[0].type").value("main1"))
            .andExpect(jsonPath("$.data[0].entries.op1.disc_loadouts[0].name").value("命盘一"))
            .andExpect(jsonPath("$.data[0].entries.op1.combat_stats.oddities.special.current").value(15))
            .andExpect(jsonPath("$.data[0].entries.op1.combat_stats.display_mode.attack").value("auto"))
            .andExpect(jsonPath("$.data[0].entries.op1.revision").value(8))
            .andExpect(jsonPath("$.data[0].entries.op1.updated_at").value("2026-08-21T11:59:00Z"))
    }

    @Test
    fun `PATCH current forwards field presence and returns merged entry`() {
        every { service.patchCurrent("u1", "acc1", "代号鸢", "op1", any()) } returns entry()

        mockMvc.perform(
            patch("/v1/operator/current/op1")
                .param("account_id", "acc1")
                .param("game", "代号鸢")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {
                      "level_breakthrough_stage": null,
                      "disc_loadouts": [],
                      "star_stones": [
                        {"type":"main1","name":"攻击力","level":60}
                      ],
                      "combat_stats": {"manual_attack": null},
                      "expected_revision": 7,
                      "reason": "manual_correction"
                    }
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.revision").value(8))
            .andExpect(jsonPath("$.data.star_level").value(27))

        verify {
            service.patchCurrent(
                "u1",
                "acc1",
                "代号鸢",
                "op1",
                match {
                    it.has("level_breakthrough_stage") && it.path("level_breakthrough_stage").isNull && it.has("disc_loadouts") &&
                        it.has("star_stones") &&
                        it["combat_stats"].has("manual_attack")
                },
            )
        }
    }

    @Test
    fun `PATCH decimal is forwarded as a number and read responses retain integer tokens`() {
        val decimal = entry().copy(
            combatStats = entry().combatStats!!.copy(
                oddities = mapOf(
                    "attack" to OperatorOddityValue(10.0),
                    "hp" to OperatorOddityValue(20.0),
                    "special" to OperatorOddityValue(0.5),
                ),
            ),
        )
        every { service.patchCurrent("u1", "acc1", "代号鸢", "op1", any()) } returns decimal
        val response = mockMvc.perform(
            patch("/v1/operator/current/op1")
                .param("account_id", "acc1").param("game", "代号鸢").contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"combat_stats":{"oddities":{"special":{"current":0.5}}},
                     "expected_revision":7,"reason":"manual_correction"}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.combat_stats.oddities.special.current").value(0.5))
            .andReturn().response.contentAsString
        val values = jacksonObjectMapper().readTree(response).path("data").path("combat_stats").path("oddities")
        assertTrue(values.path("attack").path("current").isIntegralNumber)
        assertTrue(values.path("hp").path("current").isIntegralNumber)
        assertEquals(0.5, values.path("special").path("current").doubleValue())
        verify {
            service.patchCurrent(
                "u1",
                "acc1",
                "代号鸢",
                "op1",
                match {
                    it.path("combat_stats").path("oddities").path("special").path("current").doubleValue() == 0.5
                },
            )
        }
    }

    @Test
    fun `PATCH revision conflict uses stable 409 error contract`() {
        every { service.patchCurrent(any(), any(), any(), any(), any()) } throws
            OperatorApiException(
                HttpStatus.CONFLICT,
                "operator_revision_conflict",
                "Operator revision has changed",
                operatorId = "op1",
                fieldPath = "expected_revision",
            )

        mockMvc.perform(
            patch("/v1/operator/current/op1")
                .param("account_id", "acc1")
                .param("game", "代号鸢")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"level":90,"expected_revision":7,"reason":"manual_correction"}"""),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("operator_revision_conflict"))
            .andExpect(jsonPath("$.error.operator_id").value("op1"))
            .andExpect(jsonPath("$.error.field_path").value("expected_revision"))
    }

    private fun entry() = OperatorCurrentEntryDto(
        elite = 16,
        starLevel = 27,
        level = 90,
        levelBreakthroughStage = 9,
        discs = listOf(OperatorDisc("盘A")),
        starStones = listOf(OperatorStarStone("星石", "main1", 60)),
        discLoadouts = listOf(OperatorDiscLoadout("one", "命盘一", listOf(OperatorDisc("盘A")))),
        combatStats = OperatorCombatStats(
            observedAttack = 8186,
            observedHp = 28704,
            source = "scan",
            observedStatus = "valid",
            displayMode = OperatorCombatDisplayMode("auto", "manual"),
            combatInputSignature = "scan-input-v1",
            oddities = mapOf("special" to OperatorOddityValue(15.0)),
        ),
        revision = 8,
        listedBaselineAt = null,
        updatedAt = Instant.parse("2026-08-21T11:59:00Z"),
    )
}
