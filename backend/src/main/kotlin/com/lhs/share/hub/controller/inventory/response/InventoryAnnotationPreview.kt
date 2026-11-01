package com.lhs.share.hub.controller.inventory.response

import java.time.Instant

data class InventoryAnnotationPreview(
    val expectedInventoryRevision: Long,
    val entries: List<InventoryAnnotationEntry>,
    val canConfirm: Boolean,
)

data class InventoryAnnotationEntry(
    val recordId: String,
    val entityType: String,
    val id: String,
    val baselineAt: Instant?,
    val effectiveAt: Instant,
    val historyOnly: Boolean,
)
