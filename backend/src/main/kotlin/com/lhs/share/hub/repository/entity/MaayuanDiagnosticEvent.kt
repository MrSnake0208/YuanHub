package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.math.BigDecimal
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
    val trace: List<MaayuanDiagnosticTraceStep> = emptyList(),
    val log: MaayuanDiagnosticLog? = null,
)

data class MaayuanDiagnosticLog(val assetId: String, val status: String, val size: Long)

data class MaayuanDiagnosticImage(
    val assetId: String,
    val role: String,
    val issueIndex: Int? = null,
    val status: String = "ready",
    val operatorId: String? = null,
    val traceIndex: Int? = null,
    val nodeRoi: List<Int>? = null,
)

data class MaayuanDiagnosticTraceStep(
    val kind: String,
    val node: String,
    val stage: String,
    val hit: Boolean,
    val n: Int,
    val t: Int,
    val dt: Int? = null,
    val algo: String? = null,
    val score: BigDecimal? = null,
    val box: List<Int>? = null,
    val text: String? = null,
)
