package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** Account-scoped star assignment snapshot. Values are inventory instance references only. */
@Document("star_loadout_current")
@CompoundIndexes(
    CompoundIndex(
        name = "idx_star_loadout_user_account_unique",
        def = "{'userId': 1, 'accountId': 1}",
        unique = true,
    ),
    CompoundIndex(
        name = "idx_star_loadout_user_updated_at",
        def = "{'userId': 1, 'updatedAt': -1}",
    ),
)
data class StarLoadoutCurrent(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    /** Stored as values rather than BSON map fields so valid operator IDs containing '.' round-trip unchanged. */
    val loadouts: List<StarOperatorLoadout> = emptyList(),
    val revision: Long = 1,
    val updatedAt: Instant = Instant.now(),
    val generation: Long = 0,
)

data class StarOperatorLoadout(val operatorId: String, val slots: StarLoadoutSlots)

data class StarLoadoutSlots(
    val main1: String? = null,
    val main2: String? = null,
    val main3: String? = null,
    val support1: String? = null,
    val support2: String? = null,
    val support3: String? = null,
) {
    fun values(): List<Pair<String, String?>> = listOf(
        "main1" to main1,
        "main2" to main2,
        "main3" to main3,
        "support1" to support1,
        "support2" to support2,
        "support3" to support3,
    )

    fun asMap(): Map<String, String?> = values().toMap()
}
