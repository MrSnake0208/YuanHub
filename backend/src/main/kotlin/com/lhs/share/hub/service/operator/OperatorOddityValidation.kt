package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import org.springframework.http.HttpStatus
import java.math.BigDecimal

/** Returns an error before conversion; precision is decimal, never Double multiplication. */
object OperatorOddityValidation {
    private fun currentError(key: String, value: JsonNode?, maximum: Int): String? {
        if (key != "special") {
            if (value == null || !value.isIntegralNumber || !value.canConvertToInt()) return "current must be an integer"
        } else {
            if (value == null || !value.isNumber || !value.doubleValue().isFinite()) return "current must be a number"
            if (value.decimalValue().stripTrailingZeros().scale() > 1) return "special current allows at most one decimal place"
        }
        val decimal = checkNotNull(value).decimalValue()
        if (decimal < BigDecimal.ZERO) return "oddity current must be non-negative"
        if (decimal > BigDecimal.valueOf(maximum.toLong())) return "oddity current exceeds the catalog limit"
        return null
    }

    fun requireCurrent(key: String, value: JsonNode?, maximum: Int, operatorId: String, recordId: String? = null): Double {
        currentError(key, value, maximum)?.let {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_combat_stats",
                it,
                recordId = recordId,
                operatorId = operatorId,
                fieldPath = "combat_stats.oddities.$key.current",
            )
        }
        return checkNotNull(value).doubleValue()
    }
}
