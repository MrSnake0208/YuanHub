package com.lhs.share.hub.service.changelog

import org.springframework.http.HttpStatus

class ChangelogApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
    val fieldPath: String? = null,
) : RuntimeException(message)
