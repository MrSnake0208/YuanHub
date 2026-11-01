package com.lhs.share.hub.controller.admin.response

import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminAuditSnapshot
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import java.time.Instant

data class AdminAccessResponse(
    val roles: Set<String>,
    val permissions: Set<String>,
    val receiveAreas: Set<String>,
    val manageAreas: Set<String>,
    val superAdmin: Boolean,
    val feedbackRoles: Set<String> = emptySet(),
    val operatorAreas: Set<String> = emptySet(),
    val developerAreas: Set<String> = emptySet(),
)

data class AdminRoleUserResponse(
    val userId: String,
    val userName: String,
    val activated: Boolean,
    val roles: Set<String>,
    val grantedBy: String,
    val grantedAt: Instant,
    val updatedBy: String,
    val updatedAt: Instant,
) {
    constructor(binding: AdminRoleBinding, userName: String, activated: Boolean) : this(
        userId = binding.userId,
        userName = userName,
        activated = activated,
        roles = binding.roles.map { it.name }.toSortedSet(),
        grantedBy = binding.grantedBy,
        grantedAt = binding.grantedAt,
        updatedBy = binding.updatedBy,
        updatedAt = binding.updatedAt,
    )
}

data class AdminAuditLogResponse(
    val id: String,
    val actorUserId: String,
    val action: String,
    val targetUserId: String?,
    val targetResource: String?,
    val before: AdminAuditSnapshot?,
    val after: AdminAuditSnapshot?,
    val occurredAt: Instant,
    val requestId: String?,
) {
    constructor(log: AdminAuditLog) : this(
        id = checkNotNull(log.id),
        actorUserId = log.actorUserId,
        action = log.action.name,
        targetUserId = log.targetUserId,
        targetResource = log.targetResource,
        before = log.before,
        after = log.after,
        occurredAt = log.occurredAt,
        requestId = log.requestId,
    )
}
