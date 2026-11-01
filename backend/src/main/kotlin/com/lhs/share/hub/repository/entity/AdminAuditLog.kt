package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class AdminAuditAction {
    LEDGER_CATALOG_UPDATED,
    BETA_UPDATED,
    ROLE_GRANTED,
    ROLE_REVOKED,
    ROLE_REPLACED,
    FEEDBACK_ACCESS_UPDATED,
    FEEDBACK_ACCESS_DELETED,
    FEEDBACK_CATEGORY_CREATED,
    FEEDBACK_CATEGORY_RENAMED,
    FEEDBACK_CATEGORY_VISIBILITY_UPDATED,
    FEEDBACK_CATEGORY_REORDERED,
    FEEDBACK_SPACE_UPDATED,
    RECRUITMENT_ACCESS_MODE_UPDATED,
    RECRUITMENT_ACCESS_GRANTED,
    RECRUITMENT_ACCESS_REVOKED,
    CHANGELOG_PUBLISHED,
    CHANGELOG_REJECTED,
    CHANGELOG_WITHDRAWN,
}

data class AdminAuditSnapshot(
    val ledger: Map<String, String>? = null,
    val beta: Map<String, String>? = null,
    val roles: Set<String>? = null,
    val receiveAreas: Set<String>? = null,
    val manageAreas: Set<String>? = null,
    val feedbackRoles: Set<String>? = null,
    val operatorAreas: Set<String>? = null,
    val developerAreas: Set<String>? = null,
    val recruitmentAccess: Map<String, String>? = null,
    val feedbackCategoryLabel: String? = null,
    val feedbackCategoryHidden: Boolean? = null,
    val feedbackCategoryOrder: List<String>? = null,
    val feedbackSpaceLabel: String? = null,
    val feedbackSpaceActive: Boolean? = null,
)

@Document("admin_audit_logs")
data class AdminAuditLog(
    @Id
    val id: String? = null,
    val actorUserId: String,
    val action: AdminAuditAction,
    val targetUserId: String? = null,
    val targetResource: String? = null,
    val before: AdminAuditSnapshot? = null,
    val after: AdminAuditSnapshot? = null,
    val occurredAt: Instant = Instant.now(),
    val requestId: String? = null,
)
