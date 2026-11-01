package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.JsonDeserializer
import com.fasterxml.jackson.databind.JsonMappingException
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

data class StarCompletionRequest(
    val accountId: String,
    /** Canonical game version from SubAccount.game: 代号鸢 / 如鸢. */
    val game: String,
    val operationId: String,
    @field:NotNull @field:JsonDeserialize(using = CompletionLongDeserializer::class) val expectedGeneration: Long?,
    @field:NotNull @field:JsonDeserialize(using = CompletionLongDeserializer::class) val expectedStarRevision: Long?,
    @field:NotNull @field:JsonDeserialize(using = CompletionLongDeserializer::class) val expectedInventoryRevision: Long?,
    @field:Valid @field:Size(min = 1, max = 1000) val stars: List<StarCompletionSelection>,
    @field:Valid val experienceConsumed: StarCompletionExperience,
    @field:Valid val bottlesConsumed: StarCompletionBottles,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown completion field: $name")
    }
}

data class StarCompletionSelection(
    val instanceId: String,
    @field:NotNull @field:JsonDeserialize(using = CompletionIntDeserializer::class) val currentLevel: Int?,
    @field:NotNull @field:JsonDeserialize(using = CompletionIntDeserializer::class) val targetLevel: Int?,
    /** null means the default (not already broken); true/false only at a real breakthrough node. */
    val startAlreadyBroken: Boolean? = null,
    val targetAlsoBroken: Boolean? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown selection field: $name")
    }
}

/** Required nullable fields prevent missing/null quantities from becoming unconfirmed zeroes. */
data class StarCompletionExperience(
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionIntDeserializer::class) val orange: Int?,
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionIntDeserializer::class) val purple: Int?,
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionIntDeserializer::class) val white: Int?,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown experience field: $name")
    }
}

data class StarCompletionBottles(
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionLongDeserializer::class) val jiezhuping:
    Long?,
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionLongDeserializer::class) val jiezheping:
    Long?,
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) @field:JsonDeserialize(using = CompletionLongDeserializer::class) val jieyangping:
    Long?,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown bottle field: $name")
    }
}

/** Scoped to this command: Jackson's default float-to-integer coercion must not change confirmed quantities. */
class CompletionIntDeserializer : JsonDeserializer<Int>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): Int {
        if (parser.currentToken != JsonToken.VALUE_NUMBER_INT) throw JsonMappingException.from(parser, "Expected an integer")
        return parser.intValue
    }
}

class CompletionLongDeserializer : JsonDeserializer<Long>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): Long {
        if (parser.currentToken != JsonToken.VALUE_NUMBER_INT) throw JsonMappingException.from(parser, "Expected an integer")
        return parser.longValue
    }
}
