package com.lhs.share.hub.controller.report

import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.request.FeedbackMessageAppendRequest
import com.lhs.share.hub.controller.report.request.FeedbackReportCreateRequest
import com.lhs.share.hub.controller.report.request.FeedbackStatusUpdateRequest
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.controller.report.response.PublicFeedbackDetail
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackPublicService
import com.lhs.share.hub.service.report.FeedbackReportService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.CacheControl
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.nio.charset.StandardCharsets

/**
 * 反馈工单接口
 *
 * 提供反馈工单的 CRUD 操作, 包括创建、列表、详情、追加消息、状态变更。
 */
@Tag(name = "Feedback Reports", description = "反馈工单")
@RequestMapping("/v1/reports")
@RestController
class FeedbackReportController(
    private val feedbackReportService: FeedbackReportService,
    private val feedbackPublicService: FeedbackPublicService,
    private val mediaStorageService: MediaStorageService,
    private val helper: AuthenticationHelper,
) {
    /**
     * 创建反馈工单
     */
    @Operation(summary = "创建反馈工单")
    @RequireJwt
    @PostMapping
    fun create(@Valid @RequestBody request: FeedbackReportCreateRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        return success(feedbackReportService.create(userId, request))
    }

    /**
     * 查询反馈工单列表
     */
    @Operation(summary = "查询反馈工单列表")
    @RequireJwt
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") pageSize: Int,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) category: String?,
        /** 第一版参数，使用 category 代替。 */
        @RequestParam(required = false) area: String?,
        @RequestParam(defaultValue = "true") mine: Boolean,
        @RequestParam(required = false) reporterUserId: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "createdAt") sortBy: String,
        @RequestParam(defaultValue = "desc") sortOrder: String,
        @RequestParam(required = false) spaceId: String? = null,
    ): ApiResult<FeedbackReportListResponse> {
        val userId = helper.requireUserId()
        return success(
            feedbackReportService.list(
                currentUserId = userId,
                page = page,
                pageSize = pageSize,
                status = status,
                type = type,
                category = category,
                area = area,
                mine = mine,
                reporterUserId = reporterUserId,
                keyword = q,
                sortBy = sortBy,
                sortOrder = sortOrder,
                spaceId = spaceId,
            ),
        )
    }

    /**
     * 获取工单详情
     */
    @Operation(summary = "获取工单详情")
    @RequireJwt
    @GetMapping("/{id}")
    fun getById(@PathVariable id: String): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        return success(feedbackReportService.getById(userId, id))
    }

    /**
     * 支持公开反馈;重复支持幂等,不会重复加票。
     */
    @Operation(summary = "支持公开反馈", description = "仅 PUBLIC 反馈可支持;服务端按唯一约束去重。")
    @RequireJwt
    @AccessLimit(times = 30, second = 60)
    @PostMapping("/{id}/support")
    fun support(@PathVariable id: String): ApiResult<PublicFeedbackDetail> {
        val userId = helper.requireUserId()
        return success(feedbackPublicService.support(userId, id))
    }

    /**
     * 取消支持公开反馈;不存在支持记录时不减票。
     */
    @Operation(summary = "取消支持公开反馈")
    @RequireJwt
    @AccessLimit(times = 30, second = 60)
    @DeleteMapping("/{id}/support")
    fun unsupport(@PathVariable id: String): ApiResult<PublicFeedbackDetail> {
        val userId = helper.requireUserId()
        return success(feedbackPublicService.unsupport(userId, id))
    }

    /** 下载工单中已绑定的普通文件。 */
    @Operation(summary = "下载反馈附件")
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "附件二进制", content = [Content(mediaType = "application/octet-stream")]),
            ApiResponse(responseCode = "403", description = "无工单查看权限", content = [Content(mediaType = "application/json")]),
            ApiResponse(responseCode = "404", description = "工单或附件不存在", content = [Content(mediaType = "application/json")]),
        ],
    )
    @RequireJwt
    @GetMapping("/{id}/attachments/{mediaId}")
    fun downloadAttachment(@PathVariable id: String, @PathVariable mediaId: String): ResponseEntity<*> {
        return try {
            val userId = helper.requireUserId()
            val asset = feedbackReportService.getAttachment(userId, id, mediaId)
            val resource = mediaStorageService.loadAuthorizedAsset(asset)
            val filename = safeDownloadName(asset.originalName)
            val contentType = try {
                MediaType.parseMediaType(asset.mime)
            } catch (_: Exception) {
                MediaType.APPLICATION_OCTET_STREAM
            }
            ResponseEntity.ok()
                .contentType(contentType)
                .contentLength(resource.contentLength())
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header(
                    HttpHeaders.CONTENT_DISPOSITION,
                    ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString(),
                )
                .body(resource)
        } catch (e: ApiResultException) {
            ResponseEntity.status(e.statusCode).body(fail(e.statusCode, e.message))
        } catch (e: ResponseStatusException) {
            ResponseEntity.status(e.statusCode).body(fail(e.statusCode.value(), e.reason))
        }
    }

    /**
     * 追加消息
     */
    @Operation(
        summary = "追加消息到工单",
        description = "actor_mode 可为 REPORTER 或 ADMIN，后端会按工单归属和板块管理权限重新授权。" +
            "兼容期缺省仅在身份唯一时推断，双角色缺省返回业务 status_code=400，越权返回业务 status_code=403。",
    )
    @RequireJwt
    @PostMapping("/{id}/messages")
    fun appendMessage(
        @PathVariable id: String,
        @Valid @RequestBody request: FeedbackMessageAppendRequest,
    ): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        return success(feedbackReportService.appendMessage(userId, id, request))
    }

    /**
     * 更新工单状态
     */
    @Operation(
        summary = "更新工单状态",
        description = "actor_mode 可为 REPORTER 或 ADMIN，后端会按工单归属和板块管理权限重新授权。" +
            "兼容期缺省仅在身份唯一时推断，双角色缺省返回业务 status_code=400，越权返回业务 status_code=403。",
    )
    @RequireJwt
    @PatchMapping("/{id}/status")
    fun updateStatus(@PathVariable id: String, @RequestBody request: FeedbackStatusUpdateRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        return success(feedbackReportService.updateStatus(userId, id, request))
    }

    private fun safeDownloadName(originalName: String): String = originalName
        .replace('\r', '_')
        .replace('\n', '_')
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .ifBlank { "attachment" }
}
