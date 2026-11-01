package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** The account's complete current star business state. OCR evidence stays in YuanStar. */
@Document("star_state_current")
@CompoundIndex(name = "idx_star_state_owner", def = "{'userId': 1, 'accountId': 1}", unique = true)
data class StarStateCurrent(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val generation: Long,
    val revision: Long,
    val inventory: List<StarStateEntry>,
    val planTargets: List<StarStatePlanTarget>,
    val experience: StarStateExperience,
    val bag: StarStateBag,
    val updatedAt: Instant,
    /** Internal write fence shared with Loadout PUT; it is not a business revision. */
    val loadoutFence: Long = 0,
)

data class StarStateEntry(
    val instanceId: String,
    val kind: String,
    val name: String,
    val quality: String,
    val level: Int,
    val breakthroughStage: Int? = null,
)

data class StarStatePlanTarget(val instanceId: String, val targetLevel: Int)

data class StarStateExperience(val orange: Int? = null, val purple: Int? = null, val white: Int? = null)

data class StarStateBag(val currentCount: Int? = null, val capacity: Int? = null)

data class StarStateSnapshot(
    val inventory: List<StarStateEntry>,
    val planTargets: List<StarStatePlanTarget>,
    val experience: StarStateExperience,
    val bag: StarStateBag,
)

fun StarStateCurrent.snapshot() = StarStateSnapshot(inventory, planTargets, experience, bag)
