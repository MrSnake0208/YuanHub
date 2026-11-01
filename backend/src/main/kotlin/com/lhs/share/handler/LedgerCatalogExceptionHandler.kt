package com.lhs.share.handler

import com.lhs.share.hub.controller.ledger.AdminLedgerCatalogController
import com.lhs.share.hub.controller.ledger.LedgerCatalogController
import com.lhs.share.hub.service.ledger.LedgerCatalogException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [LedgerCatalogController::class, AdminLedgerCatalogController::class])
class LedgerCatalogExceptionHandler {
    @ExceptionHandler(LedgerCatalogException::class)
    fun api(error: LedgerCatalogException) = response(error.status, error.message)

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun invalid(error: HttpMessageNotReadableException) = response(HttpStatus.UNPROCESSABLE_ENTITY, "JSON字段或类型不正确")
    private fun response(status: HttpStatus, message: String) = ResponseEntity.status(status).body(
        mapOf("status_code" to status.value(), "message" to message),
    )
}
