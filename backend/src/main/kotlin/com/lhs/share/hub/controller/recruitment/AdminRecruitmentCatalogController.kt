package com.lhs.share.hub.controller.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRequestDecoder
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogImportResponse
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.recruitment.RecruitmentApiException
import com.lhs.share.hub.service.recruitment.RecruitmentCatalog
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Recruitment Catalog Admin", description = "管理招募卡池及稳定UP占位身份")
@RestController
@RequireJwt
@RequestMapping("/v1/admin/recruitment-catalog", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminRecruitmentCatalogController(
    private val catalog: RecruitmentCatalog,
    private val helper: AuthenticationHelper,
    private val authorization: AdminAuthorizationService,
    mapper: ObjectMapper,
) {
    private val decoder = RecruitmentRequestDecoder(mapper)

    @Operation(summary = "查看招募卡池目录（含隐藏、停用卡池及退役UP槽）")
    @GetMapping
    fun list(): ApiResult<RecruitmentCatalogAdminResponse> {
        requireAdmin()
        return success(catalog.listForAdmin())
    }

    @Operation(summary = "新增管理员招募卡池")
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@RequestBody body: JsonNode): ApiResult<RecruitmentCatalogPool> {
        val actor = requireAdmin()
        return success(catalog.create(actor, decoder.read(body, RecruitmentCatalogWriteRequest::class.java)))
    }

    @Operation(summary = "批量导入招募卡池，仅新增不存在的卡池")
    @PostMapping("/import", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun importCatalog(@RequestBody body: JsonNode): ApiResult<RecruitmentCatalogImportResponse> {
        val actor = requireAdmin()
        return success(catalog.importCatalog(actor, body))
    }

    @Operation(summary = "按版本更新招募卡池，保留原UP槽身份")
    @PutMapping("/{poolId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable poolId: String, @RequestBody body: JsonNode): ApiResult<RecruitmentCatalogPool> {
        val actor = requireAdmin()
        return success(catalog.update(actor, poolId, decoder.read(body, RecruitmentCatalogWriteRequest::class.java)))
    }

    private fun requireAdmin(): String {
        val actor = helper.requireUserId()
        if (!authorization.hasPermission(actor, AdminPermission.RECRUITMENT_CATALOG_WRITE)) {
            throw RecruitmentApiException(HttpStatus.FORBIDDEN, "forbidden", "需要招募卡池目录管理权限")
        }
        return actor
    }
}
