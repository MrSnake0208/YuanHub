package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorGrowthTargetRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import com.lhs.share.hub.repository.entity.OperatorAnnotation
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorGrowthTarget
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class OperatorV3ExportServiceTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

    @ParameterizedTest
    @ValueSource(strings = ["active", "graduated", "skip", "discarded"])
    fun `v3 full export contains objective and complete subjective backup and validates schema`(state: String) {
        val accounts = mockk<SubAccountRepository>()
        val currents = mockk<OperatorCurrentRepository>()
        val annotations = mockk<OperatorAnnotationRepository>()
        val targets = mockk<OperatorGrowthTargetRepository>()
        val favorites = mockk<InventoryAgentFavoriteRepository>()
        val catalog = mockk<OperatorCatalogService>()
        val account = SubAccount(userId = "u1", accountId = "a1", name = "账号", game = "如鸢")
        every { accounts.findByUserIdAndAccountId("u1", "a1") } returns account
        val saved = listOf(
            OperatorCurrent(
                userId = "u1",
                accountId = "a1",
                game = "如鸢",
                entries = mapOf(
                    "op1" to OperatorEntry(
                        elite = 17,
                        starLevel = 31,
                        level = 100,
                        revision = 4,
                        discLoadouts = listOf(
                            com.lhs.share.hub.repository.entity.OperatorDiscLoadout(
                                "disc_1",
                                "输出",
                                listOf(com.lhs.share.hub.repository.entity.OperatorDisc("盘A")),
                                "reroll",
                                listOf(com.lhs.share.hub.repository.entity.OperatorDisc("盘B")),
                            ),
                            com.lhs.share.hub.repository.entity.OperatorDiscLoadout("disc_2", "生存", status = "perfect"),
                        ),
                        combatStats = OperatorCombatStats(
                            oddities = mapOf(
                                "attack" to OperatorOddityValue(10.0),
                                "hp" to OperatorOddityValue(20.0),
                                "special" to OperatorOddityValue(3.2),
                            ),
                        ),
                    ),
                ),
            ),
        )
        every { currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "a1") } returns saved
        every { annotations.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("u1", "a1") } returns listOf(
            OperatorAnnotation(userId = "u1", accountId = "a1", operatorId = "op1", growthState = state, note = "继续收集"),
        )
        every { targets.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("u1", "a1") } returns listOf(
            OperatorGrowthTarget(userId = "u1", accountId = "a1", operatorId = "op1", targetStarLevel = 31),
        )
        every { favorites.findAllByUserIdAndAccountIdOrderByAgentIdAsc("u1", "a1") } returns listOf(
            InventoryAgentFavorite(userId = "u1", accountId = "a1", agentId = "op1"),
        )
        every { catalog.currentCatalogVersion() } returns "catalog-1"
        every { catalog.getOperator("op1") } returns com.lhs.share.hub.repository.entity.OperatorCatalogEntity(
            operatorId = "op1", name = "密探", rarity = 5, prof = listOf("风"), subProf = emptyList(),
            games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "catalog-1",
        )
        val service = OperatorV3ExportService(mapper, accounts, currents, annotations, targets, favorites, catalog)

        val exported = service.export("u1", "a1", null)
        for (version in listOf(3, 4, 5)) {
            val backup = service.export("u1", "a1", null, version)
            OperatorV3SchemaValidator(mapper).validate(backup)
            val loadouts = backup.path("records").get(0).path("entries").get(0).path("disc_loadouts")
            assertEquals("reroll", loadouts[0].path("status").asText())
            assertEquals("盘A", loadouts[0].path("discs")[0].path("ot_name").asText())
            assertEquals("盘B", loadouts[0].path("target_discs")[0].path("ot_name").asText())
            assertEquals("perfect", loadouts[1].path("status").asText())
            assertEquals(0, loadouts[1].path("target_discs").size())
        }
        OperatorV3SchemaValidator(mapper).validate(exported)

        assertEquals(3, exported.path("version").intValue())
        assertEquals(2, exported.path("records").size())
        val snapshot = exported.path("records").first { it.path("record_type").asText() == "operator_snapshot" }
        val values = snapshot.path("entries").single().path("combat_stats").path("oddities")
        assertEquals(3.2, values.path("special").path("current").doubleValue())
        assertTrue(values.path("attack").path("current").isIntegralNumber)
        assertTrue(values.path("hp").path("current").isIntegralNumber)
        val subjective = exported.path("records").first { it.path("record_type").asText() == "operator_annotation_snapshot" }
        val entry = subjective.path("entries").single()
        assertEquals(state, entry.path("growth_state").asText())
        assertTrue(entry.path("favorite").booleanValue())
        assertEquals("继续收集", entry.path("note").asText())
        assertEquals(31, entry.path("targets").path("star_level").intValue())
        val v5 = service.export("u1", "a1", null, 5)
        OperatorV3SchemaValidator(mapper).validate(v5)
        assertEquals(5, v5.path("version").asInt())
        val v5Entry = v5.path("records").get(0).path("entries").get(0)
        assertEquals(9, v5Entry.path("level_breakthrough_stage").asInt())
        assertTrue(v5Entry.has("huaji"))
        assertTrue(!exported.path("records").get(0).path("entries").get(0).has("level_breakthrough_stage"))
        for (stage in listOf(8, 9, null)) {
            val boundary = saved.single().entries.getValue("op1").copy(
                level = 90,
                elite = 15,
                levelBreakthroughStage = stage,
                combatStats = saved.single().entries.getValue("op1").combatStats!!.copy(
                    observedAttack = 1234,
                    observedInputs = com.lhs.share.hub.repository.entity.OperatorObservedInputs(level = 90, levelBreakthroughStage = null),
                    observedStatus = "unverified",
                ),
            )
            every { currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "a1") } returns
                listOf(saved.single().copy(entries = mapOf("op1" to boundary)))
            val backup = service.export("u1", "a1", null, 5)
            OperatorV3SchemaValidator(mapper).validate(backup)
            val data = backup.path("records").get(0).path("entries").get(0)
            if (stage == null) {
                assertTrue(data.path("level_breakthrough_stage").isNull)
            } else {
                assertEquals(stage, data.path("level_breakthrough_stage").asInt())
            }
            assertTrue(data.path("combat_stats").path("observed_inputs").path("level_breakthrough_stage").isNull)
            val legacy = service.export("u1", "a1", null, 4)
            OperatorV3SchemaValidator(mapper).validate(legacy)
            assertTrue(
                legacy.path(
                    "records",
                ).get(0).path("entries").get(0).path("warnings").toString().contains("level_breakthrough_information_loss"),
            )
        }
        every { catalog.getOperator("op1") } returns null
        val orphanBackup = service.export("u1", "a1", null, 4)
        OperatorV3SchemaValidator(mapper).validate(orphanBackup)
        val orphan = orphanBackup.path("records").get(0).path("entries").get(0)
        assertTrue(orphan.path("huaji").path("stage").isNull)
        assertTrue(orphan.path("huaji").path("awakened").isNull)
        assertEquals(31, orphan.path("huaji_legacy").path("raw").asInt())
        assertTrue(!orphan.has("star_level"))
    }
}
