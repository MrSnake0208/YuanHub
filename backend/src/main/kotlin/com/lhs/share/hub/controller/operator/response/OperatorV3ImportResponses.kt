package com.lhs.share.hub.controller.operator.response

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant
import java.util.UUID

data class OperatorV3ImportPreviewResponse(
    val format: String = "myshare-operator-import-preview",
    val version: Int = 1,
    val accepted: Int,
    val partial: Int,
    val review: Int,
    val rejected: Int,
    val unchanged: Int,
    val items: List<OperatorV3ImportItem>,
)

data class OperatorV3ImportCommitResponse(
    val accepted: Int,
    val partial: Int,
    val review: Int,
    val rejected: Int,
    val unchanged: Int,
    val items: List<OperatorV3ImportItem>,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class OperatorV3ImportItem(
    val accountId: String,
    val operatorId: String,
    val recordId: String,
    val status: String,
    val changes: Map<String, OperatorV3FieldChange> = emptyMap(),
    val warnings: List<OperatorV3Issue> = emptyList(),
    val blockingErrors: List<OperatorV3Issue> = emptyList(),
    val stale: Boolean = false,
    val targetRevision: Long? = null,
    val revision: Long? = null,
    val observedStatus: String? = null,
)

data class OperatorV3FieldChange(val before: Any?, val after: Any?)

data class OperatorV3Issue(
    val code: String,
    val message: String,
    val field: String? = null,
)

data class OperatorScanReviewResponse(
    val accountId: String,
    val recordId: String,
    val operatorId: String,
    val status: String,
    val document: com.fasterxml.jackson.databind.JsonNode,
    val warnings: List<OperatorV3Issue>,
    val blockingErrors: List<OperatorV3Issue>,
    val updatedAt: Instant,
)

/** Transient SSE notification; operator_current remains the durable source of truth. */
data class OperatorScanImportEvent(
    val eventId: String = UUID.randomUUID().toString(),
    val accountId: String,
    val operatorId: String,
    val recordId: String,
    val status: String,
    val revision: Long? = null,
    val stale: Boolean = false,
    val observedStatus: String? = null,
    val warnings: List<OperatorV3Issue> = emptyList(),
    val blockingErrors: List<OperatorV3Issue> = emptyList(),
    val occurredAt: Instant = Instant.now(),
)

internal fun List<OperatorV3ImportItem>.toPreviewResponse() = OperatorV3ImportPreviewResponse(
    accepted = count { it.status == "accepted" },
    partial = count { it.status == "partial" },
    review = count { it.status == "review" },
    rejected = count { it.status == "rejected" },
    unchanged = count { it.status == "unchanged" },
    items = this,
)

internal fun List<OperatorV3ImportItem>.toCommitResponse() = OperatorV3ImportCommitResponse(
    accepted = count { it.status == "accepted" },
    partial = count { it.status == "partial" },
    review = count { it.status == "review" },
    rejected = count { it.status == "rejected" },
    unchanged = count { it.status == "unchanged" },
    items = this,
)
