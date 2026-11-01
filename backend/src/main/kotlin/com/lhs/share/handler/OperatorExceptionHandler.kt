package com.lhs.share.handler

import com.lhs.share.hub.controller.operator.AdminOperatorCatalogController
import com.lhs.share.hub.controller.operator.OperatorController
import com.lhs.share.hub.controller.operator.OperatorDailyTasksController
import com.lhs.share.hub.controller.operator.OperatorOrganizationController
import com.lhs.share.hub.controller.operator.OperatorPlannerController
import com.lhs.share.hub.controller.operator.OperatorReserveWorkspaceController
import com.lhs.share.hub.controller.operator.response.OperatorError
import com.lhs.share.hub.controller.operator.response.OperatorErrorResponse
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.openapi.OpenApiOperatorController
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(
    assignableTypes = [
        OperatorController::class,
        com.lhs.share.hub.controller.operator.OperatorResetController::class,
        com.lhs.share.hub.controller.operator.OperatorPanelController::class,
        com.lhs.share.hub.controller.operator.OperatorRelationshipController::class,
        OperatorPlannerController::class,
        com.lhs.share.hub.controller.operator.OperatorCustomSpendTemplatesController::class,
        OperatorReserveWorkspaceController::class,
        OperatorDailyTasksController::class,
        OperatorOrganizationController::class,
        OpenApiOperatorController::class,
        AdminOperatorCatalogController::class,
        com.lhs.share.hub.controller.account.AccountShareController::class,
        com.lhs.share.hub.controller.star.StarShareController::class,
    ],
)
class OperatorExceptionHandler {
    @ExceptionHandler(OperatorApiException::class)
    fun api(e: OperatorApiException) = ResponseEntity
        .status(e.status).header("Cache-Control", "no-store").body(
            OperatorErrorResponse(OperatorError(e.code, e.message, e.recordId, e.entryId, e.operatorId, e.fieldPath)),
        )

    @ExceptionHandler(InventoryApiException::class)
    fun token(e: InventoryApiException) = ResponseEntity
        .status(e.status).body(OperatorErrorResponse(OperatorError(e.code, e.message, e.recordId, e.entryId)))

    @ExceptionHandler(MethodArgumentNotValidException::class, HttpMessageNotReadableException::class)
    fun invalid(e: Exception) = ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(
        OperatorErrorResponse(
            OperatorError(
                "schema_validation_failed",
                e.message ?: "Invalid request",
            ),
        ),
    )
}
