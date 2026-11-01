package com.lhs.share.hub.controller.ledger

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.ledger.request.LedgerCampaignWrite
import com.lhs.share.hub.controller.ledger.request.LedgerCatalogDecoder
import com.lhs.share.hub.controller.ledger.request.LedgerPackageWrite
import com.lhs.share.hub.controller.ledger.request.LedgerSettingsWrite
import com.lhs.share.hub.repository.entity.LedgerCampaign
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.ledger.LedgerCatalogException
import com.lhs.share.hub.service.ledger.LedgerCatalogResponse
import com.lhs.share.hub.service.ledger.LedgerCatalogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Ledger Public Catalog")
@RestController
@RequestMapping("/hub/ledger/catalog")
class LedgerCatalogController(private val service: LedgerCatalogService) {
    @GetMapping
    fun catalog() = ResponseEntity.ok().header("Cache-Control", "no-store").body(success(service.catalog()))
}

@Tag(name = "Ledger Catalog Admin")
@RestController
@RequireJwt
@RequestMapping("/v1/admin/ledger")
class AdminLedgerCatalogController(
    private val service: LedgerCatalogService,
    private val helper: AuthenticationHelper,
    private val authorization: AdminAuthorizationService,
    mapper: ObjectMapper,
) {
    private val decoder = LedgerCatalogDecoder(mapper)

    @GetMapping
    fun catalog(): ResponseEntity<ApiResult<LedgerCatalogResponse>> {
        actor()
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(success(service.catalog(true)))
    }

    @Operation(
        summary = "新增公共礼包，后端分配永久ID",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerPackageWrite::class))],
        ),
    )
    @PostMapping("/packages")
    fun createPackage(@RequestBody body: JsonNode) =
        success(service.savePackage(actor(), null, decoder.read(body, LedgerPackageWrite::class.java)))

    @Operation(
        summary = "按expected_version更新或软停用礼包",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerPackageWrite::class))],
        ),
    )
    @PutMapping("/packages/{id}")
    fun updatePackage(@PathVariable id: String, @RequestBody body: JsonNode) =
        success(service.savePackage(actor(), id, decoder.read(body, LedgerPackageWrite::class.java)))

    @Operation(
        summary = "只读校验活动预览，不写入",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerCampaignWrite::class))],
        ),
    )
    @PostMapping("/campaigns/preview")
    fun preview(@RequestBody body: JsonNode): ResponseEntity<ApiResult<LedgerCampaign>> {
        actor()
        return ResponseEntity.ok(success(service.previewCampaign(decoder.read(body, LedgerCampaignWrite::class.java))))
    }

    @Operation(
        summary = "新增累充活动",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerCampaignWrite::class))],
        ),
    )
    @PostMapping("/campaigns")
    fun createCampaign(@RequestBody body: JsonNode) =
        success(service.saveCampaign(actor(), null, decoder.read(body, LedgerCampaignWrite::class.java)))

    @Operation(
        summary = "按expected_version更新、发布或停用活动",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerCampaignWrite::class))],
        ),
    )
    @PutMapping("/campaigns/{id}")
    fun updateCampaign(@PathVariable id: String, @RequestBody body: JsonNode) =
        success(service.saveCampaign(actor(), id, decoder.read(body, LedgerCampaignWrite::class.java)))

    @Operation(
        summary = "按expected_version设置默认参考汇率",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = LedgerSettingsWrite::class))],
        ),
    )
    @PutMapping("/settings")
    fun settings(@RequestBody body: JsonNode) = success(service.saveSettings(actor(), decoder.read(body, LedgerSettingsWrite::class.java)))
    private fun actor(): String {
        val user = helper.requireUserId()
        if (!authorization.hasPermission(user, AdminPermission.LEDGER_CATALOG_WRITE)) {
            throw LedgerCatalogException(HttpStatus.FORBIDDEN, "需要广陵账房公共数据维护权限")
        }
        return user
    }
}
