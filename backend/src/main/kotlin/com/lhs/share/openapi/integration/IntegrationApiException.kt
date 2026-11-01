package com.lhs.share.openapi.integration

import org.springframework.http.HttpStatus

class IntegrationApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
) : RuntimeException(message)

data class IntegrationError(
    val code: String,
    val message: String,
)

data class IntegrationErrorResponse(
    val error: IntegrationError,
)
