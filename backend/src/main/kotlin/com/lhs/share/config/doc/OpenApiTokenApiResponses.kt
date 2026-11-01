package com.lhs.share.config.doc

import com.lhs.share.controller.response.ApiResult
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
            description = "Invalid request",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "401",
            description = "Unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "Inventory account not found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "429",
            description = "Token limit reached",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
    ],
)
annotation class OpenApiTokenGenerateResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "401",
            description = "Unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
    ],
)
annotation class OpenApiTokenListResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "400",
            description = "Invalid scopes",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "401",
            description = "Unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "Token not found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
    ],
)
annotation class OpenApiTokenScopesUpdateResponses

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "401",
            description = "Unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "Token not found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = ApiResult::class))],
        ),
    ],
)
annotation class OpenApiTokenDeleteResponses
