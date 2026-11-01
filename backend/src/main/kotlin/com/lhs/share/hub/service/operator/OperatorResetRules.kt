package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorCatalogEntity

object OperatorResetRules {
    data class Refund(val suggested: Map<String, Long>, val money: Long, val experience: Long)

    fun refund(level: Int, elite: Int, stage: Int?, catalog: OperatorCatalogEntity): Refund {
        val growth = OperatorRequirementRules.level(1, level, catalog)
        val boundary = if (level in 10..90 && level % 10 == 0 && stage == level / 10) {
            OperatorRequirementRules.level(level, level + 1, catalog, levelBreakthroughStage = level / 10 - 1)
        } else {
            OperatorRequirementRules.Cost(emptyMap())
        }
        val cultivation = OperatorRequirementRules.elite(1, elite, catalog)
        val items = linkedMapOf<String, Long>()
        listOf(growth, boundary, cultivation).forEach { cost ->
            cost.items.forEach { (id, count) -> items[id] = (items[id] ?: 0) + count }
        }
        val xp = growth.experience
        // Base XP only; unrecorded overflow needs game confirmation. Auto refunds stop at complete books.
        items["bingshuquanjuan"] = xp / 1000
        items["bingshucanjuan"] = (xp % 1000) / 100
        items["liutaobingshu"] = 0
        return Refund(items, growth.money + boundary.money + cultivation.money, xp)
    }
}
