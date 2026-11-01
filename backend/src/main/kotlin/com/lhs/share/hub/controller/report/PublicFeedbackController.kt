package com.lhs.share.hub.controller.report

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.report.response.PublicFeedbackDetail
import com.lhs.share.hub.controller.report.response.PublicFeedbackListItem
import com.lhs.share.hub.controller.report.response.PublicFeedbackPage
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.service.report.FeedbackCategoryService
import com.lhs.share.hub.service.report.FeedbackPublicService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 公开反馈接口(反馈广场)。
 *
 * 无需登录即可浏览;登录用户会额外得到 supportedByCurrentUser。
 * 仅返回 visibility=PUBLIC 的反馈,且只包含公开字段。
 */
@Tag(name = "Public Feedback", description = "公开反馈广场")
@RestController
@RequestMapping("/v1/reports/public")
class PublicFeedbackController(
    private val service: FeedbackPublicService,
    private val helper: AuthenticationHelper,
    private val categories: FeedbackCategoryService,
) {
    @GetMapping("/spaces")
    fun spaces(): ApiResult<List<FeedbackSpace>> = success(categories.spaces().filter { it.active })

    @GetMapping("/spaces/{id}")
    fun space(@PathVariable id: String): ApiResult<FeedbackSpace> = success(categories.requireSpace(id))

    @Operation(summary = "公开反馈列表")
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") pageSize: Int,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) keyword: String?,
        @RequestParam(required = false) completedVersionId: String?,
        @RequestParam(defaultValue = "latest") sort: String,
        @RequestParam(defaultValue = "yuanhub") spaceId: String = "yuanhub",
    ): ApiResult<PublicFeedbackPage> = success(
        service.list(
            currentUserId = helper.obtainUserId(),
            page = page,
            pageSize = pageSize,
            type = type,
            status = status,
            keyword = keyword,
            completedVersionId = completedVersionId,
            sort = sort,
            spaceId = spaceId,
        ),
    )

    @Operation(summary = "相似公开反馈(提交前查重提示)")
    @GetMapping("/similar")
    fun similar(
        @RequestParam title: String,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(defaultValue = "yuanhub") spaceId: String = "yuanhub",
    ): ApiResult<List<PublicFeedbackListItem>> = success(
        service.similar(helper.obtainUserId(), title, type, limit, spaceId),
    )

    @Operation(summary = "公开反馈详情")
    @GetMapping("/{id}")
    fun detail(@PathVariable id: String, @RequestParam(required = false) spaceId: String? = null): ApiResult<PublicFeedbackDetail> =
        success(
            service.getById(helper.obtainUserId(), id, spaceId),
        )
}
