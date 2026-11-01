package com.lhs.share.controller.request.openapi

import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotEmpty

/**
 * 完整替换第三方 API Token 权限的请求。
 */
data class OpenApiTokenScopesUpdateRequest(
    @field:NotEmpty(message = "scopes 不能为空")
    @field:ArraySchema(
        minItems = 1,
        uniqueItems = true,
        schema = Schema(
            allowableValues = [
                "inventory:read",
                "inventory:write",
                "inventory:export",
                "operator:read",
                "operator:write",
                "operator:export",
                "operator:scan:write",
            ],
        ),
    )
    val scopes: List<String>,
)
