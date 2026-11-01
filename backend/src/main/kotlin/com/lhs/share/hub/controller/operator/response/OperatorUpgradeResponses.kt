package com.lhs.share.hub.controller.operator.response

import com.lhs.share.hub.repository.entity.OperatorUpgradeTransaction
import com.lhs.share.hub.repository.entity.UpgradeConsumedEntry
import java.time.Instant

data class OperatorUpgradeRequirement(
    val entityType: String,
    val id: String,
    val required: Long,
    val owned: Long,
    val balanceAfter: Long,
)

data class OperatorUpgradeBlockingReason(val code: String, val message: String)

data class OperatorUpgradePreviewResponse(
    val available: Boolean,
    val dimension: String,
    val from: Int,
    val to: Int,
    val requirements: List<OperatorUpgradeRequirement>,
    val experienceRequired: Long? = null,
    val experienceOverflow: Long? = null,
    val moneyRequired: Long = 0,
    val blockingReasons: List<OperatorUpgradeBlockingReason>,
    val operatorRevision: Long,
    val inventoryRevision: Long,
    val previewToken: String,
    val expiresAt: Instant,
)

data class OperatorUpgradeCurrentResponse(
    val id: String,
    val level: Int,
    val elite: Int,
    val starLevel: Int,
    val revision: Long,
    val huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
    val levelBreakthroughStage: Int? = null,
)

data class OperatorUpgradeExecuteResponse(
    val transactionId: String,
    val operator: OperatorUpgradeCurrentResponse,
    val consumed: List<UpgradeConsumedEntry>,
    val inventoryRevision: Long,
    val createdAt: Instant,
) {
    companion object {
        fun of(value: OperatorUpgradeTransaction) = OperatorUpgradeExecuteResponse(
            value.id,
            OperatorUpgradeCurrentResponse(
                value.operatorId,
                value.operatorLevel,
                value.operatorElite,
                value.operatorStarLevel,
                value.operatorRevision,
                value.operatorHuaji,
                com.lhs.share.hub.service.operator.OperatorLevelBreakthroughRules.read(
                    value.operatorLevel,
                    value.operatorLevelBreakthroughStage,
                ),
            ),
            value.consumed,
            value.inventoryRevision,
            value.createdAt,
        )
    }
}

data class OperatorUpgradeEvent(
    val accountId: String,
    val transactionId: String,
    val operatorId: String,
    val dimension: String,
    val from: Int,
    val to: Int,
    val consumed: List<UpgradeConsumedEntry>,
    val operatorRevision: Long,
    val inventoryRevision: Long,
    val occurredAt: Instant,
)
