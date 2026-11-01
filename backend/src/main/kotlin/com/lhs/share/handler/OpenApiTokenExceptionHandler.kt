package com.lhs.share.handler

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.openapi.OpenApiTokenController
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

private val log = KotlinLogging.logger { }

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [OpenApiTokenController::class])
class OpenApiTokenExceptionHandler {
    @ExceptionHandler(ApiResultException::class)
    fun handleApiResultException(e: ApiResultException): ResponseEntity<ApiResult<Nothing>> = response(e.statusCode, e.message)

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(e: MethodArgumentNotValidException): ResponseEntity<ApiResult<Nothing>> =
        response(HttpStatus.BAD_REQUEST.value(), e.bindingResult.fieldError?.defaultMessage ?: "Invalid request")

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun handleInvalidJson(e: HttpMessageNotReadableException): ResponseEntity<ApiResult<Nothing>> =
        response(HttpStatus.BAD_REQUEST.value(), "Invalid JSON")

    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatus(e: ResponseStatusException): ResponseEntity<ApiResult<Nothing>> = response(e.statusCode.value(), e.reason)

    @ExceptionHandler(Exception::class)
    fun handleUnexpected(e: Exception): ResponseEntity<ApiResult<Nothing>> {
        log.error(e) { "OpenAPI Token request failed unexpectedly" }
        return response(HttpStatus.INTERNAL_SERVER_ERROR.value(), "Internal server error")
    }

    private fun response(statusCode: Int, message: String?): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(statusCode).body(fail(statusCode, message))
}
