package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.operator.response.OperatorOddityRules
import com.lhs.share.hub.repository.entity.OperatorPanelRule
import com.lhs.share.hub.repository.entity.PanelAttributes
import com.lhs.share.hub.repository.entity.PanelRuleBundle

data class PanelCultivation(
    val level: Int,
    val breakthroughStage: Int?,
    val potential: Int,
    val star: Int,
    val awakened: Boolean?,
    val oddityHp: Int,
    val oddityAttack: Int,
)

data class PanelStone(val sourceId: String, val level: Int, val breakthroughStage: Int?)
data class OperatorPanelValues(val hp: Long, val attack: Long)
class PanelInputException(val field: String, val reason: String) : IllegalArgumentException("$field: $reason")

/** Only trusted, validated rule bundles enter this core; callers resolve account/catalog/slot restrictions. */
object OperatorPanelCalculator {
    fun calculate(bundle: PanelRuleBundle, operatorId: String, input: PanelCultivation, stones: List<PanelStone>): OperatorPanelValues {
        val rule = bundle.operators.singleOrNull { it.operatorId == operatorId } ?: fail("operator_id", "unsupported")
        val attributes = operator(rule, input) + stones(bundle, stones)
        return OperatorPanelValues(
            Math.multiplyExact(attributes.hp, Math.addExact(10_000L, attributes.hpPercent)) / 10_000L,
            Math.multiplyExact(attributes.attack, Math.addExact(10_000L, attributes.attackPercent)) / 10_000L,
        )
    }

    private fun operator(rule: OperatorPanelRule, input: PanelCultivation): PanelAttributes {
        if (input.level !in 1..100) fail("level", "invalid")
        val stage = input.breakthroughStage ?: OperatorLevelBreakthroughRules.inferred(input.level)
            ?: fail("breakthrough_stage", "missing")
        if (!OperatorLevelBreakthroughRules.valid(input.level, stage)) fail("breakthrough_stage", "invalid")
        if (input.potential !in 0..17) fail("potential", "invalid")
        if (input.star !in 1..rule.maxStar || input.star !in rule.star) fail("star", "invalid")
        val awakened = input.awakened == true
        if (awakened && rule.awake == null) fail("awakened", "unsupported")
        if (awakened && input.star != 25) fail("awakened", "requires_five_star")
        val oddityLimits = OperatorOddityRules.schema(rule.rarity, null)
        if (input.oddityHp !in 0..oddityLimits.hp.max) fail("oddity_hp", "invalid")
        if (input.oddityAttack !in 0..oddityLimits.attack.max) fail("oddity_attack", "invalid")
        val potential = if (input.potential == 0) null else rule.potential.getValue(input.potential)
        val extras = rule.potentialExtra.filterKeys { it <= (potential?.step ?: 0) }.values.fold(PanelAttributes(), PanelAttributes::plus)
        return rule.base + rule.experience.getValue(input.level) + rule.breakthrough.getValue(stage) +
            rule.star.getValue(input.star) + (potential?.attributes ?: PanelAttributes()) + extras +
            (if (awakened) checkNotNull(rule.awake) else PanelAttributes()) +
            PanelAttributes(hp = input.oddityHp.toLong(), attack = input.oddityAttack.toLong())
    }

    private fun stones(bundle: PanelRuleBundle, input: List<PanelStone>): PanelAttributes {
        if (input.size > 6) fail("stones", "too_many")
        val rules = bundle.stars.associateBy { it.sourceId }
        val selected = input.map { rules[it.sourceId] ?: fail("stones", "unsupported") }
        if (selected.map { it.series }.distinct().size != selected.size) fail("stones", "duplicate_series")
        if (selected.groupingBy { it.kind }.eachCount().values.any { it > 3 }) fail("stones", "invalid_slots")
        var total = PanelAttributes()
        input.zip(selected).forEachIndexed { index, (stone, rule) ->
            val field = "stones[$index]"
            if (stone.level !in 1..rule.maxLevel) fail("$field.level", "invalid")
            val minimum = (stone.level - 1) / 10
            val maximum = minOf(stone.level / 10, rule.maxLevel / 10 - 1)
            val stage = stone.breakthroughStage ?: if (minimum == maximum) minimum else fail("$field.breakthrough_stage", "missing")
            if (stage !in minimum..maximum) fail("$field.breakthrough_stage", "invalid")
            total += rule.levels.getValue(stone.level) + rule.breakthrough.getValue(stage)
        }
        val qualities = selected.associate { it.series to it.quality }
        bundle.ruleSet.kizunas.filter { qualities.keys.containsAll(it.series) }.forEach { rule ->
            total += rule.qualities.getValue(rule.series.minOf { qualities.getValue(it) })
        }
        return total
    }

    private fun fail(field: String, reason: String): Nothing = throw PanelInputException(field, reason)
}
