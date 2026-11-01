package com.lhs.share.hub.service.level

import org.springframework.http.HttpStatus

class LevelCatalogApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
    val levelKey: String? = null,
    val fieldPath: String? = null,
) : RuntimeException(message)
