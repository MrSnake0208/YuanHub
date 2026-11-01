package com.lhs.share.openapi

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.controller.operator.request.OperatorImportRequest
import com.lhs.share.hub.controller.operator.request.OperatorV3ExchangeDocumentRequest
import com.lhs.share.hub.controller.operator.response.OperatorAnnotationListResponse
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorDailyTasksResponse
import com.lhs.share.hub.controller.operator.response.OperatorErrorResponse
import com.lhs.share.hub.controller.operator.response.OperatorExportResponse
import com.lhs.share.hub.controller.operator.response.OperatorImportResult
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportCommitResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportPreviewResponse
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorDailyTasksService
import com.lhs.share.hub.service.operator.OperatorPlannerService
import com.lhs.share.hub.service.operator.OperatorService
import com.lhs.share.hub.service.operator.OperatorSubjectiveService
import com.lhs.share.hub.service.operator.OperatorV3ImportService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import jakarta.validation.Valid
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@RequestMapping("/open-api/operator", produces = [MediaType.APPLICATION_JSON_VALUE])
class OpenApiOperatorController(
    private val tokenService: OpenApiTokenService,
    private val service: OperatorService,
    private val accountService: SubAccountService,
    private val v3ImportService: OperatorV3ImportService? = null,
    private val subjectiveService: OperatorSubjectiveService? = null,
    private val plannerService: OperatorPlannerService? = null,
    private val dailyTasksService: OperatorDailyTasksService? = null,
    private val clock: Clock = Clock.systemUTC(),
) {
    @GetMapping("/account")
    fun account(@RequestHeader(value = "Authorization", required = false) authorization: String?): ApiResult<SubAccountResponse> {
        val principal = tokenService.authenticateAuthorization(authorization)
        return success(SubAccountResponse.of(accountService.requireAccount(principal.userId, principal.accountId)))
    }

    @Operation(
        summary = "Read operator growth annotations",
        description = "Requires operator:read. Uses the token-bound account; absent operators default to growth_state=active.",
    )
    @RequireOpenApiToken
    @GetMapping("/annotations")
    fun annotations(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ApiResult<OperatorAnnotationListResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_READ)
        return success(requireNotNull(subjectiveService).annotations(principal.userId, principal.accountId))
    }

    @GetMapping("/current")
    fun current(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) game: String?,
    ): ApiResult<List<OperatorCurrentResponse>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_READ)
        return success(service.current(principal.userId, principal.accountId, game))
    }

    @PostMapping("/import")
    fun import(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @Valid @RequestBody request: OperatorImportRequest,
    ): ApiResult<OperatorImportResult> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_WRITE)
        return success(service.import(principal.userId, principal.accountId, request))
    }

    @Operation(
        summary = "预览自动采集密探 v3/v4/v5 文档",
        description = "需要 operator:scan:write；只允许单来源 operator_snapshot、source_kind=scan、snapshot_scope=listed。来源账号始终映射到 token 绑定账号。",
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
    @RequireOpenApiToken
    @PostMapping("/scan-import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewScanImport(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @SwaggerRequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = OperatorV3ExchangeDocumentRequest::class))],
        )
        @RequestBody document: JsonNode,
    ): ApiResult<OperatorV3ImportPreviewResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_SCAN_WRITE)
        return success(requireNotNull(v3ImportService).previewScan(principal.userId, principal.accountId, document))
    }

    @Operation(
        summary = "提交自动采集密探 v3/v4/v5 文档",
        description = "与浏览器导入共用 Schema、preview、commit 和 current merge；不扣库存，不接受 annotation/full/manual。",
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", content = [Content(schema = Schema(implementation = OperatorV3ImportCommitResponse::class))]),
            ApiResponse(responseCode = "403", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "409", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "422", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
        ],
    )
    @RequireOpenApiToken
    @PostMapping("/scan-import/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commitScanImport(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @SwaggerRequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = OperatorV3ExchangeDocumentRequest::class))],
        )
        @RequestBody document: JsonNode,
    ): ApiResult<OperatorV3ImportCommitResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_SCAN_WRITE)
        return success(requireNotNull(v3ImportService).commitScan(principal.userId, principal.accountId, document))
    }

    @GetMapping("/export")
    fun export(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        response: jakarta.servlet.http.HttpServletResponse? = null,
    ): OperatorExportResponse {
        response?.setHeader(
            "X-Operator-Exchange-Warning",
            "v2 cannot encode independent huaji or level breakthrough (including unknown); use operator v5",
        )
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_EXPORT)
        return service.export(principal.userId, principal.accountId, null)
    }

    @Operation(
        summary = "读取今日密探历练待办",
        description = "需要 operator:read 或 operator:daily-tasks:write（任意其一）；账号由 Token 绑定，" +
            "忽略客户端传入的 account_id/plan_id；无可用方案时返回空 tasks 与 no_schedule。",
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", content = [Content(schema = Schema(implementation = OpenApiDailyTasksResponse::class))]),
            ApiResponse(responseCode = "401", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "403", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "422", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
        ],
    )
    @RequireOpenApiToken
    @GetMapping("/daily-tasks")
    fun dailyTasks(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) date: String?,
    ): ResponseEntity<ApiResult<OpenApiDailyTasksResponse>> {
        // 只想在手机小组件上看今日历练的用户，只授予 operator:daily-tasks:write 就应该够用，
        // 因此读取接受 operator:read 或 operator:daily-tasks:write 任意其一（不放开密探其他读接口）。
        val principal = tokenService.validateAnyAuthorization(
            authorization,
            OpenApiPermission.OPERATOR_READ,
            OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
        )
        val day = date?.takeIf { it.isNotBlank() } ?: LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai"))).toString()
        val plan = activePlan(principal.userId, principal.accountId)
        val planId = plan?.path("id")?.asText()
        val daily = planId?.let { requireNotNull(dailyTasksService).get(principal.userId, principal.accountId, it, day) }
        val body = snapshot(principal.accountId, plan, day, daily)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(body))
    }

    @Operation(
        summary = "勾选今日密探历练完成",
        description = "需要 operator:daily-tasks:write;账号与方案由 Token 绑定,忽略客户端传入的 account_id/plan_id;" +
            "请求体恰好为 date/expected_version/expected_schedule_revision/completed,版本冲突返回 409,字段或任务不合法返回 422。",
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", content = [Content(schema = Schema(implementation = OpenApiDailyTasksResponse::class))]),
            ApiResponse(responseCode = "401", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "403", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "409", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
            ApiResponse(responseCode = "422", content = [Content(schema = Schema(implementation = OperatorErrorResponse::class))]),
        ],
    )
    @RequireOpenApiToken
    @PutMapping("/daily-tasks/{entryId}/completion", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun completeDailyTask(
        @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable entryId: String,
        @RequestBody body: JsonNode,
    ): ResponseEntity<ApiResult<OpenApiDailyTasksResponse>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE)
        if (!body.isObject || body.fieldNames().asSequence().toSet() != COMPLETION_FIELDS) invalid("请求字段不正确")
        val day = body.path("date").takeIf { it.isTextual }?.asText() ?: invalid("date 不正确")
        val expectedVersion = completionVersion(body, "expected_version")
        val expectedScheduleRevision = completionVersion(body, "expected_schedule_revision")
        val completed = body.path("completed").takeIf { it.isBoolean }?.booleanValue() ?: invalid("completed 必须为布尔值")
        val plan = activePlan(principal.userId, principal.accountId) ?: invalid("没有可用的养成方案")
        val daily = requireNotNull(dailyTasksService).completeFromOpenApi(
            principal.userId,
            principal.accountId,
            plan.path("id").asText(),
            day,
            entryId,
            expectedVersion,
            expectedScheduleRevision,
            completed,
        )
        val result = snapshot(principal.accountId, plan, day, daily)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(result))
    }

    /** Token 绑定账号的当前养成方案;读取与写入共用,保证两者取到同一个 plan。 */
    private fun activePlan(userId: String, accountId: String): JsonNode? {
        val workspace = requireNotNull(plannerService).workspace(userId, accountId)
        val plans = workspace.path("plans")
        val active = workspace.path("active_plan_id").takeIf { it.isTextual }?.asText()?.takeIf { it.isNotBlank() }
        return active?.let { id -> plans.firstOrNull { it.path("id").asText() == id } } ?: plans.firstOrNull()
    }

    private fun snapshot(accountId: String, plan: JsonNode?, date: String, daily: OperatorDailyTasksResponse?): OpenApiDailyTasksResponse {
        if (plan == null || daily == null) {
            return OpenApiDailyTasksResponse(
                accountId = accountId,
                planId = null,
                planName = null,
                date = date,
                version = 0,
                needsUpdate = false,
                sourceStatus = "no_schedule",
                tasks = emptyList(),
                scheduleRevision = 0,
                plannedTasks = emptyList(),
            )
        }
        return OpenApiDailyTasksResponse(
            accountId = accountId,
            planId = plan.path("id").asText(),
            planName = plan.path("name").takeIf { it.isTextual }?.asText(),
            date = date,
            version = daily.version,
            needsUpdate = daily.needsUpdate,
            sourceStatus = daily.source.status,
            tasks = daily.tasks.map { OpenApiDailyTask.of(it) },
            scheduleRevision = daily.source.revision,
            plannedTasks = if (daily.source.status == "ready") daily.source.items.map { OpenApiDailyTask.of(it) } else emptyList(),
        )
    }

    private fun completionVersion(body: JsonNode, field: String): Long {
        val value = body.path(field)
        if (!value.isIntegralNumber || !value.canConvertToLong() || value.longValue() !in 0L until 9007199254740991L) invalid("$field 不正确")
        return value.longValue()
    }

    private fun invalid(message: String): Nothing {
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)
    }

    companion object {
        private val COMPLETION_FIELDS = setOf("date", "expected_version", "expected_schedule_revision", "completed")
    }
}
