package com.lhs.share.hub.controller.calendar

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarImportRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarRequestDecoder
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarAdminItem
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarAdminResponse
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationExport
import com.lhs.share.hub.controller.calendar.response.CalendarClassificationReport
import com.lhs.share.hub.controller.calendar.response.CalendarImportReport
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.calendar.ActivityCalendarApiException
import com.lhs.share.hub.service.calendar.ActivityCalendarClassificationExchangeService
import com.lhs.share.hub.service.calendar.ActivityCalendarImportService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.springframework.format.annotation.DateTimeFormat
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
import java.time.LocalDate

@Tag(name = "Activity Calendar Admin", description = "手工活动维护；招募派生项只读")
@RestController
@RequireJwt
@RequestMapping("/v1/admin/activity-calendar", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminActivityCalendarController(
    private val service: ActivityCalendarService,
    private val helper: AuthenticationHelper,
    private val authorization: AdminAuthorizationService,
    mapper: ObjectMapper,
    private val importer: ActivityCalendarImportService,
    private val classificationExchange: ActivityCalendarClassificationExchangeService,
) {
    private val decoder = ActivityCalendarRequestDecoder(mapper)

    @Operation(summary = "导出全部手工活动及只读卡池参考，完整资料不受当前筛选影响")
    @GetMapping("/export")
    fun export(): ApiResult<CalendarClassificationExport> {
        requireEditor()
        return success(classificationExchange.export())
    }

    @Operation(summary = "只读预览按ID更新分类的JSON，最多10000条/20 MiB")
    @PostMapping("/classification-import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewClassification(request: HttpServletRequest): ApiResult<CalendarClassificationReport> {
        requireEditor()
        val (json, _) = classificationExchange.envelope(
            request.inputStream.readNBytes(
                ActivityCalendarClassificationExchangeService.MAX_ENVELOPE_BYTES + 1,
            ),
        )
        return success(classificationExchange.preview(json))
    }

    @Operation(summary = "按ID和版本在事务中更新分类，不新建、不删除、不覆盖其他资料")
    @PostMapping("/classification-import/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commitClassification(request: HttpServletRequest): ApiResult<CalendarClassificationReport> {
        val actor = requireEditor()
        val (json, token) = classificationExchange.envelope(
            request.inputStream.readNBytes(
                ActivityCalendarClassificationExchangeService.MAX_ENVELOPE_BYTES + 1,
            ),
        )
        return success(classificationExchange.commit(actor, json, token))
    }

    @Operation(
        summary = "只读预览JSON v1手工活动导入；请求json为原始文本，最多1 MiB/200条",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = ActivityCalendarImportRequest::class))],
        ),
    )
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun previewImport(request: HttpServletRequest): ApiResult<CalendarImportReport> {
        requireEditor()
        val (json, _) = importer.envelope(request.inputStream.readNBytes(ActivityCalendarImportService.MAX_ENVELOPE_BYTES + 1))
        return success(importer.preview(json))
    }

    @Operation(
        summary = "重新校验并创建手工活动；需json与preview_token，重复跳过，部分成功逐行返回",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = ActivityCalendarImportRequest::class))],
        ),
    )
    @PostMapping("/import/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commitImport(request: HttpServletRequest): ApiResult<CalendarImportReport> {
        val actor = requireEditor()
        val (json, token) = importer.envelope(request.inputStream.readNBytes(ActivityCalendarImportService.MAX_ENVELOPE_BYTES + 1))
        return success(importer.commit(actor, json, token))
    }

    @Operation(summary = "查询活动目录，含停用手工活动及只读招募来源")
    @GetMapping
    fun list(
        @RequestParam(required = false) game: String?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate?,
        @RequestParam(required = false) category: List<String>?,
        @RequestParam(required = false) enabled: Boolean?,
        @RequestParam(required = false) search: String?,
    ): ApiResult<ActivityCalendarAdminResponse> {
        requireEditor()
        return success(service.adminItems(game, from, to, category, enabled, search))
    }

    @Operation(
        summary = "创建手工活动",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = ActivityCalendarWriteRequest::class))],
        ),
    )
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@RequestBody body: JsonNode): ApiResult<ActivityCalendarAdminItem> =
        success(service.create(requireEditor(), decoder.read(body)))

    @Operation(
        summary = "按expected_version更新或停用手工活动",
        requestBody = io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = [Content(schema = Schema(implementation = ActivityCalendarWriteRequest::class))],
        ),
    )
    @PutMapping("/{id}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable id: String, @RequestBody body: JsonNode): ApiResult<ActivityCalendarAdminItem> =
        success(service.update(requireEditor(), id, decoder.read(body)))

    private fun requireEditor(): String {
        val actor = helper.requireUserId()
        if (!authorization.hasPermission(actor, AdminPermission.ACTIVITY_CALENDAR_WRITE)) {
            throw ActivityCalendarApiException(HttpStatus.FORBIDDEN, "forbidden", "需要活动日历维护权限")
        }
        return actor
    }
}
