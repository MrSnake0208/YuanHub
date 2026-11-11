package com.lhs.share.hub.repository.entity

import java.io.Serializable

data class FeedbackDiagnosticSummary(
    val feature: String,
    val outcome: String,
    val issueCodes: List<String>,
    val operatorIds: List<String>,
    val resourceVersion: String,
) : Serializable
