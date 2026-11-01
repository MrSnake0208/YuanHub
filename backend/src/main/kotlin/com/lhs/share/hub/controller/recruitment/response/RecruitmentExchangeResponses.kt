package com.lhs.share.hub.controller.recruitment.response

import java.time.Instant

data class RecruitmentImportItem(
    val entityType: String,
    val id: String,
    val status: String,
    val reason: String,
    val displayName: String? = null,
)
data class RecruitmentImportStats(val added: Int, val duplicates: Int, val conflicts: Int, val skipped: Int)
data class RecruitmentImportPreviewResponse(
    val previewToken: String,
    val documentHash: String,
    val targetRevision: Long,
    val expiresAt: Instant,
    val items: List<RecruitmentImportItem>,
    val stats: RecruitmentImportStats,
    val risks: List<String>,
    val currentKnownTotal: Long,
    val backupKnownTotal: Long,
    val candidateKnownTotal: Long,
    val canCommit: Boolean,
)
