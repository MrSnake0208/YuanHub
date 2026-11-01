package com.lhs.share.handler

import com.fasterxml.jackson.core.JsonParseException
import com.lhs.share.hub.controller.account.AccountController
import com.lhs.share.hub.controller.achievement.AchievementController
import com.lhs.share.hub.controller.inventory.InventoryController
import com.lhs.share.hub.controller.inventory.response.InventoryError
import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import com.lhs.share.hub.controller.star.StarCaptureController
import com.lhs.share.hub.controller.star.StarCompletionController
import com.lhs.share.hub.controller.star.StarLoadoutController
import com.lhs.share.hub.controller.star.StarLoadoutPresetController
import com.lhs.share.hub.controller.star.StarStateController
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiInventoryController
import com.lhs.share.openapi.OpenApiStarCaptureController
import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.context.request.async.AsyncRequestNotUsableException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

private val inventoryLog = KotlinLogging.logger { }

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(
    assignableTypes = [
        AccountController::class,
        AchievementController::class,
        com.lhs.share.hub.controller.achievement.AchievementSuggestionController::class,
        com.lhs.share.hub.controller.achievement.AdminAchievementSuggestionController::class,
        com.lhs.share.hub.controller.bond.BondController::class,
        com.lhs.share.hub.controller.bond.BondCatalogAdminController::class,
        com.lhs.share.hub.controller.achievement.AchievementCatalogAdminController::class,
        InventoryController::class,
        com.lhs.share.hub.controller.inventory.DrawResourceController::class,
        com.lhs.share.hub.controller.inventory.MailboxReserveController::class,
        com.lhs.share.hub.controller.inventory.MailboxClaimController::class,
        StarStateController::class,
        StarCompletionController::class,
        StarLoadoutController::class,
        StarLoadoutPresetController::class,
        StarCaptureController::class,
        com.lhs.share.hub.controller.star.StarScanController::class,
        com.lhs.share.openapi.OpenApiStarScanController::class,
        OpenApiInventoryController::class,
        OpenApiStarCaptureController::class,
    ],
)
class InventoryExceptionHandler {
    @ExceptionHandler(InventoryApiException::class)
    fun inventoryException(e: InventoryApiException): ResponseEntity<InventoryErrorResponse> = response(
        e.status,
        e.code,
        e.message,
        e.recordId,
        e.entryId,
    )

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(e: HttpMessageNotReadableException, request: HttpServletRequest): ResponseEntity<InventoryErrorResponse> {
        val invalidJson = generateSequence<Throwable>(e) { it.cause }.any { it is JsonParseException }
        return if (invalidJson) {
            response(HttpStatus.BAD_REQUEST, "invalid_json", "Request body is not valid JSON")
        } else {
            response(HttpStatus.UNPROCESSABLE_ENTITY, request.snapshotValidationCode(), "Request body does not match the inventory schema")
        }
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun invalidArgument(e: MethodArgumentNotValidException, request: HttpServletRequest): ResponseEntity<InventoryErrorResponse> {
        val message = e.bindingResult.fieldError?.defaultMessage ?: "Request body does not match the inventory schema"
        return response(HttpStatus.UNPROCESSABLE_ENTITY, request.snapshotValidationCode(), message)
    }

    @ExceptionHandler(ConstraintViolationException::class, MethodArgumentTypeMismatchException::class, IllegalArgumentException::class)
    fun invalidQuery(e: RuntimeException, request: HttpServletRequest): ResponseEntity<InventoryErrorResponse> = response(
        HttpStatus.UNPROCESSABLE_ENTITY,
        if (request.method == "POST" && request.requestURI == "/v1/star-state/completions") {
            "star_completion_invalid_request"
        } else {
            "schema_validation_failed"
        },
        e.message ?: "Invalid request parameter",
    )

    @ExceptionHandler(MissingServletRequestParameterException::class)
    fun missingQuery(e: MissingServletRequestParameterException): ResponseEntity<InventoryErrorResponse> =
        response(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Missing query parameter: ${e.parameterName}")

    /** SSE clients can disconnect while a scheduled heartbeat is being written. */
    @ExceptionHandler(AsyncRequestNotUsableException::class)
    fun clientDisconnected(e: AsyncRequestNotUsableException): ResponseEntity<Void> {
        inventoryLog.debug { "SSE client disconnected: ${e.message}" }
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler(Exception::class)
    fun unexpected(e: Exception, request: HttpServletRequest): ResponseEntity<InventoryErrorResponse> {
        inventoryLog.error(e) { "Unexpected inventory API error: ${request.method} ${request.requestURI}" }
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Unexpected server error")
    }

    private fun response(
        status: HttpStatus,
        code: String,
        message: String,
        recordId: String? = null,
        entryId: String? = null,
    ): ResponseEntity<InventoryErrorResponse> = ResponseEntity.status(status).body(
        InventoryErrorResponse(InventoryError(code, message, recordId, entryId)),
    )

    private fun HttpServletRequest.snapshotValidationCode(): String {
        return when {
            requestURI.startsWith("/v1/star-state/completions") -> "star_completion_invalid_request"
            requestURI.startsWith("/v1/star-state") -> "star_state_invalid_snapshot"
            requestURI.startsWith("/v1/star-loadout-presets") -> "star_loadout_preset_invalid_snapshot"
            requestURI.startsWith("/v1/star-loadout") -> "star_loadout_invalid_snapshot"
            else -> "schema_validation_failed"
        }
    }
}
