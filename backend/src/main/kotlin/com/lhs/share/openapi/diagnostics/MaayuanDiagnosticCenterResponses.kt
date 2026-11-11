package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.FeedbackDiagnosticSummary
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticIssue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant

data class DiagnosticIssueListItem(val issue: MaayuanDiagnosticIssue, val subjectName: String?)

data class DiagnosticIssuePage(
    val items: List<DiagnosticIssueListItem>,
    val total: Long,
    val page: Int,
    val pageSize: Int,
    val statusCounts: Map<String, Long>,
    val reasonCounts: Map<String, Long>,
    val pendingCount: Long,
    val recentEventCount: Long,
    val regressedCount: Long,
)

data class DiagnosticEventSummary(val id: String, val createdAt: Instant, val summary: FeedbackDiagnosticSummary)

data class DiagnosticIssueDetail(
    val issue: MaayuanDiagnosticIssue,
    val userCount: Int,
    val events: List<DiagnosticEventSummary>,
    val subjectInCatalog: Boolean?,
    val operatorNames: Map<String, String>,
)

data class DiagnosticEventImage(
    val assetId: String,
    val role: String,
    val issueIndex: Int?,
    val expired: Boolean,
    val status: String = "ready",
    @get:JsonInclude(JsonInclude.Include.NON_NULL) val url: String? = null,
) {
    override fun toString(): String = "DiagnosticEventImage(assetId=$assetId, role=$role, expired=$expired, status=$status)"
}

data class DiagnosticEventDetail(
    val id: String,
    val createdAt: Instant,
    val summary: FeedbackDiagnosticSummary,
    val manifest: JsonNode,
    val images: List<DiagnosticEventImage>,
)

data class DiagnosticIssueUpdateRequest(
    @field:NotBlank @field:Pattern(regexp = "NEW|FIXED|IGNORED") val status: String,
    @field:Size(max = 4000) val note: String? = null,
)

data class DiagnosticAnalysisRequest(
    @field:NotBlank @field:Size(max = 4000) val summary: String,
    @field:NotBlank @field:Size(max = 40) val suggestedAction: String,
    @field:Size(max = 120) val model: String? = null,
    @field:NotBlank @field:Size(max = 40) val source: String,
)
