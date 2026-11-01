package com.lhs.share.hub.service.admin

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.FeedbackAccessGrantRepository
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.service.report.FeedbackCategoryService
import com.lhs.share.service.UserService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

enum class AdminPermission(val value: String) {
    LEDGER_CATALOG_WRITE("ledger_catalog:write"),
    BETA_MANAGE("beta:manage"),
    ARCHIVE_ACCESS("archive:access"),
    OPERATOR_PANEL_USE("operator_panel:use"),
    OPERATOR_RELATIONSHIP_USE("operator_relationship:use"),
    OPERATOR_RESERVE_USE("operator_reserve:use"),
    STAR_SCAN_REVIEW("star_scan:review"),
    OPERATOR_CATALOG_WRITE("operator_catalog:write"),
    RECRUITMENT_CATALOG_WRITE("recruitment_catalog:write"),
    ACHIEVEMENT_CATALOG_WRITE("achievement_catalog:write"),
    BOND_CATALOG_WRITE("bond_catalog:write"),
    RECRUITMENT_ACCESS_MANAGE("recruitment_access:manage"),
    LEVEL_CATALOG_WRITE("level_catalog:write"),
    DEVELOPMENT_GOAL_MANAGE("development_goal:manage"),
    ACTIVITY_CALENDAR_WRITE("activity_calendar:write"),
    CHANGELOG_WRITE("changelog:write"),
    CHANGELOG_REVIEW("changelog:review"),
    ADMIN_ROLE_MANAGE("admin:role:manage"),
    ADMIN_FEEDBACK_ACCESS_MANAGE("admin:feedback_access:manage"),
    ADMIN_AUDIT_READ("admin:audit:read"),
}

@Service
class AdminAuthorizationService(
    private val roleRepository: AdminRoleBindingRepository,
    private val feedbackAccessRepository: FeedbackAccessGrantRepository,
    private val userService: UserService,
    private val categories: FeedbackCategoryService,
    @param:Value("\${share.archive-data-owner-id:}") private val archiveDataOwnerId: String = "",
) {
    fun rolesFor(userId: String): Set<AdminRole> {
        if (userService.get(userId)?.activated != true) return emptySet()
        return roleRepository.findById(userId).orElse(null)?.roles.orEmpty()
    }

    fun hasRole(userId: String, role: AdminRole): Boolean = role in rolesFor(userId)

    /** Matches the frontend's management-capability semantics: admin roles or feedback manage grants. */
    fun hasAnyAdminCapability(userId: String): Boolean {
        if (userService.get(userId)?.activated != true) return false
        val roles = roleRepository.findById(userId).orElse(null)?.roles.orEmpty()
        if (roles.any { it != AdminRole.ARCHIVE_USER && it != AdminRole.OPERATOR_PANEL_USER }) return true
        val grant = feedbackAccessRepository.findById(userId).orElse(null)
        return grant?.manageAreas.orEmpty().isNotEmpty() || grant?.feedbackRoles.orEmpty().isNotEmpty()
    }

    fun hasPermission(userId: String, permission: AdminPermission): Boolean {
        val roles = rolesFor(userId)
        if (permission in setOf(AdminPermission.ACHIEVEMENT_CATALOG_WRITE, AdminPermission.BOND_CATALOG_WRITE)) {
            return archiveDataOwnerId.isNotBlank() && userId == archiveDataOwnerId &&
                roles.any { it == AdminRole.SUPER_ADMIN || it == AdminRole.PLATFORM_ADMIN }
        }
        if (AdminRole.SUPER_ADMIN in roles) return true
        return when (permission) {
            // Roadmap features stay administrator-only until their individual releases.
            AdminPermission.ARCHIVE_ACCESS,
            AdminPermission.OPERATOR_PANEL_USE,
            AdminPermission.OPERATOR_RELATIONSHIP_USE,
            AdminPermission.OPERATOR_RESERVE_USE,
            AdminPermission.STAR_SCAN_REVIEW,
            AdminPermission.LEDGER_CATALOG_WRITE,
            AdminPermission.BETA_MANAGE,
            AdminPermission.OPERATOR_CATALOG_WRITE,
            AdminPermission.RECRUITMENT_CATALOG_WRITE,
            AdminPermission.ACHIEVEMENT_CATALOG_WRITE,
            AdminPermission.BOND_CATALOG_WRITE,
            AdminPermission.RECRUITMENT_ACCESS_MANAGE,
            AdminPermission.LEVEL_CATALOG_WRITE,
            AdminPermission.DEVELOPMENT_GOAL_MANAGE,
            -> AdminRole.PLATFORM_ADMIN in roles
            AdminPermission.ACTIVITY_CALENDAR_WRITE -> AdminRole.PLATFORM_ADMIN in roles || AdminRole.ACTIVITY_CALENDAR_EDITOR in roles
            AdminPermission.CHANGELOG_WRITE -> AdminRole.CHANGELOG_EDITOR in roles
            AdminPermission.CHANGELOG_REVIEW -> AdminRole.CHANGELOG_REVIEWER in roles
            else -> false
        }
    }

    fun requirePermission(userId: String, permission: AdminPermission) {
        if (!hasPermission(userId, permission)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "权限不足: ${permission.value}")
        }
    }

    fun receiveAreasFor(userId: String): Set<String> {
        if (userService.get(userId)?.activated != true) return emptySet()
        return feedbackAccessRepository.findById(userId).orElse(null)?.receiveAreas.orEmpty()
    }

    fun manageableAreasFor(userId: String): Set<String> {
        if (userService.get(userId)?.activated != true) return emptySet()
        val roles = roleRepository.findById(userId).orElse(null)?.roles.orEmpty()
        if (AdminRole.SUPER_ADMIN in roles) return categories.keys()
        return feedbackAccessRepository.findById(userId).orElse(null)?.manageAreas.orEmpty()
    }

    fun feedbackRolesFor(userId: String): Set<String> {
        if (userService.get(userId)?.activated != true) return emptySet()
        return feedbackAccessRepository.findById(userId).orElse(null)?.feedbackRoles.orEmpty()
    }

    fun operatorAreasFor(userId: String): Set<String> {
        if (hasRole(userId, AdminRole.SUPER_ADMIN)) return categories.keys()
        if ("OPERATOR" !in feedbackRolesFor(userId)) return emptySet()
        return feedbackAccessRepository.findById(userId).orElse(null)?.operatorAreas.orEmpty()
    }

    fun developerAreasFor(userId: String): Set<String> {
        if (hasRole(userId, AdminRole.SUPER_ADMIN)) return categories.keys()
        if ("DEVELOPER" !in feedbackRolesFor(userId)) return emptySet()
        return feedbackAccessRepository.findById(userId).orElse(null)?.developerAreas.orEmpty()
    }

    fun superAdminUserIds(): Set<String> = roleRepository.findByRolesContaining(AdminRole.SUPER_ADMIN)
        .map { it.userId }
        .filter { userService.get(it)?.activated == true }
        .toSet()

    fun managerUserIdsFor(area: String): Set<String> {
        val grantUserIds = feedbackAccessRepository.findByManageAreasContaining(area)
            .map { it.userId }
        return (grantUserIds + superAdminUserIds())
            .filter { userService.get(it)?.activated == true }
            .toSet()
    }

    fun canReadFeedback(userId: String, area: String): Boolean = area in manageableAreasFor(userId)

    fun canManageFeedback(userId: String, area: String): Boolean = area in manageableAreasFor(userId)

    fun requireFeedbackRead(userId: String, area: String) {
        if (!canReadFeedback(userId, area)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈模块的查看权限")
        }
    }

    fun requireFeedbackManage(userId: String, area: String) {
        if (!canManageFeedback(userId, area)) {
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "没有该反馈模块的管理权限")
        }
    }

    fun permissionsFor(userId: String): Set<String> {
        val permissions = AdminPermission.entries
            .filter { hasPermission(userId, it) }
            .mapTo(linkedSetOf()) { it.value }
        manageableAreasFor(userId).forEach { area ->
            permissions += "feedback:$area:read"
            permissions += "feedback:$area:manage"
        }
        return permissions.toSortedSet()
    }
}
