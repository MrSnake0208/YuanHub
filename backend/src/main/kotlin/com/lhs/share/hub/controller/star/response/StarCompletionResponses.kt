package com.lhs.share.hub.controller.star.response

import com.lhs.share.hub.repository.entity.StarCompletion
import com.lhs.share.hub.repository.entity.StarCompletionChange
import com.lhs.share.hub.repository.entity.StarStateExperience
import java.time.Instant

data class StarCompletionContextResponse(
    val accountId: String,
    val game: String,
    val state: StarStateCurrentResponse,
    /** null means unknown; numeric zero is backed by an explicit entry or a full snapshot. */
    val bottleBalances: Map<String, Long?>,
    val inventoryRevision: Long,
)

data class StarCompletionResponse(
    val operationId: String,
    val accountId: String,
    val game: String,
    val generation: Long,
    val changes: List<StarCompletionChange>,
    val experienceConsumed: StarStateExperience,
    val bottlesConsumed: Map<String, Long>,
    val bottleBalances: Map<String, Long?>,
    val starRevision: Long,
    val inventoryRevision: Long,
    val state: StarStateCurrentResponse,
    val completedAt: Instant,
    val requestIdentity: String,
) {
    companion object {
        fun of(value: StarCompletion) = StarCompletionResponse(
            value.operationId, value.accountId, value.game, value.state.generation, value.changes,
            value.experienceConsumed, value.bottlesConsumed, value.bottleBalances, value.state.revision,
            value.inventoryRevision, StarStateCurrentResponse.of(value.state.toCurrent()), value.createdAt, value.requestIdentity,
        )
    }
}
