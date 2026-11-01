package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_upgrade_transaction")
@CompoundIndex(
    name = "idx_operator_upgrade_idempotency_unique",
    def = "{'userId': 1, 'accountId': 1, 'idempotencyKey': 1}",
    unique = true,
)
data class OperatorUpgradeTransaction(
    @Id val id: String,
    @Indexed val userId: String,
    val accountId: String,
    val idempotencyKey: String,
    val requestIdentity: String,
    val operatorId: String,
    val dimension: String,
    val from: Int,
    val to: Int,
    val operatorLevel: Int,
    val operatorElite: Int,
    val operatorStarLevel: Int,
    val operatorRevision: Long,
    val consumed: List<UpgradeConsumedEntry>,
    val inventoryRevision: Long,
    val createdAt: Instant = Instant.now(),
    val operatorHuaji: OperatorHuaji? = null,
    val operatorLevelBreakthroughStage: Int? = null,
)

data class UpgradeConsumedEntry(
    val entityType: String,
    val id: String,
    val count: Long,
    val balanceAfter: Long,
)
