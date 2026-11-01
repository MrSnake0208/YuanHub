package com.lhs.share.hub.controller.recruitment

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.recruitment.request.RecruitmentAccessModeUpdateRequest
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessGrantResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessMeResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessUserCandidateResponse
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
class RecruitmentAccessController(
    private val service: RecruitmentAccessService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping("/v1/recruitment/access/me")
    fun me(): ApiResult<RecruitmentAccessMeResponse> = success(service.me(helper.requireUserId()))

    @GetMapping("/v1/admin/recruitment-access")
    fun admin(): ApiResult<RecruitmentAccessAdminResponse> = success(service.admin(helper.requireUserId()))

    @PutMapping("/v1/admin/recruitment-access/mode")
    fun setMode(@RequestBody request: RecruitmentAccessModeUpdateRequest): ApiResult<RecruitmentAccessAdminResponse> =
        success(service.setMode(helper.requireUserId(), request.accessMode, request.expectedVersion))

    @GetMapping("/v1/admin/recruitment-access/users")
    fun searchUsers(
        @RequestParam q: String,
        @RequestParam page: Int = 1,
        @RequestParam size: Int = 10,
    ): ApiResult<List<RecruitmentAccessUserCandidateResponse>> = success(service.searchCandidates(helper.requireUserId(), q, page, size))

    @PutMapping("/v1/admin/recruitment-access/users/{userId}")
    fun grant(@PathVariable userId: String): ApiResult<RecruitmentAccessGrantResponse> =
        success(service.grant(helper.requireUserId(), userId))

    @DeleteMapping("/v1/admin/recruitment-access/users/{userId}")
    fun revoke(@PathVariable userId: String): ApiResult<Unit> {
        service.revoke(helper.requireUserId(), userId)
        return success()
    }
}
