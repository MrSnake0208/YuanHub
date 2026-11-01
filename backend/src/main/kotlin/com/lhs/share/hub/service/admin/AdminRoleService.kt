package com.lhs.share.hub.service.admin

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.admin.request.AdminRoleUpdateRequest
import com.lhs.share.hub.controller.admin.response.AdminRoleUserResponse
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminAuditSnapshot
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.service.UserService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class AdminRoleService(
    private val repository: AdminRoleBindingRepository,
    private val userService: UserService,
    private val authorizationService: AdminAuthorizationService,
    private val auditService: AdminAuditService,
) {
    private val roleUpdateLock = Any()

    fun listUsers(actorUserId: String): List<AdminRoleUserResponse> {
        authorizationService.requirePermission(actorUserId, AdminPermission.ADMIN_ROLE_MANAGE)
        return repository.findAll()
            .filter { it.roles.isNotEmpty() }
            .map { binding ->
                val user = userService.get(binding.userId)
                AdminRoleUserResponse(binding, user?.userName ?: "未知用户", user?.activated == true)
            }
            .sortedBy { it.userName }
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun replaceRoles(actorUserId: String, targetUserId: String, request: AdminRoleUpdateRequest): AdminRoleUserResponse {
        authorizationService.requirePermission(actorUserId, AdminPermission.ADMIN_ROLE_MANAGE)
        return synchronized(roleUpdateLock) {
            val roles = parseRoles(request.roles)
            val user = userService.getRequired(targetUserId)
            if (!user.activated && roles.isNotEmpty()) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "只能为已激活用户配置管理员角色")
            }
            val current = repository.findById(targetUserId).orElse(null)
            val beforeRoles = current?.roles.orEmpty()
            if (
                user.activated &&
                AdminRole.SUPER_ADMIN in beforeRoles &&
                AdminRole.SUPER_ADMIN !in roles &&
                activeSuperAdminCount() <= 1
            ) {
                throw ApiResultException(HttpStatus.CONFLICT.value(), "不能降级最后一名可用超级管理员")
            }

            val now = Instant.now()
            val saved = if (roles.isEmpty()) {
                if (current != null) repository.deleteById(targetUserId)
                null
            } else {
                repository.save(
                    AdminRoleBinding(
                        userId = targetUserId,
                        roles = roles,
                        grantedBy = current?.grantedBy ?: actorUserId,
                        grantedAt = current?.grantedAt ?: now,
                        updatedBy = actorUserId,
                        updatedAt = now,
                        version = current?.version,
                    ),
                )
            }

            auditService.record(
                AdminAuditLog(
                    actorUserId = actorUserId,
                    action = roleAction(beforeRoles, roles),
                    targetUserId = targetUserId,
                    targetResource = "admin_role_bindings/$targetUserId",
                    before = AdminAuditSnapshot(roles = beforeRoles.map { it.name }.toSortedSet()),
                    after = AdminAuditSnapshot(roles = roles.map { it.name }.toSortedSet()),
                    occurredAt = now,
                ),
            )

            val responseBinding = saved ?: AdminRoleBinding(
                userId = targetUserId,
                roles = emptySet(),
                grantedBy = current?.grantedBy ?: actorUserId,
                grantedAt = current?.grantedAt ?: now,
                updatedBy = actorUserId,
                updatedAt = now,
            )
            AdminRoleUserResponse(responseBinding, user.userName, activated = user.activated)
        }
    }

    private fun activeSuperAdminCount(): Int = repository.findByRolesContaining(AdminRole.SUPER_ADMIN)
        .count { userService.get(it.userId)?.activated == true }

    private fun parseRoles(values: Set<String>): Set<AdminRole> = values.map { value ->
        try {
            AdminRole.valueOf(value.trim().uppercase())
        } catch (_: IllegalArgumentException) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "未知管理员角色: $value")
        }
    }.toSet()

    private fun roleAction(before: Set<AdminRole>, after: Set<AdminRole>): AdminAuditAction = when {
        after.containsAll(before) && after.size > before.size -> AdminAuditAction.ROLE_GRANTED
        before.containsAll(after) && before.size > after.size -> AdminAuditAction.ROLE_REVOKED
        else -> AdminAuditAction.ROLE_REPLACED
    }
}
