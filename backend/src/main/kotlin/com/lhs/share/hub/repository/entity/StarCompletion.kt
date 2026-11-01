package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("star_completion")
@CompoundIndex(name = "idx_star_completion_operation_unique", def = "{'userId': 1, 'accountId': 1, 'operationId': 1}", unique = true)
data class StarCompletion(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val operationId: String,
    /** Canonical request JSON, including expected versions and one-time node corrections. */
    val requestIdentity: String,
    val changes: List<StarCompletionChange>,
    val experienceConsumed: StarStateExperience,
    val bottlesConsumed: Map<String, Long>,
    /** Existing numeric-only receipts remain readable; new receipts also preserve unknown balances as null. */
    val bottleBalances: Map<String, Long?>,
    val inventoryRevision: Long,
    /** Immutable authoritative result at commit time; later state must be read from completion context. */
    val state: StarCompletionState,
    val createdAt: Instant,
)

data class StarCompletionChange(val instanceId: String, val from: Int, val to: Int)

/** Embedded receipt snapshot: never inherit the current-state collection's unique owner index. */
data class StarCompletionState(
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
    val loadoutFence: Long = 0,
) {
    constructor(state: StarStateCurrent) : this(
        state.id, state.userId, state.accountId, state.generation, state.revision,
        state.inventory, state.planTargets, state.experience, state.bag, state.updatedAt, state.loadoutFence,
    )

    fun toCurrent() = StarStateCurrent(
        id, userId, accountId, generation, revision,
        inventory, planTargets, experience, bag, updatedAt, loadoutFence,
    )
}
