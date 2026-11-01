package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** User-global star loadout presets. Presets contain canonical star names, never inventory instance IDs. */
@Document("star_loadout_preset_current")
data class StarLoadoutPresetCurrent(
    @Id val id: String? = null,
    @Indexed(name = "idx_star_loadout_preset_user_unique", unique = true)
    val userId: String,
    val mainPresets: List<StarLoadoutPreset> = emptyList(),
    val supportPresets: List<StarLoadoutPreset> = emptyList(),
    val revision: Long = 1,
    val updatedAt: Instant = Instant.now(),
)

data class StarLoadoutPreset(
    val id: String,
    val name: String,
    val starNames: List<String>,
)
