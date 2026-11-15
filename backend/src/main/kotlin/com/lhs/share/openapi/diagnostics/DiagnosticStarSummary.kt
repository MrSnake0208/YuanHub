package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty

internal val STAR_DIAGNOSTIC_SYMBOL = Regex("[a-z0-9_]{1,64}")

// Keep allowed nulls through the intent parser's serialize/parse round trip.
@JsonInclude(JsonInclude.Include.ALWAYS)
data class DiagnosticStarSummary(
    val main: DiagnosticStarScan,
    val sub: DiagnosticStarScan,
    val experience: DiagnosticStarExperience,
    val capacity: DiagnosticStarCapacity,
    val warnings: List<String>,
    @param:JsonProperty(required = true) val error: DiagnosticStarError?,
    @param:JsonProperty(required = true) val timing: DiagnosticStarTiming?,
    @param:JsonProperty(required = true) val settle: DiagnosticStarSettle?,
)

data class DiagnosticStarScan(
    @param:JsonProperty(required = true) val count: Int,
    @param:JsonProperty(required = true) val complete: Boolean,
    @param:JsonProperty(required = true) val pages: Int,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class DiagnosticStarExperience(
    @param:JsonProperty(required = true) val orange: Int?,
    @param:JsonProperty(required = true) val purple: Int?,
    @param:JsonProperty(required = true) val white: Int?,
    @param:JsonProperty(required = true) val captured: Boolean,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class DiagnosticStarCapacity(
    @param:JsonProperty(required = true) val current: Int?,
    @param:JsonProperty(required = true) val capacity: Int?,
)

data class DiagnosticStarError(val stage: String, val code: String)

data class DiagnosticStarTiming(
    @param:JsonProperty(required = true) val navigationMs: Int,
    @param:JsonProperty(required = true) val totalMs: Int,
)

data class DiagnosticStarSettle(
    @param:JsonProperty(required = true) val maxMs: Int,
    @param:JsonProperty(required = true) val lastSettleMs: Int,
    @param:JsonProperty(required = true) val comparisons: Int,
)

internal fun DiagnosticStarSummary.validFields(): Boolean =
    listOf(main, sub).all { it.count in 0..999 && it.pages in 0..999 } &&
        listOf(experience.orange, experience.purple, experience.white).all { it == null || it in 0..99999999 } &&
        listOf(capacity.current, capacity.capacity).all { it == null || it in 0..999 } &&
        warnings.size <= 16 && warnings.all { STAR_DIAGNOSTIC_SYMBOL.matches(it) } &&
        (error == null || (STAR_DIAGNOSTIC_SYMBOL.matches(error.stage) && STAR_DIAGNOSTIC_SYMBOL.matches(error.code))) &&
        (timing == null || (timing.navigationMs in 0..600000 && timing.totalMs in 0..600000)) &&
        (settle == null || (settle.maxMs in 0..600000 && settle.lastSettleMs in 0..600000 && settle.comparisons in 0..600000))
