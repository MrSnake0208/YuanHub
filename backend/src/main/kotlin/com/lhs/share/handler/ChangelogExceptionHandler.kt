package com.lhs.share.handler

import com.lhs.share.hub.controller.changelog.AdminChangelogController
import com.lhs.share.hub.controller.changelog.ChangelogController
import com.lhs.share.hub.controller.changelog.response.ChangelogError
import com.lhs.share.hub.controller.changelog.response.ChangelogErrorResponse
import com.lhs.share.hub.service.changelog.ChangelogApiException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [ChangelogController::class, AdminChangelogController::class])
class ChangelogExceptionHandler {
    @ExceptionHandler(ChangelogApiException::class)
    fun api(e: ChangelogApiException): ResponseEntity<ChangelogErrorResponse> =
        ResponseEntity.status(e.status).body(ChangelogErrorResponse(ChangelogError(e.code, e.message, e.fieldPath)))

    @ExceptionHandler(MethodArgumentNotValidException::class, HttpMessageNotReadableException::class)
    fun invalid(e: Exception): ResponseEntity<ChangelogErrorResponse> = ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
        .body(ChangelogErrorResponse(ChangelogError("schema_validation_failed", e.message ?: "Invalid request")))
}
