package com.lhs.share.openapi

import com.lhs.share.config.doc.OpenApiTokenDeleteResponses
import com.lhs.share.config.doc.OpenApiTokenGenerateResponses
import com.lhs.share.config.doc.OpenApiTokenListResponses
import com.lhs.share.config.doc.OpenApiTokenScopesUpdateResponses
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.request.openapi.OpenApiTokenGenerateRequest
import com.lhs.share.controller.request.openapi.OpenApiTokenScopesUpdateRequest
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.inventory.InventoryService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

/**
 * 第三方 API Token 管理接口
 *
 * 生成/删除/列举/按需复制均需登录;权限列表公开(见 SecurityConfig.URL_PERMIT_ALL)。
 */
@Tag(name = "OpenAPI Token")
@RequestMapping("/user/open-api", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class OpenApiTokenController(
    private val tokenService: OpenApiTokenService,
    private val helper: AuthenticationHelper,
    private val inventoryService: InventoryService,
) {
    /**
     * 生成第三方 API Token(需登录)
     */
    @Operation(summary = "生成第三方 API Token")
    @RequireJwt
    @OpenApiTokenGenerateResponses
    @PostMapping("/token", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun generate(@Valid @RequestBody request: OpenApiTokenGenerateRequest): ApiResult<OpenApiTokenCreatedResponse> =
        success(tokenService.generate(helper.requireUserId(), request.accountId, request.scopes, request.remark))

    /**
     * 权限列表(公开,无需登录)
     */
    @Operation(summary = "权限列表")
    @GetMapping("/permissions")
    fun permissions(): ApiResult<List<OpenApiPermissionDto>> = success(OpenApiPermission.listAll())

    /**
     * 列举当前用户的 token(需登录)
     */
    @Operation(summary = "列举当前用户的 token")
    @RequireJwt
    @OpenApiTokenListResponses
    @GetMapping("/tokens")
    fun tokens(): ApiResult<List<OpenApiTokenListItemDto>> = success(tokenService.list(helper.requireUserId()))

    @Operation(summary = "按需复制本人连接码", description = "仅在用户主动复制时返回明文，禁止缓存")
    @RequireJwt
    @GetMapping("/tokens/{tokenId}/secret")
    fun secret(@PathVariable tokenId: String): ResponseEntity<ApiResult<OpenApiTokenSecretResponse>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            success(OpenApiTokenSecretResponse(tokenService.secret(helper.requireUserId(), tokenId))),
        )

    @Operation(summary = "验证本人连接的首次库存同步", description = "仅返回已生效的真实库存记录；历史无连接来源的记录不追认")
    @RequireJwt
    @GetMapping("/tokens/{tokenId}/first-sync")
    fun firstSync(@PathVariable tokenId: String): ResponseEntity<ApiResult<ConnectionFirstSyncResponse>> {
        val userId = helper.requireUserId()
        val accountId = tokenService.accountIdForToken(userId, tokenId)
        val record = inventoryService.firstConnectionSync(userId, accountId, tokenId)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            success(ConnectionFirstSyncResponse(tokenId, accountId, record != null, record?.recordId, record?.receivedAt)),
        )
    }

    /**
     * 完整替换第三方 API Token 权限(需登录),不改变 Token 明文。
     */
    @Operation(summary = "更新第三方 API Token 权限", description = "完整替换 scopes；Token 明文保持不变，权限变更立即生效")
    @RequireJwt
    @OpenApiTokenScopesUpdateResponses
    @PatchMapping("/tokens/{tokenId}/scopes", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun updateScopes(
        @PathVariable tokenId: String,
        @Valid @RequestBody request: OpenApiTokenScopesUpdateRequest,
    ): ApiResult<OpenApiTokenListItemDto> = success(tokenService.updateScopes(helper.requireUserId(), tokenId, request.scopes))

    /**
     * 删除第三方 API Token(需登录)
     */
    @Operation(summary = "删除第三方 API Token")
    @RequireJwt
    @OpenApiTokenDeleteResponses
    @DeleteMapping("/tokens/{tokenId}")
    fun delete(@PathVariable tokenId: String): ApiResult<Unit> {
        tokenService.delete(helper.requireUserId(), tokenId)
        return success()
    }
}

data class OpenApiTokenSecretResponse(val token: String)

data class ConnectionFirstSyncResponse(
    val connectionId: String,
    val accountId: String,
    val synced: Boolean,
    val recordId: String? = null,
    val receivedAt: Instant? = null,
    val dataType: String = "inventory",
)
