package com.lhs.share.hub.service.operator

import org.springframework.http.HttpStatus

object OperatorLevelBreakthroughRules {
    fun inferred(level: Int): Int? = when {
        level !in 1..100 -> null
        level < 100 && level % 10 == 0 -> null
        else -> (level - 1) / 10
    }

    fun valid(level: Int, stage: Int): Boolean = level in 1..100 && stage in (level - 1) / 10..minOf(level / 10, 9)

    fun read(level: Int, stage: Int?): Int? = stage?.takeIf { valid(level, it) } ?: inferred(level)

    fun requireValid(level: Int, stage: Int?, operatorId: String) {
        if (stage != null && !valid(level, stage)) {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_level_breakthrough",
                "Breakthrough stage must match the current level and be 0..9",
                operatorId = operatorId,
                fieldPath = "level_breakthrough_stage",
            )
        }
    }
}
