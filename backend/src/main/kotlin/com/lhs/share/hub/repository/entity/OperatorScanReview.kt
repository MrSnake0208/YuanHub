package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_scan_reviews")
@CompoundIndex(name = "idx_operator_scan_review_unique", def = "{'userId':1,'accountId':1,'recordId':1,'operatorId':1}", unique = true)
data class OperatorScanReview(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val recordId: String,
    val operatorId: String,
    val status: String,
    val document: String,
    val warnings: List<com.lhs.share.hub.controller.operator.response.OperatorV3Issue>,
    val blockingErrors: List<com.lhs.share.hub.controller.operator.response.OperatorV3Issue>,
    val updatedAt: Instant = Instant.now(),
)
