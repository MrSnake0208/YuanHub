package com.lhs.share.config.doc

import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses

private const val JSON = "application/json"

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "400",
            description = "invalid_json",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "account_not_found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "409",
            description = "record_conflict or account_name_conflict",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "schema_validation_failed, unknown entity or agent, invalid agent id, or unsupported version",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class InventoryWriteResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(responseCode = "400", description = "invalid_json", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
        ApiResponse(responseCode = "401", description = "unauthorized", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
        ApiResponse(responseCode = "403", description = "forbidden", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
        ApiResponse(responseCode = "404", description = "account_not_found", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
        ApiResponse(
            responseCode = "409",
            description = "star_loadout_preset_revision_conflict",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "schema_validation_failed or star_loadout_preset_invalid_snapshot",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(responseCode = "500", description = "Unexpected server error", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ],
)
annotation class StarLoadoutPresetWriteResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "account_not_found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "schema_validation_failed",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class InventoryReadResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "record_not_found or account_not_found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class InventoryDeleteResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))],
        ),
    ],
)
annotation class InventoryPublicResponses
