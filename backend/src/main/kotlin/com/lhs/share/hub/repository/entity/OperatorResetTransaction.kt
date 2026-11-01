package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_reset_transactions")
@CompoundIndex(name = "operator_reset_retry", def = "{'userId':1,'accountId':1,'idempotencyKey':1}", unique = true)
@CompoundIndex(name = "operator_reset_history", def = "{'userId':1,'accountId':1,'game':1,'operatorId':1,'_id':-1}")
data class OperatorResetTransaction(
    @Id val id: String,
    @get:JsonIgnore val userId: String,
    val accountId: String,
    val game: String,
    val operatorId: String,
    @get:JsonIgnore val idempotencyKey: String,
    @get:JsonIgnore val requestIdentity: String,
    val before: Map<String, ResetGrowth>,
    val after: Map<String, ResetGrowth>,
    val refunds: Map<String, Long>,
    @get:JsonIgnore val inventoryBaselines: Map<String, Instant>,
    val createdAt: Instant,
    val undoneAt: Instant? = null,
)

data class ResetGrowth(
    val level: Int,
    val elite: Int,
    val levelBreakthroughStage: Int?,
    val revision: Long,
    val baselineAt: Instant? = null,
)
