package com.lhs.share.hub.controller.report

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.report.request.FeedbackMergeRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublicStatusRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublishRequest
import com.lhs.share.hub.controller.report.request.FeedbackTypeUpdateRequest
import com.lhs.share.hub.controller.report.request.FeedbackVersionRequest
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.controller.report.response.FeedbackVersionOptionResponse
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.service.report.FeedbackPublicAdministrationService
import com.lhs.share.hub.service.report.FeedbackReportService
import com.lhs.share.hub.service.report.FeedbackWorkflowService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 反馈公开管理接口(管理员)。
 *
 * 权限沿用反馈板块管理权限;非管理员返回业务 status_code=403。
 * 所有接口返回更新后的内部工单详情,便于工作台直接刷新面板。
 */
@Tag(name = "Feedback Admin", description = "反馈公开管理与重复合并")
@RequireJwt
@RestController
@RequestMapping("/v1/admin/feedback")
class AdminFeedbackController(
    private val administrationService: FeedbackPublicAdministrationService,
    private val feedbackReportService: FeedbackReportService,
    private val workflowService: FeedbackWorkflowService,
    private val helper: AuthenticationHelper,
) {
    data class AssignmentRequest(val targetUserId: String, val reason: String)
    data class HandoffRequest(val workArea: String, val note: String)
    data class NoteRequest(val note: String, val mode: String)
    data class MarkReadRequest(val messageId: String)

    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): ApiResult<FeedbackReportResponse> =
        success(feedbackReportService.getById(helper.requireUserId(), id, adminMode = true))

    @GetMapping("/queue")
    fun queue(
        @RequestParam(defaultValue = "UNASSIGNED") queue: String,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") pageSize: Int,
        @RequestParam(required = false) workArea: String?,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "updatedAt") sortBy: String = "updatedAt",
        @RequestParam(defaultValue = "desc") sortOrder: String = "desc",
        @RequestParam(required = false) spaceId: String? = null,
    ): ApiResult<FeedbackReportListResponse> = success(
        feedbackReportService.list(
            helper.requireUserId(), page, pageSize, null, type, workArea, null, false, null, q, sortBy, sortOrder, queue, spaceId,
        ),
    )

    @PostMapping("/{id}/claim")
    fun claim(@PathVariable id: String): ApiResult<FeedbackReportResponse> {
        val actor = helper.requireUserId()
        workflowService.claim(actor, id)
        return success(feedbackReportService.getById(actor, id, adminMode = true))
    }

    @PostMapping("/{id}/assign")
    fun assign(@PathVariable id: String, @RequestBody request: AssignmentRequest): ApiResult<FeedbackReportResponse> {
        val actor = helper.requireUserId()
        workflowService.assign(actor, id, request.targetUserId, request.reason)
        return success(feedbackReportService.getById(actor, id, adminMode = true))
    }

    @PostMapping("/{id}/handoff")
    fun handoff(@PathVariable id: String, @RequestBody request: HandoffRequest): ApiResult<FeedbackReportResponse> {
        val actor = helper.requireUserId()
        workflowService.handoff(actor, id, request.workArea, request.note)
        return success(feedbackReportService.getById(actor, id, adminMode = true))
    }

    @PostMapping("/{id}/work-area")
    fun changeArea(@PathVariable id: String, @RequestBody request: HandoffRequest): ApiResult<FeedbackReportResponse> {
        val actor = helper.requireUserId()
        workflowService.changeArea(actor, id, request.workArea, request.note)
        return success(feedbackReportService.getById(actor, id, adminMode = true))
    }

    @PostMapping("/{id}/return")
    fun returnToOperator(@PathVariable id: String, @RequestBody request: NoteRequest): ApiResult<FeedbackReportResponse> {
        val actor = helper.requireUserId()
        workflowService.returnToOperator(actor, id, request.note, request.mode)
        return success(feedbackReportService.getById(actor, id, adminMode = true))
    }

    @GetMapping("/{id}/events")
    fun events(@PathVariable id: String): ApiResult<List<FeedbackWorkflowEvent>> =
        success(workflowService.events(helper.requireUserId(), id))

    @PostMapping("/{id}/read")
    fun markRead(@PathVariable id: String, @RequestBody request: MarkReadRequest): ApiResult<Unit> {
        workflowService.markRead(helper.requireUserId(), id, request.messageId)
        return success()
    }

    @Operation(summary = "发布反馈到反馈广场")
    @PatchMapping("/{id}/publish")
    fun publish(@PathVariable id: String, @Valid @RequestBody request: FeedbackPublishRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.publish(userId, id, request)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }

    @Operation(summary = "取消公开反馈")
    @PatchMapping("/{id}/unpublish")
    fun unpublish(@PathVariable id: String): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.unpublish(userId, id)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }

    @Operation(summary = "修改公开开发状态")
    @PatchMapping("/{id}/public-status")
    fun updatePublicStatus(
        @PathVariable id: String,
        @Valid @RequestBody request: FeedbackPublicStatusRequest,
    ): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.updatePublicStatus(userId, id, request)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }

    @Operation(summary = "合并重复反馈")
    @PostMapping("/{id}/merge")
    fun merge(@PathVariable id: String, @Valid @RequestBody request: FeedbackMergeRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.merge(userId, id, request)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }

    @Operation(summary = "修改反馈类型")
    @PatchMapping("/{id}/type")
    fun updateType(@PathVariable id: String, @Valid @RequestBody request: FeedbackTypeUpdateRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.updateType(userId, id, request)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }

    @Operation(summary = "获取反馈可关联的版本")
    @GetMapping("/version-options")
    fun versionOptions(@RequestParam(defaultValue = "yuanhub") spaceId: String): ApiResult<List<FeedbackVersionOptionResponse>> =
        success(administrationService.versionOptions(helper.requireUserId(), spaceId))

    @Operation(summary = "关联目标/完成版本")
    @PatchMapping("/{id}/versions")
    fun updateVersions(@PathVariable id: String, @Valid @RequestBody request: FeedbackVersionRequest): ApiResult<FeedbackReportResponse> {
        val userId = helper.requireUserId()
        administrationService.updateVersions(userId, id, request)
        return success(feedbackReportService.getById(userId, id, adminMode = true))
    }
}
