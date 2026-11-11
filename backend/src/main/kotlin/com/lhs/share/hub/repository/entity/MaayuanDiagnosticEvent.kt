package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("maayuan_diagnostic_events")
data class MaayuanDiagnosticEvent(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    @Indexed val createdAt: Instant,
    val summary: FeedbackDiagnosticSummary,
    val manifestAssetId: String,
    val images: List<MaayuanDiagnosticImage>,
    @Indexed val signatures: List<String>,
)

data class MaayuanDiagnosticImage(val assetId: String, val role: String, val issueIndex: Int? = null, val status: String = "ready")
