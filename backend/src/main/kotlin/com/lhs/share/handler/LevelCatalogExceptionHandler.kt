package com.lhs.share.handler

import com.lhs.share.hub.controller.level.AdminLevelCatalogController
import com.lhs.share.hub.controller.level.LevelCatalogController
import com.lhs.share.hub.controller.level.response.LevelCatalogError
import com.lhs.share.hub.controller.level.response.LevelCatalogErrorResponse
import com.lhs.share.hub.service.level.LevelCatalogApiException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [LevelCatalogController::class, AdminLevelCatalogController::class])
class LevelCatalogExceptionHandler {
    @ExceptionHandler(LevelCatalogApiException::class)
    fun api(e: LevelCatalogApiException): ResponseEntity<LevelCatalogErrorResponse> = response(
        e.status,
        LevelCatalogError(e.code, e.message, e.levelKey, e.fieldPath),
    )

    @ExceptionHandler(MethodArgumentNotValidException::class, HttpMessageNotReadableException::class)
    fun invalid(e: Exception): ResponseEntity<LevelCatalogErrorResponse> = response(
        HttpStatus.UNPROCESSABLE_ENTITY,
        LevelCatalogError("schema_validation_failed", e.message ?: "Invalid request"),
    )

    private fun response(status: HttpStatus, error: LevelCatalogError): ResponseEntity<LevelCatalogErrorResponse> =
        ResponseEntity.status(status).body(LevelCatalogErrorResponse(error))
}
