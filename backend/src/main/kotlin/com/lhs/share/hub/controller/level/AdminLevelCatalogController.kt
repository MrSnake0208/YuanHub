package com.lhs.share.hub.controller.level

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.level.request.LevelCatalogRevisionRequest
import com.lhs.share.hub.controller.level.request.LevelCatalogWriteRequest
import com.lhs.share.hub.controller.level.response.LevelCatalogAdminResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogExportResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogHistoryResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogImportResponse
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.level.LevelCatalogApiException
import com.lhs.share.hub.service.level.LevelCatalogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Level Catalog Admin", description = "Manage the public level catalog")
@RestController
@RequireJwt
@RequestMapping("/v1/admin/level-catalog", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminLevelCatalogController(
    private val service: LevelCatalogService,
    private val helper: AuthenticationHelper,
    private val authorizationService: AdminAuthorizationService,
) {
    @Operation(summary = "List level catalog entries for administrators")
    @GetMapping
    fun list(
        @RequestParam(required = false) game: String?,
        @RequestParam(name = "cat_one", required = false) catOne: String?,
        @RequestParam(name = "cat_two", required = false) catTwo: String?,
        @RequestParam(required = false, name = "q") query: String?,
        @RequestParam(name = "include_archived", required = false, defaultValue = "true") includeArchived: Boolean,
        @RequestParam(name = "open_only", required = false, defaultValue = "false") openOnly: Boolean,
    ): ApiResult<List<LevelCatalogAdminResponse>> {
        requireAdmin()
        return success(service.listForAdmin(game, catOne, catTwo, query, includeArchived, openOnly))
    }

    @Operation(summary = "Create a level catalog entry")
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@Valid @RequestBody request: LevelCatalogWriteRequest): ApiResult<LevelCatalogAdminResponse> {
        requireAdmin()
        return success(service.create(helper.requireUserId(), request))
    }

    @Operation(summary = "Update a level catalog entry with optimistic locking")
    @PutMapping("/{levelKey}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(
        @PathVariable levelKey: String,
        @Valid @RequestBody request: LevelCatalogWriteRequest,
    ): ApiResult<LevelCatalogAdminResponse> {
        requireAdmin()
        return success(service.update(helper.requireUserId(), levelKey, request))
    }

    @Operation(summary = "Archive a level catalog entry")
    @PostMapping("/{levelKey}/archive")
    fun archive(
        @PathVariable levelKey: String,
        @RequestParam(name = "expected_revision", required = false) expectedRevision: Long?,
        @RequestBody(required = false) request: LevelCatalogRevisionRequest?,
    ): ApiResult<LevelCatalogAdminResponse> {
        requireAdmin()
        return success(service.archive(helper.requireUserId(), levelKey, revision(expectedRevision, request)))
    }

    @Operation(summary = "Restore an archived level catalog entry")
    @PostMapping("/{levelKey}/restore")
    fun restore(
        @PathVariable levelKey: String,
        @RequestParam(name = "expected_revision", required = false) expectedRevision: Long?,
        @RequestBody(required = false) request: LevelCatalogRevisionRequest?,
    ): ApiResult<LevelCatalogAdminResponse> {
        requireAdmin()
        return success(service.restore(helper.requireUserId(), levelKey, revision(expectedRevision, request)))
    }

    @Operation(summary = "Preview a level catalog import")
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewImport(@RequestBody body: JsonNode): ApiResult<LevelCatalogImportResponse> {
        requireAdmin()
        return success(service.previewImport(helper.requireUserId(), body))
    }

    @Operation(summary = "Commit a level catalog import")
    @PostMapping("/import/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commitImport(@RequestBody body: JsonNode): ApiResult<LevelCatalogImportResponse> {
        requireAdmin()
        return success(service.commitImport(helper.requireUserId(), body))
    }

    @Operation(summary = "Export the level catalog")
    @GetMapping("/export")
    fun export(): ApiResult<LevelCatalogExportResponse> {
        requireAdmin()
        return success(service.export())
    }

    @Operation(summary = "Read one level's revision history")
    @GetMapping("/{levelKey}/history")
    fun history(@PathVariable levelKey: String): ApiResult<List<LevelCatalogHistoryResponse>> {
        requireAdmin()
        return success(service.history(levelKey))
    }

    private fun revision(queryValue: Long?, request: LevelCatalogRevisionRequest?): Long =
        queryValue ?: request?.expectedRevision ?: throw LevelCatalogApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "schema_validation_failed",
            "expected_revision is required",
            fieldPath = "expected_revision",
        )

    private fun requireAdmin() {
        val userId = helper.requireUserId()
        if (!authorizationService.hasPermission(userId, AdminPermission.LEVEL_CATALOG_WRITE)) {
            throw LevelCatalogApiException(HttpStatus.FORBIDDEN, "forbidden", "Administrator privileges are required")
        }
    }
}
