package com.lhs.share.hub.controller.recruitment.response

import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent

data class RecruitmentSummary(
    val knownTotalPulls: Long,
    val recordedPulls: Long,
    val batchPulls: Long,
    val knownProgress: Long,
    val eventCount: Long,
    val exactEventCount: Long,
    val unknownEventCount: Long,
    val unknownProgressCount: Int,
    val hasUnknown: Boolean,
    val upAgentCounts: Map<String, Long>? = null,
    val fourStarCount: Long = 0,
    val averageGoldPulls: Double? = null,
    val smallPityWinRate: Double? = null,
    val permanentKnownTotalPulls: Long? = null,
    val mostObtainedGoldAgents: List<RecruitmentAgentCount>? = null,
    val mostNonUpGoldAgents: List<RecruitmentAgentCount>? = null,
    val mostPermanentGoldAgents: List<RecruitmentAgentCount>? = null,
    val upGoldCount: Long? = null,
    val knownUpGoldCount: Long? = null,
    val unknownUpGoldCount: Long? = null,
    val totalUpRate: Double? = null,
    val guaranteedGoldCount: Long? = null,
    val pityHistoryAssumption: String? = null,
    val pityStatus: String? = null,
)

data class RecruitmentAgentCount(val agentId: String, val name: String, val count: Long)

data class RecruitmentArchiveResponse(
    val accountId: String,
    val gameSnapshot: String,
    val archiveRevision: Long,
    val baseline: Long,
    val currentPoolId: String?,
    val pools: List<RecruitmentPool>,
    val temporaryAgents: List<RecruitmentTemporaryAgent>,
    val summary: RecruitmentSummary,
    val gameMismatch: Boolean,
    val poolSummaries: Map<String, RecruitmentSummary> = emptyMap(),
    val poolStates: Map<String, String> = emptyMap(),
)

data class RecruitmentEventPage(val items: List<RecruitmentEvent>, val nextCursor: String?, val archiveRevision: Long)
data class RecruitmentBatchResponse(val items: List<RecruitmentBatch>, val nextCursor: String?, val archiveRevision: Long)
data class RecruitmentCommandResponse(
    val archiveRevision: Long,
    val eventIds: List<String> = emptyList(),
    val poolId: String? = null,
    val agentId: String? = null,
    val batchId: String? = null,
)

data class RecruitmentCatalogAdminResponse(val pools: List<RecruitmentCatalogPool>)

data class RecruitmentCatalogImportResponse(
    val createdCount: Int,
    val skippedCount: Int,
    val createdPoolIds: List<String>,
    val skippedPoolIds: List<String>,
)
