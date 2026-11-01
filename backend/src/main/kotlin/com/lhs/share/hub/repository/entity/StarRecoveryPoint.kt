package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** A pre-change business checkpoint. Null loadouts means no historical loadout data. */
@Document("star_recovery_points")
@CompoundIndex(name = "idx_star_recovery_owner_time", def = "{'userId': 1, 'accountId': 1, 'createdAt': -1}")
data class StarRecoveryPoint(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val recoveryPointId: String,
    val reason: String,
    val createdAt: Instant,
    val sourceGeneration: Long,
    val state: StarStateSnapshot,
    val loadouts: List<StarOperatorLoadout>?,
)
