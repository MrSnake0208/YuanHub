package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorPanelRule
import com.lhs.share.hub.repository.entity.PanelAttributes
import com.lhs.share.hub.repository.entity.PanelKizunaRule
import com.lhs.share.hub.repository.entity.PanelPotential
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import com.lhs.share.hub.repository.entity.PanelRuleSet
import com.lhs.share.hub.repository.entity.StarPanelRule

/** Deliberately synthetic; no private game tables are committed as test fixtures. */
internal fun panelRules(version: String = "test_v1"): PanelRuleBundle {
    val operator = OperatorPanelRule(
        "$version:operator:123", version, "123", "operator.test", 5, 25,
        PanelAttributes(hp = 101, attack = 11),
        (1..100).associateWith { PanelAttributes(hp = it.toLong()) },
        (0..9).associateWith { PanelAttributes(hp = it * 100L, attack = it.toLong()) },
        (1..25).associateWith { PanelAttributes(attack = it.toLong()) },
        (1..17).associateWith { PanelPotential(it, PanelAttributes(hp = it * 10L)) },
        mapOf(3 to PanelAttributes(hpPercent = 500), 6 to PanelAttributes(attackPercent = 500)),
        PanelAttributes(hpPercent = 1000, attackPercent = 1000),
    )
    val stars = listOf(102, 103, 104, 105).flatMap { series ->
        (1..5).map { quality ->
            val maxLevel = listOf(30, 40, 50, 60, 60)[quality - 1]
            StarPanelRule(
                "$version:star:$series$quality", version, "$series$quality", series, quality, "main", maxLevel,
                (1..maxLevel).associateWith { PanelAttributes(attack = it * quality.toLong()) },
                (0 until maxLevel / 10).associateWith { PanelAttributes(attack = it * 20L) },
                "test.$series",
            )
        }
    }
    return PanelRuleBundle(
        PanelRuleSet(
            version,
            setOf("如鸢", "代号鸢"),
            1,
            stars.size,
            listOf(
                PanelKizunaRule(
                    setOf(102, 103),
                    (1..5).associateWith {
                        PanelAttributes(
                            attackPercent =
                            it * 500L,
                        )
                    },
                ),
            ),
        ),
        listOf(operator),
        stars,
    )
}

internal fun panelInput() = PanelCultivation(11, null, 3, 1, false, 0, 0)
