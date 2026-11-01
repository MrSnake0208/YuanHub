package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.JsonSerializer
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.node.DecimalNode
import com.fasterxml.jackson.databind.node.IntNode
import java.math.BigDecimal

/** Keep legacy integer tokens in responses, v3 exports and signature bytes. */
fun oddityNumberNode(value: Double): JsonNode = if (value == value.toInt().toDouble()) {
    IntNode.valueOf(value.toInt())
} else {
    DecimalNode.valueOf(BigDecimal.valueOf(value).stripTrailingZeros())
}

class OperatorOddityNumberSerializer : JsonSerializer<Double>() {
    override fun serialize(value: Double, generator: JsonGenerator, serializers: SerializerProvider) {
        val number = oddityNumberNode(value)
        if (number.isIntegralNumber) generator.writeNumber(number.intValue()) else generator.writeNumber(number.decimalValue())
    }
}
