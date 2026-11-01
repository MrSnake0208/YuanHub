package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.operator.request.OperatorCurrentPatchRequest
import com.lhs.share.hub.controller.operator.request.OperatorImportRequest
import com.lhs.share.hub.controller.operator.request.OperatorV3BrowserImportRequest
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorErrorResponse
import com.lhs.share.hub.controller.operator.response.OperatorImportResult
import com.lhs.share.hub.controller.operator.response.OperatorRecordPageResponse
import com.lhs.share.hub.controller.operator.response.OperatorScanReviewResponse
import com.lhs.share.hub.controller.operator.response.OperatorShareResponse
import com.lhs.share.hub.controller.operator.response.OperatorShareViewResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportCommitResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportPreviewResponse
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.operator.OperatorService
import com.lhs.share.hub.service.operator.OperatorShareService
import com.lhs.share.hub.service.operator.OperatorV3ImportService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@RequestMapping("/v1/operator", produces = [MediaType.APPLICATION_JSON_VALUE])
class OperatorController(
    private val service: OperatorService,
    private val catalogService: OperatorCatalogService,
    private val helper: AuthenticationHelper,
    private val v3ImportService: OperatorV3ImportService? = null,
    private val objectMapper: ObjectMapper = ObjectMapper().findAndRegisterModules(),
    private val subjectiveService: com.lhs.share.hub.service.operator.OperatorSubjectiveService? = null,
    private val upgradeService: com.lhs.share.hub.service.operator.OperatorUpgradeService? = null,
    private val v3ExportService: com.lhs.share.hub.service.operator.OperatorV3ExportService? = null,
    private val shareService: OperatorShareService? = null,
) {
    @Operation(
        summary = "提交密探交换文档",
        description = "version=2 保持原有导入；version=3 与 preview 共用 Schema、账号映射和 current 局部合并规则。" +
            "v3/v4/v5 使用 {document, account_mapping} 包装体，或在来源 id 就是本人账号 id 时直接提交文档。",
    )
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "200",
                content = [Content(schema = Schema(oneOf = [OperatorImportResult::class, OperatorV3ImportCommitResponse::class]))],
            ),
            ApiResponse(responseCode = "403", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "409", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "422", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
        ],
    )
    @PostMapping("/import", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun importDocument(
        @SwaggerRequestBody(
            required = true,
            content = [Content(schema = Schema(oneOf = [OperatorImportRequest::class, OperatorV3BrowserImportRequest::class]))],
        )
        @RequestBody request: JsonNode,
    ): ApiResult<Any> {
        val document = request.path("document").takeUnless(JsonNode::isMissingNode) ?: request
        return if (document.path("version").asInt() in setOf(3, 4, 5)) {
            success(requireNotNull(v3ImportService).commitBrowser(helper.requireUserId(), request))
        } else {
            val v2 = objectMapper.treeToValue(request, OperatorImportRequest::class.java)
            success(service.import(helper.requireUserId(), v2))
        }
    }

    @Operation(
        summary = "预览密探 v3/v4/v5 导入",
        description = "按版本严格校验 v3/v4/v5 Schema、账号归属、公共图鉴和字段语义；返回逐密探差异、stale 与目标 revision，不写 current 或库存。",
    )
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "200",
                content = [Content(schema = Schema(implementation = OperatorV3ImportPreviewResponse::class))],
            ),
            ApiResponse(responseCode = "403", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "422", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
        ],
    )
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewImport(
        @SwaggerRequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = OperatorV3BrowserImportRequest::class))],
        )
        @RequestBody request: JsonNode,
    ): ApiResult<OperatorV3ImportPreviewResponse> {
        return success(requireNotNull(v3ImportService).previewBrowser(helper.requireUserId(), request))
    }

    @Operation(summary = "读取当前子账号的待复核密探采集结果")
    @RequireJwt
    @GetMapping("/scan-reviews")
    fun scanReviews(@RequestParam(name = "account_id") accountId: String): ApiResult<List<OperatorScanReviewResponse>> =
        success(requireNotNull(v3ImportService).listScanReviews(helper.requireUserId(), accountId))

    @Operation(summary = "关闭已处理的密探采集待复核项")
    @RequireJwt
    @DeleteMapping("/scan-reviews")
    fun closeScanReview(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(name = "record_id") recordId: String,
        @RequestParam(name = "operator_id") operatorId: String,
    ): ApiResult<Boolean> {
        requireNotNull(v3ImportService).closeScanReview(helper.requireUserId(), accountId, recordId, operatorId)
        return success(true)
    }

    @GetMapping("/current")
    fun current(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(required = false) game: String?,
    ): ApiResult<List<OperatorCurrentResponse>> = success(service.current(helper.requireUserId(), accountId, game))

    @Operation(summary = "读取密探分享状态", description = "读取当前用户所属子账号的分享代码状态。")
    @RequireJwt
    @GetMapping("/share")
    fun getShare(@RequestParam(name = "account_id") accountId: String): ApiResult<OperatorShareResponse> = success(
        requireNotNull(shareService).get(helper.requireUserId(), accountId),
    )

    @Operation(summary = "创建或复用密探分享代码", description = "为当前用户所属子账号生成或复用长期有效的分享代码。")
    @RequireJwt
    @PutMapping("/share")
    fun createShare(@RequestParam(name = "account_id") accountId: String): ApiResult<OperatorShareResponse> = success(
        requireNotNull(shareService).create(helper.requireUserId(), accountId),
    )

    @Operation(summary = "重新生成密探分享代码", description = "覆盖旧代码，旧分享链接立即失效。")
    @RequireJwt
    @PostMapping("/share/regenerate")
    fun regenerateShare(@RequestParam(name = "account_id") accountId: String): ApiResult<OperatorShareResponse> = success(
        requireNotNull(shareService).regenerate(helper.requireUserId(), accountId),
    )

    @Operation(summary = "撤销密探分享代码", description = "清空当前子账号的分享代码；重复撤销保持幂等。")
    @RequireJwt
    @DeleteMapping("/share")
    fun revokeShare(@RequestParam(name = "account_id") accountId: String): ApiResult<OperatorShareResponse> = success(
        requireNotNull(shareService).revoke(helper.requireUserId(), accountId),
    )

    @Operation(
        summary = "查看密探公开分享",
        description = "无需登录；仅返回当前分享代码对应子账号的已招募客观养成数据，不缓存响应。",
    )
    @GetMapping("/share/view/{shareCode}")
    @com.lhs.share.config.accesslimit.AccessLimit(times = 30, second = 60)
    fun viewShare(@PathVariable shareCode: String): ResponseEntity<ApiResult<OperatorShareViewResponse>> {
        return ResponseEntity.ok()
            .header("Cache-Control", "no-store")
            .body(success(requireNotNull(shareService).view(shareCode, helper.obtainUserId())))
    }

    @Operation(summary = "读取子账号的密探主观养成标注", description = "未返回的密探默认 growth_state=active。")
    @GetMapping("/annotations")
    fun annotations(@RequestParam(name = "account_id") accountId: String) =
        success(requireNotNull(subjectiveService).annotations(helper.requireUserId(), accountId))

    @Operation(summary = "合并密探主观养成标注", description = "字段缺失保留旧值；note=null 明确清除；相同内容重复提交幂等。")
    @PutMapping("/annotations/{operatorId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun putAnnotation(
        @PathVariable operatorId: String,
        @RequestParam(name = "account_id") accountId: String,
        @RequestBody request: ObjectNode,
    ) = success(requireNotNull(subjectiveService).putAnnotation(helper.requireUserId(), accountId, operatorId, request))

    @Operation(summary = "读取子账号的密探养成目标")
    @GetMapping("/growth-targets")
    fun growthTargets(@RequestParam(name = "account_id") accountId: String) =
        success(requireNotNull(subjectiveService).targets(helper.requireUserId(), accountId))

    @Operation(
        summary = "合并密探养成目标",
        description = "level/elite/star_level/heart_paper 字段缺失保留旧值；targets=null 明确删除整组目标。",
    )
    @PutMapping("/growth-targets/{operatorId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun putGrowthTarget(
        @PathVariable operatorId: String,
        @RequestParam(name = "account_id") accountId: String,
        @RequestBody request: ObjectNode,
    ) = success(requireNotNull(subjectiveService).putTarget(helper.requireUserId(), accountId, operatorId, request))

    @Operation(summary = "删除密探养成目标")
    @DeleteMapping("/growth-targets/{operatorId}")
    fun deleteGrowthTarget(
        @PathVariable operatorId: String,
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(name = "expected_revision") expectedRevision: Long,
    ): ApiResult<Boolean> {
        requireNotNull(subjectiveService).deleteTarget(helper.requireUserId(), accountId, operatorId, expectedRevision)
        return success(true)
    }

    @Operation(summary = "预览密探快捷提升", description = "材料由服务端计算；预览不写数据库。五铢钱不参与库存校验。")
    @PostMapping("/upgrades/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewUpgrade(@RequestBody request: com.lhs.share.hub.controller.operator.request.OperatorUpgradeRequest) =
        success(requireNotNull(upgradeService).preview(helper.requireUserId(), request))

    @Operation(summary = "执行密探快捷提升并原子扣减库存")
    @PostMapping("/upgrades/execute", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun executeUpgrade(
        @org.springframework.web.bind.annotation.RequestHeader("Idempotency-Key") idempotencyKey: String,
        @RequestBody request: com.lhs.share.hub.controller.operator.request.OperatorUpgradeExecuteRequest,
    ) = success(requireNotNull(upgradeService).execute(helper.requireUserId(), idempotencyKey, request))

    @Operation(
        summary = "局部校正密探当前养成",
        description = "只合并请求中出现的字段；star_stones 出现时完整替换六槽当前装备，空数组清空；" +
            "display_mode 按 attack/hp 局部合并且不触发 stale；无 entry 且 expected_revision=0 时创建；" +
            "不扣库存。expected_revision 冲突返回 operator_revision_conflict。",
    )
    @PatchMapping("/current/{operatorId}")
    fun patchCurrent(
        @PathVariable operatorId: String,
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam game: String,
        @SwaggerRequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = OperatorCurrentPatchRequest::class))],
        )
        @RequestBody request: ObjectNode,
    ): ApiResult<OperatorCurrentEntryDto> = success(
        service.patchCurrent(helper.requireUserId(), accountId, game, operatorId, request),
    )

    @Operation(summary = "移除公共图鉴已删除的密探养成", description = "仅清理当前用户子账号下该旧 ID 的当前养成，保留历史记录；仍在公共图鉴中的 ID 返回 409。")
    @RequireJwt
    @DeleteMapping("/current/{operatorId}")
    fun removeOrphanCurrent(@PathVariable operatorId: String, @RequestParam(name = "account_id") accountId: String): ApiResult<Boolean> {
        service.removeOrphanCurrent(helper.requireUserId(), accountId, operatorId)
        return success(true)
    }

    @GetMapping("/records")
    fun records(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(required = false) game: String?,
        @RequestParam(required = false) from: OffsetDateTime?,
        @RequestParam(required = false) to: OffsetDateTime?,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ApiResult<OperatorRecordPageResponse> =
        success(service.listRecords(helper.requireUserId(), accountId, game, from?.toInstant(), to?.toInstant(), cursor, limit))

    @DeleteMapping("/records/{recordId}")
    fun deleteRecord(@PathVariable recordId: String, @RequestParam(name = "account_id") accountId: String): ApiResult<Boolean> {
        service.deleteRecord(helper.requireUserId(), accountId, recordId)
        return success(true)
    }

    @GetMapping("/export")
    fun export(
        @RequestParam(name = "account_id", required = false) accountId: String?,
        @RequestParam(required = false) scope: String?,
        @RequestParam(required = false, defaultValue = "2") version: Int,
        response: jakarta.servlet.http.HttpServletResponse? = null,
    ): Any = when (version) {
        2 -> {
            response?.setHeader(
                "X-Operator-Exchange-Warning",
                "v2 cannot encode independent huaji or level breakthrough (including unknown); use operator v5",
            )
            service.export(helper.requireUserId(), accountId, scope)
        }
        3, 4, 5 -> requireNotNull(v3ExportService).export(helper.requireUserId(), accountId, scope, version)
        else -> throw com.lhs.share.hub.service.operator.OperatorApiException(
            org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
            "unsupported_exchange_version",
            "Export version must be 2, 3, 4 or 5",
        )
    }

    /**
     * 公共开放 API（图鉴）：无需登录，返回全局只读密探目录。
     * 管理端（新增/修改/删除）见 [AdminOperatorCatalogController]。
     */
    @Operation(
        summary = "密探公共图鉴",
        description = "返回 special_oddity_name、服务端按 rarity 派生的只读 oddity_schema，以及 incomplete_fields",
    )
    @GetMapping("/catalog")
    fun catalog(): ApiResult<OperatorCatalogResponse> = success(catalogService.catalog())
}
