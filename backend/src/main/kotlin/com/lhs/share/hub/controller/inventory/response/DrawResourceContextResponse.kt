package com.lhs.share.hub.controller.inventory.response

data class DrawResourceContextResponse(
    val accountId: String,
    val game: String,
    val inventoryRevision: Long,
    val balances: Map<String, Long?>,
)
