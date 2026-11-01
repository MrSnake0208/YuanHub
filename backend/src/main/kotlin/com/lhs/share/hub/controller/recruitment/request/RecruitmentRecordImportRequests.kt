package com.lhs.share.hub.controller.recruitment.request

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.LocalDate

data class RecruitmentRecordImportDocument(
    val schema: String,
    val game: String,
    val events: List<RecruitmentRecordImportEvent>,
    val batches: List<RecruitmentRecordImportBatch> = emptyList(),
)

data class RecruitmentRecordImportEvent(
    val eventId: String,
    val catalogPoolId: String,
    val agentId: String,
    @param:JsonProperty(required = true) val pullSpan: Long?,
    val upStatus: String = "unknown",
    val acquiredDate: LocalDate? = null,
    val note: String? = null,
    val batchId: String? = null,
)

data class RecruitmentRecordImportBatch(
    val batchId: String,
    val catalogPoolId: String,
    @param:JsonProperty(required = true) val totalPullCount: Long,
)
