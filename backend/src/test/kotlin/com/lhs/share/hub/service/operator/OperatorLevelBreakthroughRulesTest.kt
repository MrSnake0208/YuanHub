package com.lhs.share.hub.service.operator

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OperatorLevelBreakthroughRulesTest {
    @Test
    fun `all levels have only their compatible stages and boundaries stay unknown`() {
        assertNull(OperatorLevelBreakthroughRules.inferred(0))
        for (level in 1..100) {
            val lower = (level - 1) / 10
            val upper = minOf(level / 10, 9)
            assertEquals(if (lower == upper) lower else null, OperatorLevelBreakthroughRules.inferred(level))
            for (stage in -1..10) assertEquals(stage in lower..upper, OperatorLevelBreakthroughRules.valid(level, stage))
        }
        assertThrows(OperatorApiException::class.java) { OperatorLevelBreakthroughRules.requireValid(90, 7, "op1") }
        assertThrows(OperatorApiException::class.java) { OperatorLevelBreakthroughRules.requireValid(0, 0, "op1") }
    }
}
