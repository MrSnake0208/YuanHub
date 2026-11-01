package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class StarBreakthroughRulesTest {
    @Test fun `node ambiguity and terminal quality caps use completed count`() {
        assertEquals(0..1, StarBreakthroughRules.allowed(10, "orange"))
        assertEquals(null, StarBreakthroughRules.inferred(10, "orange"))
        assertEquals(1, StarBreakthroughRules.inferred(11, "orange"))
        assertEquals(2, StarBreakthroughRules.inferred(30, "white"))
        assertThrows(IllegalArgumentException::class.java) { StarBreakthroughRules.allowed(31, "white") }
        assertThrows(IllegalArgumentException::class.java) { StarBreakthroughRules.completed(30, "white", true) }
    }

    @Test fun `wire deserialization distinguishes omitted stage from explicit null and keeps decimals uncoerced`() {
        val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val base = """"instance_id":"s","kind":"main","name":"test","quality":"orange","level":10"""
        assertEquals(null, mapper.readValue<StarInventoryEntryRequest>("{$base}").breakthroughStage)
        assertEquals(true, mapper.readValue<StarInventoryEntryRequest>("{$base,\"breakthrough_stage\":null}").breakthroughStage?.isNull)
        assertEquals(
            false,
            mapper.readValue<StarInventoryEntryRequest>("{$base,\"breakthrough_stage\":1.5}").breakthroughStage?.isIntegralNumber,
        )
    }
}
