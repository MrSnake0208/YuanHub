package com.lhs.share.config.doc

import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(
            responseCode = "200",
            description = "Committed receipt (or original receipt on an identical retry)",
            useReturnTypeSchema = true,
        ),
        ApiResponse(
            responseCode = "400",
            description = "invalid_json",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "account_not_found or star_instance_not_found",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "409",
            description = "star_generation_changed, star_state_revision_conflict, inventory_state_stale, " +
                "star_level_changed, star_plan_changed, insufficient_inventory, insufficient_star_experience, " +
                "star_experience_unknown, star_bottle_inventory_unknown, star_completion_idempotency_conflict, " +
                "account_state_stale, star_completion_concurrent_change",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "star_completion_invalid_request, star_completion_duplicate_instance, " +
                "star_completion_invalid_breakthrough, star_bottle_consumption_mismatch",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "internal_error; preserve operation ID and query/retry before confirming another command",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "503",
            description = "star_completion_result_unknown; query receipt or retry original body and operation ID",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class StarCompletionWriteResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "account_not_found or star_completion_not_found",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "schema_validation_failed",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "internal_error",
            content = [Content(schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class StarCompletionReadResponses
