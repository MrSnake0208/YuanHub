package com.lhs.share.handler

import com.lhs.share.hub.service.beta.BetaApiException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
class BetaExceptionHandler {
    @ExceptionHandler(BetaApiException::class)
    fun handle(error: BetaApiException): ResponseEntity<Map<String, Any>> = ResponseEntity
        .status(error.status)
        .cacheControl(CacheControl.noStore())
        .body(mapOf("error" to mapOf("code" to error.code, "message" to error.message)))
}
