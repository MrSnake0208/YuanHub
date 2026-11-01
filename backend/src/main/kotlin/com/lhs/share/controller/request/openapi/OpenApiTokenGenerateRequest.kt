package com.lhs.share.controller.request.openapi

import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/**
 * 生成第三方 API Token 请求
 *
 * account_id 为统一子账号(库存 × 密探共用);可访问域由 scopes 声明,
 * 允许同时包含 inventory:* 与 operator:*。
 */
data class OpenApiTokenGenerateRequest(
    @field:NotBlank(message = "account_id 不能为空")
    @field:Size(min = 1, max = 64, message = "account_id 长度须在 1..64")
    @field:Pattern(
        regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
        message = "account_id 格式无效",
    )
    val accountId: String,

    /**
     * Public stable scope keys. Integer permission codes remain an internal detail.
     */
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

    /**
     * 备注,可空
     */
    val remark: String?,
)
