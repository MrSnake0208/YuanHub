package com.lhs.share.hub.controller.star.response

import java.time.Instant

/** Public inventory projection. Instance identity and every private workspace field are absent. */
data class StarShareResponse(
    val game: String,
    val availableViews: List<String>,
    val hasState: Boolean,
    val updatedAt: Instant?,
    val inventory: List<StarShareEntry>,
)

data class StarShareEntry(val kind: String, val name: String, val quality: String, val level: Int, val breakthroughStage: Int? = null)
