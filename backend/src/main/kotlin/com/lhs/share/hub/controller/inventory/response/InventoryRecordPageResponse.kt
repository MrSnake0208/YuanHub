package com.lhs.share.hub.controller.inventory.response

/**
 * Stable cursor page for imported inventory records.
 */
data class InventoryRecordPageResponse(
    val items: List<InventoryRecordListItemDto>,
    val nextCursor: String?,
)
