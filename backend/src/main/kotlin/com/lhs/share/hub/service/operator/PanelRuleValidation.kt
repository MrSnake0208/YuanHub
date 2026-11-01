package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorPanelRule
import com.lhs.share.hub.repository.entity.PanelAttributes
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import com.lhs.share.hub.repository.entity.StarPanelRule

object PanelRuleValidation {
    val games = setOf("如鸢", "代号鸢")

    fun validate(bundle: PanelRuleBundle) {
        val set = bundle.ruleSet
        require(set.id.matches(Regex("[a-zA-Z0-9_-]{1,64}"))) { "Invalid panel rule version" }
        require(set.games.isNotEmpty() && games.containsAll(set.games)) { "Invalid panel rule games" }
        require(bundle.operators.size in 1..1000 && bundle.operators.size == set.operatorCount)
        require(bundle.stars.size in 1..1000 && bundle.stars.size == set.starCount)
        require(bundle.operators.map { it.sourceId }.distinct().size == bundle.operators.size)
        val mapped = bundle.operators.mapNotNull { it.operatorId }
        require(mapped.all { it.isNotBlank() } && mapped.distinct().size == mapped.size)
        require(bundle.stars.map { it.sourceId }.distinct().size == bundle.stars.size)
        bundle.operators.forEach { rule ->
            require(rule.version == set.id && rule.id == "${set.id}:operator:${rule.sourceId}")
            operator(rule)
        }
        bundle.stars.forEach { rule ->
            require(rule.version == set.id && rule.id == "${set.id}:star:${rule.sourceId}")
            star(rule)
        }
        val starSeries = bundle.stars.groupBy { it.series }
        starSeries.values.forEach { variants ->
            require(variants.map { it.quality }.toSet() == (1..5).toSet())
            require(variants.map { it.name }.distinct().size == 1)
        }
        require(starSeries.values.map { it.first().name }.distinct().size == starSeries.size)
        val series = bundle.stars.map { it.series }.toSet()
        require(set.kizunas.size <= 100)
        require(set.kizunas.map { it.series }.distinct().size == set.kizunas.size)
        set.kizunas.forEach { rule ->
            require(rule.series.size in 2..3 && series.containsAll(rule.series))
            require(rule.qualities.keys == (1..5).toSet())
            rule.qualities.values.forEach(::attributes)
        }
    }

    private fun operator(rule: OperatorPanelRule) {
        require(rule.sourceId.matches(Regex("[0-9]{1,12}")))
        require(rule.rarity in 3..5)
        require(rule.maxStar == if (rule.rarity == 3) 19 else 25)
        require(rule.experience.keys == (1..100).toSet())
        require(rule.breakthrough.keys == (0..9).toSet())
        val sparseStars = (1..rule.maxStar step 6).toSet()
        require(rule.star.keys == (1..rule.maxStar).toSet() || rule.star.keys == sparseStars)
        require(rule.potential.keys == (1..17).toSet())
        rule.potential.forEach { (key, value) ->
            require(value.step == key)
            attributes(value.attributes)
        }
        require(rule.potentialExtra.keys.all { it in 1..17 })
        attributes(rule.base)
        listOf(rule.experience, rule.breakthrough, rule.star, rule.potentialExtra).forEach { it.values.forEach(::attributes) }
        require(rule.rarity != 3 || rule.awake == null)
        rule.awake?.let(::attributes)
    }

    private fun star(rule: StarPanelRule) {
        require(rule.name.isNotBlank() && rule.name.length <= 256 && rule.name == rule.name.trim())
        require(rule.series in 101..114 || rule.series in 201..224)
        require(rule.quality in 1..5 && rule.sourceId == "${rule.series}${rule.quality}")
        require(rule.kind == if (rule.series < 200) "main" else "support")
        require(rule.maxLevel == listOf(30, 40, 50, 60, 60)[rule.quality - 1])
        require(rule.levels.keys == (1..rule.maxLevel).toSet())
        require(rule.breakthrough.keys == (0 until rule.maxLevel / 10).toSet())
        require(rule.breakthrough.getValue(0) == PanelAttributes())
        rule.levels.values.forEach(::attributes)
        rule.breakthrough.values.forEach(::attributes)
    }

    fun attributes(value: PanelAttributes) {
        require(listOf(value.hp, value.hpPercent, value.attack, value.attackPercent).all { it in 0..1_000_000L }) {
            "Panel rule attribute exceeds supported integer range"
        }
    }
}
