package com.lhs.share.openapi

import com.lhs.share.config.doc.InventoryReadResponses
import com.lhs.share.config.doc.InventoryWriteResponses
import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.response.InventoryCurrentResponse
import com.lhs.share.hub.controller.inventory.response.InventoryExportResponse
import com.lhs.share.hub.controller.inventory.response.InventoryImportEvent
import com.lhs.share.hub.controller.inventory.response.InventoryImportResult
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime

/**
 * 第三方 API 示例接口(使用 API Token 认证,非 JWT)
 *
 * 从 Authorization 请求头取 "Bearer <token>" 校验,复用 InventoryService。
 */
@Tag(name = "OpenAPI Inventory")
@RequestMapping("/open-api", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class OpenApiInventoryController(
    private val tokenService: OpenApiTokenService,
    private val inventoryService: InventoryService,
    private val accountService: SubAccountService,
    private val eventService: AccountEventService,
) {
    @Operation(summary = "Token 绑定的子账号")
    @InventoryReadResponses
    @RequireOpenApiToken
    @GetMapping("/inventory/account")
    fun inventoryAccount(
        @Parameter(hidden = true)
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ApiResult<SubAccountResponse> {
        val principal = tokenService.authenticateAuthorization(authorization)
        return success(accountService.requireAccount(principal.userId, principal.accountId).let(SubAccountResponse::of))
    }

    /**
     * 当前库存(第三方只读示例,需 API Token 且具备 inventory:read 权限)
     */
    @Operation(summary = "当前库存")
    @InventoryReadResponses
    @RequireOpenApiToken
    @GetMapping("/inventory/current")
    fun inventoryCurrent(
        @Parameter(hidden = true)
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @Parameter(schema = Schema(allowableValues = ["item", "agent"]))
        @RequestParam(name = "entity_type", required = false) entityType: String?,
    ): ApiResult<List<InventoryCurrentResponse>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.INVENTORY_READ)
        return success(inventoryService.current(principal.userId, principal.accountId, entityType))
    }

    @Operation(summary = "导入库存/奖励")
    @InventoryWriteResponses
    @RequireOpenApiToken
    @PostMapping("/inventory/import", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun inventoryImport(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @Valid @RequestBody request: InventoryImportRequest,
    ): ApiResult<InventoryImportResult> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.INVENTORY_WRITE)
        val connectionId = tokenService.connectionIdForAuthorization(authorization, principal)
        val result = inventoryService.importFromConnection(principal.userId, principal.accountId, connectionId, request)
        val event = InventoryImportEvent.of(principal.accountId, request, result)
        eventService.publish(
            principal.userId,
            principal.accountId,
            INVENTORY_EVENT_NAME,
            event.eventId,
            event,
        )
        return success(result)
    }

    @Operation(summary = "导出库存交换文档")
    @InventoryReadResponses
    @RequireOpenApiToken
    @GetMapping("/inventory/export")
    fun inventoryExport(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @Parameter(schema = Schema(allowableValues = ["current", "current,rewards"]))
        @RequestParam(name = "include", required = false, defaultValue = "current") include: String,
        @RequestParam(name = "from", required = false) from: OffsetDateTime?,
        @RequestParam(name = "to", required = false) to: OffsetDateTime?,
    ): InventoryExportResponse {
        if (include != "current" && include != "current,rewards") {
            throw com.lhs.share.hub.service.inventory.InventoryApiException(
                org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "include must be current or current,rewards",
            )
        }
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.INVENTORY_EXPORT)
        return inventoryService.export(
            principal.userId,
            principal.accountId,
            null,
            include == "current,rewards",
            from?.toInstant(),
            to?.toInstant(),
        )
    }

    companion object {
        const val INVENTORY_EVENT_NAME = "inventory_import"
    }
}
