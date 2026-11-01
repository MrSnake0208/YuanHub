package com.lhs.share.hub.controller.inventory.response

data class InventoryAgentFavoriteListResponse(
    val accountId: String,
    val agentIds: List<String>,
)

data class InventoryAgentFavoriteResponse(
    val accountId: String,
    val agentId: String,
    val favorite: Boolean,
)
