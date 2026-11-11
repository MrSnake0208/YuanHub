package com.lhs.share.hub.repository.entity

import java.io.Serializable

data class FeedbackDiagnosticSummary(
    val feature: String,
    val outcome: String,
    val issueCodes: List<String>,
    val operatorIds: List<String>,
    val resourceVersion: String,
    val issues: List<FeedbackDiagnosticIssueSummary> = emptyList(),
    val resource: String? = null,
    val uiScript: String? = null,
) : Serializable

data class FeedbackDiagnosticIssueSummary(
    val code: String,
    val stage: String,
    val reason: String? = null,
    val errorType: String? = null,
    val count: Int,
    val operatorIds: List<String>,
    val candidateOperatorIds: List<String> = emptyList(),
    val ocrSamples: List<String> = emptyList(),
) : Serializable
