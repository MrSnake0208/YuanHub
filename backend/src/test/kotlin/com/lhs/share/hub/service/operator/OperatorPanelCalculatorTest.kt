package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.entity.PanelAttributes
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class OperatorPanelCalculatorTest {
    private val bundle = panelRules().also(PanelRuleValidation::validate)

    @Test fun `cumulative values are added once and final percentages are floored`() {
        assertEquals(OperatorPanelValues(254, 13), calculate(panelInput()))
        assertEquals(OperatorPanelValues(278, 40), calculate(panelInput().copy(star = 25, awakened = true)))
        assertEquals(OperatorPanelValues(285, 16), calculate(panelInput().copy(oddityHp = 30, oddityAttack = 3)))
        assertEquals(OperatorPanelValues(285, 13), calculate(panelInput().copy(potential = 6)))
    }

    @Test fun `integer level boundaries require explicit breakthrough state`() {
        invalid("breakthrough_stage", "missing") { calculate(panelInput().copy(level = 10)) }
        assertEquals(OperatorPanelValues(148, 12), calculate(panelInput().copy(level = 10, breakthroughStage = 0)))
        assertEquals(OperatorPanelValues(253, 13), calculate(panelInput().copy(level = 10, breakthroughStage = 1)))
        invalid("breakthrough_stage", "invalid") { calculate(panelInput().copy(level = 100, breakthroughStage = 0)) }
        invalid("level", "invalid") { calculate(panelInput().copy(level = 101)) }
        invalid("potential", "invalid") { calculate(panelInput().copy(potential = 18)) }
        invalid("oddity_hp", "invalid") { calculate(panelInput().copy(oddityHp = 2601)) }
    }

    @Test fun `three star stops at 19 while SP has sparse stages and independent awakening`() {
        val normal = bundle.operators.single()
        val low = normal.copy(rarity = 3, maxStar = 19, star = normal.star.filterKeys { it <= 19 }, awake = null)
        val lowBundle = bundle.copy(operators = listOf(low)).also(PanelRuleValidation::validate)
        OperatorPanelCalculator.calculate(lowBundle, "operator.test", panelInput().copy(star = 19, awakened = null), emptyList())
        invalid("star", "invalid") {
            OperatorPanelCalculator.calculate(lowBundle, "operator.test", panelInput().copy(star = 20), emptyList())
        }
        invalid("awakened", "unsupported") {
            OperatorPanelCalculator.calculate(lowBundle, "operator.test", panelInput().copy(awakened = true), emptyList())
        }
        val sp = bundle.copy(operators = listOf(normal.copy(star = normal.star.filterKeys { (it - 1) % 6 == 0 })))
        PanelRuleValidation.validate(sp)
        invalid("star", "invalid") { OperatorPanelCalculator.calculate(sp, "operator.test", panelInput().copy(star = 2), emptyList()) }
        assertEquals(
            OperatorPanelValues(278, 40),
            OperatorPanelCalculator.calculate(sp, "operator.test", panelInput().copy(star = 25, awakened = true), emptyList()),
        )
    }

    @Test fun `awakening is optional and only available after five stars`() {
        for (star in 1..25) {
            val input = panelInput().copy(star = star)
            assertEquals(calculate(input), calculate(input.copy(awakened = null)))
            if (star < 25) invalid("awakened", "requires_five_star") { calculate(input.copy(awakened = true)) }
        }
        assertEquals(OperatorPanelValues(254, 37), calculate(panelInput().copy(star = 25, awakened = null)))
        assertEquals(OperatorPanelValues(278, 40), calculate(panelInput().copy(star = 25, awakened = true)))
    }

    @Test fun `stones use completed breakthrough counts and lowest combo quality`() {
        val pair = listOf(PanelStone("1025", 1, null), PanelStone("1033", 1, null))
        assertEquals(OperatorPanelValues(254, 24), calculate(panelInput(), pair))
        invalid("stones[0].breakthrough_stage", "missing") { calculate(panelInput(), listOf(PanelStone("1025", 10, null))) }
        assertEquals(OperatorPanelValues(254, 63), calculate(panelInput(), listOf(PanelStone("1025", 10, 0))))
        assertEquals(OperatorPanelValues(254, 83), calculate(panelInput(), listOf(PanelStone("1025", 10, 1))))
        assertEquals(OperatorPanelValues(254, 83), calculate(panelInput(), listOf(PanelStone("1021", 30, null))))
        invalid("stones[0].breakthrough_stage", "invalid") { calculate(panelInput(), listOf(PanelStone("1021", 30, 3))) }
        invalid("stones[0].level", "invalid") { calculate(panelInput(), listOf(PanelStone("1021", 31, null))) }
        invalid("stones", "duplicate_series") { calculate(panelInput(), listOf(PanelStone("1025", 1, null), PanelStone("1024", 1, null))) }
        invalid("stones", "invalid_slots") { calculate(panelInput(), listOf(102, 103, 104, 105).map { PanelStone("${it}5", 1, null) }) }
    }

    @Test fun `invalid versions missing rows duplicate IDs and unsafe values fail validation`() {
        val operator = bundle.operators.single()
        for (bad in listOf(
            bundle.copy(ruleSet = bundle.ruleSet.copy(operatorCount = 2)),
            bundle.copy(operators = listOf(operator.copy(experience = operator.experience - 10))),
            bundle.copy(operators = listOf(operator.copy(base = PanelAttributes(hp = Long.MAX_VALUE)))),
            bundle.copy(operators = listOf(operator.copy(version = "other"))),
            bundle.copy(stars = bundle.stars.drop(1)),
            bundle.copy(ruleSet = bundle.ruleSet.copy(kizunas = bundle.ruleSet.kizunas + bundle.ruleSet.kizunas)),
        )) {
            assertThrows(IllegalArgumentException::class.java) { PanelRuleValidation.validate(bad) }
        }
    }

    @Test fun `private source IDs are not public operator query keys`() {
        invalid("operator_id", "unsupported") { OperatorPanelCalculator.calculate(bundle, "123", panelInput(), emptyList()) }
    }

    @Test fun `offline JSON reader rejects unknown fields fractional integers and trailing payloads`(@TempDir dir: Path) {
        val json = jacksonObjectMapper().writeValueAsString(bundle)
        val path = dir.resolve("rules.json")
        Files.writeString(path, json)
        assertEquals(bundle, PanelRuleFile.read(path))
        for (bad in listOf(json.dropLast(1) + ",\"extra\":1}", json.replace("\"hp\":101", "\"hp\":101.5"), "$json {}")) {
            Files.writeString(path, bad)
            assertThrows(Exception::class.java) { PanelRuleFile.read(path) }
        }
    }

    private fun calculate(input: PanelCultivation, stones: List<PanelStone> = emptyList()) =
        OperatorPanelCalculator.calculate(bundle, "operator.test", input, stones)

    private fun invalid(field: String, reason: String, action: () -> Unit) {
        val error = assertThrows(PanelInputException::class.java, action)
        assertEquals(field, error.field)
        assertEquals(reason, error.reason)
    }
}
