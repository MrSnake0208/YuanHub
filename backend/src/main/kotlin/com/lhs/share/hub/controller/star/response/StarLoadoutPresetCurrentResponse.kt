package com.lhs.share.hub.controller.star.response

import com.lhs.share.hub.repository.entity.StarLoadoutPreset
import com.lhs.share.hub.repository.entity.StarLoadoutPresetCurrent
import java.time.Instant

data class StarLoadoutPresetCurrentResponse(
    val revision: Long,
    val mainPresets: List<StarLoadoutPreset>,
    val supportPresets: List<StarLoadoutPreset>,
    val updatedAt: Instant?,
) {
    companion object {
        fun empty() = StarLoadoutPresetCurrentResponse(0, emptyList(), emptyList(), null)

        fun of(current: StarLoadoutPresetCurrent) = StarLoadoutPresetCurrentResponse(
            current.revision,
            current.mainPresets,
            current.supportPresets,
            current.updatedAt,
        )
    }
}
