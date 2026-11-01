package com.lhs.share.hub.controller.changelog

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.changelog.request.ChangelogCreateRequest
import com.lhs.share.hub.controller.changelog.request.ChangelogDraftRequest
import com.lhs.share.hub.controller.changelog.request.ChangelogRejectRequest
import com.lhs.share.hub.controller.changelog.request.ChangelogVersionRequest
import com.lhs.share.hub.controller.changelog.response.ChangelogAdminResponse
import com.lhs.share.hub.service.changelog.ChangelogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Changelog Admin", description = "Edit and review product changelog entries")
@RestController
@RequireJwt
@RequestMapping("/v1/admin/changelog", produces = [MediaType.APPLICATION_JSON_VALUE])
class AdminChangelogController(
    private val service: ChangelogService,
    private val helper: AuthenticationHelper,
) {
    @Operation(summary = "List changelog entries for editors and reviewers")
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") size: Int,
    ): ApiResult<PagedDTO<ChangelogAdminResponse>> = success(service.adminEntries(helper.requireUserId(), page, size))

    @Operation(summary = "Create a changelog draft")
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@Valid @RequestBody request: ChangelogCreateRequest): ApiResult<ChangelogAdminResponse> =
        success(service.create(helper.requireUserId(), request))

    @Operation(summary = "Save a changelog draft")
    @PutMapping("/{id}/draft", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun saveDraft(@PathVariable id: String, @Valid @RequestBody request: ChangelogDraftRequest): ApiResult<ChangelogAdminResponse> =
        success(service.saveDraft(helper.requireUserId(), id, request))

    @Operation(summary = "Submit a changelog draft for review")
    @PostMapping("/{id}/submit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submit(@PathVariable id: String, @Valid @RequestBody request: ChangelogVersionRequest): ApiResult<ChangelogAdminResponse> =
        success(service.submit(helper.requireUserId(), id, request.expectedVersion))

    @Operation(summary = "Approve and publish a changelog revision")
    @PostMapping("/{id}/approve", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun approve(@PathVariable id: String, @Valid @RequestBody request: ChangelogVersionRequest): ApiResult<ChangelogAdminResponse> =
        success(service.approve(helper.requireUserId(), id, request.expectedVersion))

    @Operation(summary = "Reject a changelog revision")
    @PostMapping("/{id}/reject", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun reject(@PathVariable id: String, @Valid @RequestBody request: ChangelogRejectRequest): ApiResult<ChangelogAdminResponse> =
        success(service.reject(helper.requireUserId(), id, request.expectedVersion, request.reason))

    @Operation(summary = "Withdraw the published changelog revision")
    @PostMapping("/{id}/withdraw", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun withdraw(@PathVariable id: String, @Valid @RequestBody request: ChangelogVersionRequest): ApiResult<ChangelogAdminResponse> =
        success(service.withdraw(helper.requireUserId(), id, request.expectedVersion))
}
