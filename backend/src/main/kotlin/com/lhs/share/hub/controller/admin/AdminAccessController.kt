package com.lhs.share.hub.controller.admin

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.admin.request.AdminRoleUpdateRequest
import com.lhs.share.hub.controller.admin.response.AdminAccessResponse
import com.lhs.share.hub.controller.admin.response.AdminAuditLogResponse
import com.lhs.share.hub.controller.admin.response.AdminRoleUserResponse
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminRoleService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/admin")
@RequireJwt
class AdminAccessController(
    private val helper: AuthenticationHelper,
    private val authorizationService: AdminAuthorizationService,
    private val roleService: AdminRoleService,
    private val auditService: AdminAuditService,
) {
    @GetMapping("/access/me")
    fun current(): ApiResult<AdminAccessResponse> {
        val userId = helper.requireUserId()
        val roles = authorizationService.rolesFor(userId)
        return success(
            AdminAccessResponse(
                roles = roles.map { it.name }.toSortedSet(),
                permissions = authorizationService.permissionsFor(userId),
                receiveAreas = authorizationService.receiveAreasFor(userId),
                manageAreas = authorizationService.manageableAreasFor(userId),
                superAdmin = AdminRole.SUPER_ADMIN in roles,
                feedbackRoles = authorizationService.feedbackRolesFor(userId),
                operatorAreas = authorizationService.operatorAreasFor(userId),
                developerAreas = authorizationService.developerAreasFor(userId),
            ),
        )
    }

    @GetMapping("/roles/users")
    fun listRoleUsers(): ApiResult<List<AdminRoleUserResponse>> = success(roleService.listUsers(helper.requireUserId()))

    @PutMapping("/roles/users/{userId}")
    fun replaceRoles(@PathVariable userId: String, @RequestBody request: AdminRoleUpdateRequest): ApiResult<AdminRoleUserResponse> =
        success(roleService.replaceRoles(helper.requireUserId(), userId, request))

    @GetMapping("/audit-logs")
    fun listAuditLogs(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") size: Int,
    ): ApiResult<PagedDTO<AdminAuditLogResponse>> = success(auditService.list(helper.requireUserId(), page, size))
}
