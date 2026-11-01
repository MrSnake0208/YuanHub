package com.lhs.share.hub.controller.changelog.response

import com.lhs.share.hub.repository.entity.ChangelogEntry
import com.lhs.share.hub.repository.entity.ChangelogPublishedRevision
import com.lhs.share.hub.repository.entity.ChangelogWorkingRevision
import java.time.Instant

data class ChangelogPublicResponse(
    val id: String,
    val revision: Long,
    val title: String,
    val versionLabel: String,
    val body: Map<String, Any?>,
    val publishedAt: Instant,
) {
    companion object {
        fun of(entry: ChangelogEntry): ChangelogPublicResponse {
            val revision = requireNotNull(entry.publishedRevision)
            return ChangelogPublicResponse(
                entry.id,
                revision.revision,
                revision.title,
                revision.versionLabel,
                revision.body,
                revision.publishedAt,
            )
        }
    }
}

data class ChangelogWorkingResponse(
    val revision: Long,
    val state: String,
    val title: String,
    val versionLabel: String,
    val body: Map<String, Any?>,
    val authoredBy: String,
    val updatedBy: String,
    val updatedAt: Instant,
    val submittedBy: String?,
    val submittedAt: Instant?,
    val rejectionReason: String?,
    val rejectedBy: String?,
    val rejectedAt: Instant?,
) {
    companion object {
        fun of(value: ChangelogWorkingRevision) = ChangelogWorkingResponse(
            value.revision,
            value.state.name,
            value.title,
            value.versionLabel,
            value.body,
            value.authoredBy,
            value.updatedBy,
            value.updatedAt,
            value.submittedBy,
            value.submittedAt,
            value.rejectionReason,
            value.rejectedBy,
            value.rejectedAt,
        )
    }
}

data class ChangelogPublishedAdminResponse(
    val revision: Long,
    val title: String,
    val versionLabel: String,
    val body: Map<String, Any?>,
    val authoredBy: String,
    val submittedBy: String,
    val submittedAt: Instant,
    val approvedBy: String,
    val publishedAt: Instant,
) {
    companion object {
        fun of(value: ChangelogPublishedRevision) = ChangelogPublishedAdminResponse(
            value.revision,
            value.title,
            value.versionLabel,
            value.body,
            value.authoredBy,
            value.submittedBy,
            value.submittedAt,
            value.approvedBy,
            value.publishedAt,
        )
    }
}

data class ChangelogAdminResponse(
    val id: String,
    val version: Long,
    val createdBy: String,
    val createdAt: Instant,
    val updatedBy: String,
    val updatedAt: Instant,
    val workingRevision: ChangelogWorkingResponse?,
    val publishedRevision: ChangelogPublishedAdminResponse?,
    val withdrawnAt: Instant?,
    val withdrawnBy: String?,
) {
    companion object {
        fun of(entry: ChangelogEntry) = ChangelogAdminResponse(
            entry.id,
            entry.version ?: 0,
            entry.createdBy,
            entry.createdAt,
            entry.updatedBy,
            entry.updatedAt,
            entry.workingRevision?.let(ChangelogWorkingResponse::of),
            entry.publishedRevision?.let(ChangelogPublishedAdminResponse::of),
            entry.withdrawnAt,
            entry.withdrawnBy,
        )
    }
}

data class ChangelogError(val code: String, val message: String, val fieldPath: String? = null)

data class ChangelogErrorResponse(val error: ChangelogError)
