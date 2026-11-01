package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** One optimistic-lock counter per user-owned subaccount. */
@Document("inventory_revision")
@CompoundIndex(name = "idx_inventory_revision_owner_unique", def = "{'userId': 1, 'accountId': 1}", unique = true)
data class InventoryRevision(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val revision: Long = 0,
    val updatedAt: Instant = Instant.now(),
)
