package com.lhs.share.hub.controller.star.response

import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.StarStateCurrent
import java.time.Instant

data class StarStateCurrentResponse(
    val accountId: String,
    val generation: Long,
    val revision: Long,
    val inventory: List<StarStateEntryResponse>,
    val planTargets: Map<String, Int>,
    val experience: StarWorkspaceExperienceResponse,
    val bag: StarWorkspaceBagResponse,
    val updatedAt: Instant?,
) {
    companion object {
        fun empty(accountId: String) = StarStateCurrentResponse(
            accountId, 0, 0, emptyList(), emptyMap(),
            StarWorkspaceExperienceResponse(null, null, null), StarWorkspaceBagResponse(null, null), null,
        )

        fun of(state: StarStateCurrent) = StarStateCurrentResponse(
            state.accountId, state.generation, state.revision,
            state.inventory.map { StarStateEntryResponse(it.instanceId, it.kind, it.name, it.quality, it.level, it.breakthroughStage) },
            state.planTargets.associate { it.instanceId to it.targetLevel },
            StarWorkspaceExperienceResponse(state.experience.orange, state.experience.purple, state.experience.white),
            StarWorkspaceBagResponse(state.bag.currentCount, state.bag.capacity), state.updatedAt,
        )
    }
}

data class StarStateEntryResponse(
    val instanceId: String,
    val kind: String,
    val name: String,
    val quality: String,
    val level: Int,
    val breakthroughStage: Int? = null,
)

data class StarRecoveryPointResponse(
    val recoveryPointId: String,
    val reason: String,
    val createdAt: Instant,
    val sourceGeneration: Long,
    val inventoryCount: Int,
    val plannedCount: Int,
    val bag: StarWorkspaceBagResponse,
    val loadoutAvailable: Boolean,
    val operatorCount: Int?,
    val slotCount: Int?,
) {
    companion object {
        fun of(point: StarRecoveryPoint) = StarRecoveryPointResponse(
            point.recoveryPointId, point.reason, point.createdAt, point.sourceGeneration,
            point.state.inventory.size, point.state.planTargets.size,
            StarWorkspaceBagResponse(point.state.bag.currentCount, point.state.bag.capacity),
            point.loadouts != null,
            point.loadouts?.count { loadout -> loadout.slots.values().any { it.second != null } },
            point.loadouts?.sumOf { loadout -> loadout.slots.values().count { it.second != null } },
        )
    }
}

data class StarRecoverySummary(
    val restoredOperators: Int,
    val restoredSlots: Int,
    val skippedOperators: Int,
    val skippedSlots: Int,
    val skippedOperatorIds: List<String>,
    val skippedInvalidSlots: Int,
    val historicalLoadoutAvailable: Boolean,
)

data class StarStateCommandResponse(
    val state: StarStateCurrentResponse,
    val loadout: StarLoadoutCurrentResponse,
    val recoveryPoint: StarRecoveryPointResponse?,
    val recoverySummary: StarRecoverySummary? = null,
)
