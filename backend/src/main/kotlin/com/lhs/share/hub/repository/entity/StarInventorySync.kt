package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** No TTL: a lost HTTP response must remain safely retryable after later edits. */
@Document("star_inventory_syncs")
@CompoundIndex(name = "idx_star_sync_owner_scan", def = "{'userId': 1, 'accountId': 1, 'scanId': 1}", unique = true)
data class StarInventorySync(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val scanId: String,
    val payload: String,
    val generation: Long,
    val revision: Long,
    val recoveryPointId: String?,
    val inheritancePending: Boolean,
    val createdAt: Instant = Instant.now(),
)

/** One unresolved source per account; source checkpoint is pinned until explicitly resolved. */
@Document("star_plan_inheritance_pending")
@CompoundIndex(name = "idx_star_plan_pending_owner", def = "{'userId': 1, 'accountId': 1}", unique = true)
data class StarPlanInheritancePending(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val sourceRecoveryPointId: String,
    val targetGeneration: Long,
    val scanId: String,
    val createdAt: Instant = Instant.now(),
    val resolution: StarPlanInheritanceResolution? = null,
)

data class StarPlanInheritanceResolution(
    val operationId: String,
    val action: String,
    val payload: String,
    val revision: Long,
)
