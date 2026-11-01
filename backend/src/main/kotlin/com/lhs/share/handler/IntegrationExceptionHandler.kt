package com.lhs.share.handler

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.openapi.feedback.OpenApiFeedbackController
import com.lhs.share.openapi.integration.IntegrationApiException
import com.lhs.share.openapi.integration.IntegrationError
import com.lhs.share.openapi.integration.IntegrationErrorResponse
import com.lhs.share.openapi.integration.IntegrationTokenController
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(
    assignableTypes = [
        IntegrationTokenController::class,
        OpenApiFeedbackController::class,
    ],
)
class IntegrationExceptionHandler {
    @ExceptionHandler(IntegrationApiException::class)
    fun integrationException(error: IntegrationApiException): ResponseEntity<IntegrationErrorResponse> =
        response(error.status, error.code, error.message)

    @ExceptionHandler(ApiResultException::class)
    fun feedbackException(error: ApiResultException): ResponseEntity<IntegrationErrorResponse> {
        val status = HttpStatus.resolve(error.statusCode) ?: HttpStatus.BAD_REQUEST
        val code = when {
            status == HttpStatus.CONFLICT && error.message == "ticket_changed" -> "ticket_changed"
            status == HttpStatus.FORBIDDEN -> "feedback_forbidden"
            status == HttpStatus.NOT_FOUND -> "feedback_not_found"
            status == HttpStatus.CONFLICT -> "feedback_conflict"
            else -> "feedback_invalid_request"
        }
        return response(status, code, error.message ?: "Feedback request failed")
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun invalidArgument(error: MethodArgumentNotValidException): ResponseEntity<IntegrationErrorResponse> {
        val message = error.bindingResult.fieldError?.defaultMessage ?: "Request body validation failed"
        return response(HttpStatus.BAD_REQUEST, "schema_validation_failed", message)
    }

    @ExceptionHandler(ResponseStatusException::class)
    fun responseStatus(error: ResponseStatusException): ResponseEntity<IntegrationErrorResponse> {
        val status = HttpStatus.resolve(error.statusCode.value()) ?: HttpStatus.INTERNAL_SERVER_ERROR
        val code = if (status == HttpStatus.NOT_FOUND) "feedback_attachment_not_found" else "integration_request_failed"
        return response(status, code, error.reason ?: "Integration request failed")
    }

    private fun response(status: HttpStatus, code: String, message: String): ResponseEntity<IntegrationErrorResponse> =
        ResponseEntity.status(status).body(IntegrationErrorResponse(IntegrationError(code, message)))
}
