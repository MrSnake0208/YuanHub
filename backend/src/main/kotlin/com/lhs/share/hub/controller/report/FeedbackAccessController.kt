package com.lhs.share.hub.controller.report

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.report.request.FeedbackAccessUpdateRequest
import com.lhs.share.hub.controller.report.response.CurrentFeedbackAccessResponse
import com.lhs.share.hub.controller.report.response.FeedbackAccessGrantResponse
import com.lhs.share.hub.controller.report.response.FeedbackAccessUserCandidateResponse
import com.lhs.share.hub.controller.report.response.FeedbackAreaOptionResponse
import com.lhs.share.hub.controller.report.response.FeedbackAssigneeResponse
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.service.report.FeedbackAccessService
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
class FeedbackAccessController(
    private val service: FeedbackAccessService,
    private val helper: AuthenticationHelper,
) {
    data class FeedbackCategoryRequest(val label: String, val spaceId: String = "yuanhub")
    data class SpaceRequest(val id: String, val label: String, val active: Boolean = true)
    data class FeedbackCategoryVisibilityRequest(val hidden: Boolean)
    data class FeedbackCategoryOrderRequest(val keys: List<String>, val expectedKeys: List<String>, val spaceId: String? = null)

    @GetMapping("/v1/reports/access")
    fun current(@RequestParam(required = false) spaceId: String? = null): ApiResult<CurrentFeedbackAccessResponse> =
        success(service.current(helper.requireUserId(), spaceId))

    @PostMapping("/v1/admin/feedback-spaces")
    fun createSpace(@RequestBody request: SpaceRequest): ApiResult<FeedbackSpace> =
        success(service.saveSpace(helper.requireUserId(), request.id, request.label, true, create = true))

    @PutMapping("/v1/admin/feedback-spaces/{id}")
    fun updateSpace(@PathVariable id: String, @RequestBody request: SpaceRequest): ApiResult<FeedbackSpace> =
        success(service.saveSpace(helper.requireUserId(), id, request.label, request.active, create = false))

    @GetMapping("/v1/admin/feedback-access")
    fun list(): ApiResult<List<FeedbackAccessGrantResponse>> = success(service.listGrants(helper.requireUserId()))

    @PostMapping("/v1/admin/feedback-categories")
    fun createCategory(@RequestBody request: FeedbackCategoryRequest): ApiResult<FeedbackAreaOptionResponse> =
        success(service.createCategory(helper.requireUserId(), request.label, request.spaceId))

    @PutMapping("/v1/admin/feedback-categories/order")
    fun reorderCategories(@RequestBody request: FeedbackCategoryOrderRequest): ApiResult<List<FeedbackAreaOptionResponse>> =
        success(service.reorderCategories(helper.requireUserId(), request.keys, request.expectedKeys, request.spaceId))

    @PutMapping("/v1/admin/feedback-categories/{key}")
    fun renameCategory(@PathVariable key: String, @RequestBody request: FeedbackCategoryRequest): ApiResult<FeedbackAreaOptionResponse> =
        success(service.renameCategory(helper.requireUserId(), key, request.label))

    @PutMapping("/v1/admin/feedback-categories/{key}/visibility")
    fun setCategoryVisibility(
        @PathVariable key: String,
        @RequestBody request: FeedbackCategoryVisibilityRequest,
    ): ApiResult<FeedbackAreaOptionResponse> = success(service.setCategoryHidden(helper.requireUserId(), key, request.hidden))

    @GetMapping("/v1/admin/feedback/{id}/assignees")
    fun assignees(@PathVariable id: String): ApiResult<List<FeedbackAssigneeResponse>> =
        success(service.assignees(helper.requireUserId(), id))

    @GetMapping("/v1/admin/feedback-access/users")
    fun searchUsers(
        @RequestParam q: String,
        @RequestParam page: Int = 1,
        @RequestParam size: Int = 10,
    ): ApiResult<List<FeedbackAccessUserCandidateResponse>> {
        return success(service.searchUserCandidates(helper.requireUserId(), q, page, size))
    }

    @PutMapping("/v1/admin/feedback-access/{userId}")
    fun update(@PathVariable userId: String, @RequestBody request: FeedbackAccessUpdateRequest): ApiResult<FeedbackAccessGrantResponse> {
        return success(service.updateGrant(helper.requireUserId(), userId, request))
    }

    @DeleteMapping("/v1/admin/feedback-access/{userId}")
    fun delete(@PathVariable userId: String): ApiResult<Unit> {
        service.deleteGrant(helper.requireUserId(), userId)
        return success()
    }
}
