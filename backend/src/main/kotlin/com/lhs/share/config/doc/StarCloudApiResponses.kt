package com.lhs.share.config.doc

import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses

private const val JSON = "application/json"

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(value = [
    ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
    ApiResponse(responseCode = "400", description = "invalid_json", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "401", description = "unauthorized", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "403", description = "forbidden", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "404", description = "account_not_found or star_recovery_point_not_found", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "409", description = "star_generation_changed, star_state_revision_conflict, or star_loadout_revision_conflict", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "422", description = "schema_validation_failed or star_state_invalid_snapshot", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "500", description = "Unexpected server error", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
])
annotation class StarStateWriteResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(value = [
    ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
    ApiResponse(responseCode = "400", description = "invalid_json", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "401", description = "unauthorized", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "403", description = "forbidden", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "404", description = "account_not_found", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "409", description = "star_generation_changed or star_loadout_revision_conflict", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "422", description = "star_loadout_invalid_snapshot, star_loadout_invalid_reference, star_loadout_invalid_operator, star_loadout_slot_kind_mismatch, star_loadout_instance_occupied, or star_loadout_inventory_required", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
    ApiResponse(responseCode = "500", description = "Unexpected server error", content = [Content(mediaType = JSON, schema = Schema(implementation = InventoryErrorResponse::class))]),
])
annotation class StarLoadoutWriteResponses
