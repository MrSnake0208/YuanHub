package com.lhs.share.hub.controller.recruitment.request

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent
import java.time.Instant
import java.time.LocalDate

/** This document contains no database identity or authentication information. */
data class RecruitmentExchangeDocument(
    val schema: String,
    val exportedAt: Instant,
    val sourceAccount: RecruitmentExchangeAccount? = null,
    val game: String,
    @param:JsonProperty(required = true) val archiveRevision: Long,
    @param:JsonProperty(required = true) val baseline: Long,
    @param:JsonProperty(required = true) val currentPoolId: String?,
    val pools: List<RecruitmentPool>,
    val temporaryAgents: List<RecruitmentTemporaryAgent>,
    val events: List<RecruitmentExchangeEvent>,
    val batches: List<RecruitmentExchangeBatch>,
)

data class RecruitmentExchangeAccount(val accountId: String)

data class RecruitmentExchangeEvent(
    val eventId: String,
    val poolId: String,
    val poolSnapshot: RecruitmentPoolSnapshot,
    val agentSnapshot: RecruitmentAgentSnapshot,
    @param:JsonProperty(required = true) val pullSpan: Long?,
    @param:JsonProperty(required = true) val sortOrder: Long,
    val upStatus: String,
    val acquiredDate: LocalDate? = null,
    val note: String? = null,
    val source: String,
    val batchId: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val deletedRevision: Long? = null,
    val importBatchId: String? = null,
    val importedAt: Instant? = null,
)

data class RecruitmentExchangeBatch(
    val batchId: String,
    val poolId: String,
    @param:JsonProperty(required = true) val totalPullCount: Long,
    val createdAt: Instant,
    val deletedAt: Instant? = null,
    val deletedRevision: Long? = null,
    val importBatchId: String? = null,
    val importedAt: Instant? = null,
)

data class RecruitmentImportOptions(val stateStrategy: String = "keep_current", val confirmCountChange: Boolean = false)
data class RecruitmentImportPreviewRequest(
    val accountId: String,
    val document: JsonNode,
    val options: RecruitmentImportOptions = RecruitmentImportOptions(),
)
data class RecruitmentImportCommitRequest(
    val accountId: String,
    val document: JsonNode,
    val options: RecruitmentImportOptions = RecruitmentImportOptions(),
    val previewToken: String,
    val documentHash: String,
    @param:JsonProperty(required = true) val expectedRevision: Long,
    val requestId: String,
)
