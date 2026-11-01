package com.lhs.share.hub.controller.operator

import com.lhs.share.config.doc.OperatorAdminResponses
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.operator.request.OperatorCatalogWriteRequest
import com.lhs.share.hub.controller.operator.response.AdminOperatorCatalogResponse
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

/**
 * 密探公共 API（公共图鉴）的管理员管理端点。
 *
 * 概念边界（与 `docs/operator-subaccounts-implementation-plan.md` §6 一致）：
 * - **公共开放 API（图鉴）**：`GET /v1/operator/catalog`，无需登录，回答"有哪些密探、长什么样"。
 * - **个人数据 API**：路径前缀 `/v1/operator`（除 catalog）与 `/open-api/operator`，登录 JWT / OpenAPI token，
 *   只能访问自己的密探养成档案。
 * - **本控制器（管理 API）**：路径前缀 `/v1/admin/operator-catalog`，管理员对支撑公共图鉴的
 *   `operator_catalog` 全局字典做增删改查。改动即时反映到公共图鉴；**不涉及**任何个人子账号密探数据。
 *
 * 权限：所有端点需要 JWT 登录和 `operator_catalog:write` 权限，否则返回 403 `forbidden`。
 */
@Tag(name = "Operator Admin", description = "密探公共API管理（平台管理员或超级管理员）")
@RestController
@RequestMapping("/v1/admin/operator-catalog", produces = [MediaType.APPLICATION_JSON_VALUE])
@RequireJwt
class AdminOperatorCatalogController(
    private val catalogService: OperatorCatalogService,
    private val helper: AuthenticationHelper,
    private val authorizationService: AdminAuthorizationService,
) {
    /**
     * 管理员查看密探目录全量（含内部字段 starStones / catalogVersion / createdAt，
     * 比公共图鉴多，供管理端编辑展示使用）。
     */
    @Operation(summary = "管理员查看密探公共图鉴全量（含内部字段）")
    @OperatorAdminResponses
    @GetMapping
    fun list(): ApiResult<List<AdminOperatorCatalogResponse>> {
        requireAdmin()
        return success(catalogService.listForAdmin())
    }

    /**
     * 管理员新增一条密探目录（新密探 / SP 形态）。
     */
    @Operation(summary = "管理员新增密探目录条目")
    @OperatorAdminResponses
    @PostMapping
    fun create(@Valid @RequestBody request: OperatorCatalogWriteRequest): ApiResult<AdminOperatorCatalogResponse> {
        requireAdmin()
        return success(catalogService.create(request))
    }

    /**
     * 管理员更新一条密探目录（path id 与 body id 必须一致）。
     */
    @Operation(summary = "管理员更新密探目录条目")
    @OperatorAdminResponses
    @PutMapping("/{operatorId}")
    fun update(
        @PathVariable operatorId: String,
        @Valid @RequestBody request: OperatorCatalogWriteRequest,
    ): ApiResult<AdminOperatorCatalogResponse> {
        requireAdmin()
        return success(catalogService.update(operatorId, request))
    }

    /**
     * 管理员删除一条密探目录。
     */
    @Operation(summary = "管理员删除密探目录条目")
    @OperatorAdminResponses
    @DeleteMapping("/{operatorId}")
    fun delete(@PathVariable operatorId: String): ApiResult<Boolean> {
        requireAdmin()
        catalogService.delete(operatorId)
        return success(true)
    }

    /**
     * 管理员上传/替换密探头像（webp，≤500KB）。
     * 落盘为 {avatarDir}/{operatorId}.webp 并把相对路径写入字典，即时反映到公共图鉴；
     * 同 id 重传即幂等覆盖。
     */
    @Operation(summary = "管理员上传密探头像")
    @OperatorAdminResponses
    @PutMapping("/{operatorId}/avatar", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadAvatar(@PathVariable operatorId: String, @RequestPart file: MultipartFile): ApiResult<AdminOperatorCatalogResponse> {
        requireAdmin()
        return success(catalogService.setAvatar(operatorId, file))
    }

    /**
     * 管理员删除密探头像：移除磁盘文件并置空字典字段。
     */
    @Operation(summary = "管理员删除密探头像")
    @OperatorAdminResponses
    @DeleteMapping("/{operatorId}/avatar")
    fun deleteAvatar(@PathVariable operatorId: String): ApiResult<AdminOperatorCatalogResponse> {
        requireAdmin()
        return success(catalogService.clearAvatar(operatorId))
    }

    private fun requireAdmin() {
        if (!authorizationService.hasPermission(helper.requireUserId(), AdminPermission.OPERATOR_CATALOG_WRITE)) {
            throw OperatorApiException(HttpStatus.FORBIDDEN, "forbidden", "Administrator privileges are required")
        }
    }
}
