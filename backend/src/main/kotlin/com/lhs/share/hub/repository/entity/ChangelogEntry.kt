package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class ChangelogRevisionState {
    DRAFT,
    IN_REVIEW,
}

data class ChangelogWorkingRevision(
    val revision: Long,
    val state: ChangelogRevisionState,
    val title: String,
    val versionLabel: String,
    val body: Map<String, Any?>,
    val mediaIds: Set<String>,
    val authoredBy: String,
    val updatedBy: String,
    val updatedAt: Instant,
    val submittedBy: String? = null,
    val submittedAt: Instant? = null,
    val rejectionReason: String? = null,
    val rejectedBy: String? = null,
    val rejectedAt: Instant? = null,
)

data class ChangelogPublishedRevision(
    val revision: Long,
    val title: String,
    val versionLabel: String,
    val body: Map<String, Any?>,
    val mediaIds: Set<String>,
    val authoredBy: String,
    val submittedBy: String,
    val submittedAt: Instant,
    val approvedBy: String,
    @Indexed
    val publishedAt: Instant,
)

@Document("changelog_entries")
data class ChangelogEntry(
    @Id
    val id: String,
    val createdBy: String,
    val createdAt: Instant,
    val updatedBy: String,
    val updatedAt: Instant,
    val publishedRevision: ChangelogPublishedRevision? = null,
    val workingRevision: ChangelogWorkingRevision? = null,
    val withdrawnAt: Instant? = null,
    val withdrawnBy: String? = null,
    @Version
    val version: Long? = null,
)
