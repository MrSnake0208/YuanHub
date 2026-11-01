package com.lhs.share.hub.service.inventory

import org.springframework.http.HttpStatus

class InventoryApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
    val recordId: String? = null,
    val entryId: String? = null,
) : RuntimeException(message)
