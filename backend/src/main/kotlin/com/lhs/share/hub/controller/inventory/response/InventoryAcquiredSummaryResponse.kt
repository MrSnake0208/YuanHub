package com.lhs.share.hub.controller.inventory.response

import java.time.Instant

data class InventoryAcquiredSummaryResponse(
    val accountId: String,
    val entityType: String,
    val from: Instant,
    val to: Instant,
    val timezone: String,
    val items: Map<String, InventoryAcquiredSummaryItem>,
)

data class InventoryAcquiredSummaryItem(val acquired: Long, val activeDays: Int)
