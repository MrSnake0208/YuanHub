package com.lhs.share.hub.controller.inventory.response

import com.fasterxml.jackson.annotation.JsonInclude

data class InventoryErrorResponse(
    val error: InventoryError,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class InventoryError(
    val code: String,
    val message: String,
    val recordId: String? = null,
    val entryId: String? = null,
)
