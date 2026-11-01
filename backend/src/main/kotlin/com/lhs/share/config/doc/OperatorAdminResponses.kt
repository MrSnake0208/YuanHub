package com.lhs.share.config.doc

import com.lhs.share.hub.controller.operator.response.OperatorErrorResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses

private const val JSON = "application/json"

/**
 * 密探公共 API 管理员端点（路径前缀 `/v1/admin/operator-catalog`）统一响应文档。
 *
 * 仅拥有 `operator_catalog:write` 权限的平台管理员或超级管理员可访问；
 * 失败统一返回 [OperatorErrorResponse]。401 由 Spring Security 认证入口产生。
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@ApiResponses(
    value = [
        ApiResponse(responseCode = "200", description = "OK", useReturnTypeSchema = true),
        ApiResponse(
            responseCode = "400",
            description = "invalid_json",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "401",
            description = "unauthorized",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "403",
            description = "forbidden（非管理员）",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "404",
            description = "operator_not_found",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "409",
            description = "operator_conflict（id 已存在）",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "422",
            description = "schema_validation_failed / invalid_game / invalid_disc / invalid_star_stone / unknown_operator_id",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
        ApiResponse(
            responseCode = "500",
            description = "Unexpected server error",
            content = [Content(mediaType = JSON, schema = Schema(implementation = OperatorErrorResponse::class))],
        ),
    ],
)
annotation class OperatorAdminResponses
