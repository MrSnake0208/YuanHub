package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class AdminRole {
    PLATFORM_ADMIN,
    CHANGELOG_EDITOR,
    CHANGELOG_REVIEWER,
    ACTIVITY_CALENDAR_EDITOR,
    ARCHIVE_USER,
    OPERATOR_PANEL_USER,
    SUPER_ADMIN,
}

@Document("admin_role_bindings")
data class AdminRoleBinding(
    @Id
    val userId: String,
    val roles: Set<AdminRole>,
    val grantedBy: String,
    val grantedAt: Instant,
    val updatedBy: String,
    val updatedAt: Instant,
    @Version
    val version: Long? = null,
)
