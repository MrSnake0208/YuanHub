package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("maayuan_diagnostic_issues")
@CompoundIndex(name = "idx_diagnostic_status_seen", def = "{'status': 1, 'lastSeenAt': -1}")
data class MaayuanDiagnosticIssue(
    @Id val id: String,
    val key: String,
    @Indexed val reason: String,
    val code: String,
    val subjectKind: String,
    val subject: String,
    val stages: List<String> = emptyList(),
    val candidateOperatorIds: List<String> = emptyList(),
    val ocrSamples: List<String> = emptyList(),
    val status: String = "NEW",
    val regressedAt: Instant? = null,
    val eventCount: Long = 0,
    val firstSeenAt: Instant,
    val lastSeenAt: Instant,
    val latestEventId: String,
    val clientVersions: List<String> = emptyList(),
    val resourceVersions: List<String> = emptyList(),
    val catalogVersions: List<String> = emptyList(),
    val resourceCounts: Map<String, Long> = emptyMap(),
    val uiScriptCounts: Map<String, Long> = emptyMap(),
    val note: String = "",
    val statusUpdatedBy: String? = null,
    val statusUpdatedAt: Instant? = null,
    val agentAnalysis: MaayuanDiagnosticAnalysis? = null,
    val reasons: List<String> = emptyList(),
    val operatorIds: List<String> = emptyList(),
    @get:JsonInclude(JsonInclude.Include.NON_EMPTY) val nodes: List<String> = emptyList(),
)

data class MaayuanDiagnosticAnalysis(
    val summary: String,
    val suggestedAction: String,
    val model: String?,
    val source: String,
    val updatedAt: Instant,
)
