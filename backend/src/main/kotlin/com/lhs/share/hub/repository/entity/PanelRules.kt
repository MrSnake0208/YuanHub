package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document

data class PanelAttributes(
    val hp: Long = 0,
    val hpPercent: Long = 0,
    val attack: Long = 0,
    val attackPercent: Long = 0,
) {
    operator fun plus(other: PanelAttributes) = PanelAttributes(
        Math.addExact(hp, other.hp),
        Math.addExact(hpPercent, other.hpPercent),
        Math.addExact(attack, other.attack),
        Math.addExact(attackPercent, other.attackPercent),
    )
}

data class PanelPotential(val step: Int, val attributes: PanelAttributes)

@Document("operator_panel_rules")
data class OperatorPanelRule(
    @Id val id: String,
    val version: String,
    val sourceId: String,
    val operatorId: String?,
    val rarity: Int,
    val maxStar: Int,
    val base: PanelAttributes,
    val experience: Map<Int, PanelAttributes>,
    val breakthrough: Map<Int, PanelAttributes>,
    val star: Map<Int, PanelAttributes>,
    val potential: Map<Int, PanelPotential>,
    val potentialExtra: Map<Int, PanelAttributes>,
    val awake: PanelAttributes?,
)

@Document("star_panel_rules")
data class StarPanelRule(
    @Id val id: String,
    val version: String,
    val sourceId: String,
    val series: Int,
    val quality: Int,
    val kind: String,
    val maxLevel: Int,
    val levels: Map<Int, PanelAttributes>,
    // Keys are completed breakthroughs (0..5), not the source table's 1-based rows.
    val breakthrough: Map<Int, PanelAttributes>,
    val name: String,
)

data class PanelKizunaRule(val series: Set<Int>, val qualities: Map<Int, PanelAttributes>)

@Document("panel_rule_sets")
data class PanelRuleSet(
    @Id val id: String,
    val games: Set<String>,
    val operatorCount: Int,
    val starCount: Int,
    val kizunas: List<PanelKizunaRule>,
)

@Document("panel_rule_sets")
data class ActivePanelRuleSet(@Id val id: String, val version: String)

data class PanelRuleBundle(val ruleSet: PanelRuleSet, val operators: List<OperatorPanelRule>, val stars: List<StarPanelRule>)
