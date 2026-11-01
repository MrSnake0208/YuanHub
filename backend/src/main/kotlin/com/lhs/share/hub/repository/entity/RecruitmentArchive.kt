package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.data.annotation.Id
import org.springframework.data.convert.ValueConverter
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

@Document("recruitment_archives")
@CompoundIndex(name = "idx_recruitment_owner", def = "{'userId':1,'accountId':1}", unique = true)
data class RecruitmentArchive(
    @JsonIgnore @Id val id: String,
    @JsonIgnore val userId: String,
    val accountId: String,
    val gameSnapshot: String,
    val archiveRevision: Long = 0,
    val baseline: Long = 0,
    val currentPoolId: String? = null,
    val pools: List<RecruitmentPool> = emptyList(),
    val temporaryAgents: List<RecruitmentTemporaryAgent> = emptyList(),
    val nextEventOrder: Long = 1,
    val updatedAt: Instant = Instant.now(),
)

data class RecruitmentPoolSnapshot(
    val name: String,
    val game: String,
    val catalogPoolId: String? = null,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val startDate: LocalDate? = null,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val endDate: LocalDate? = null,
    val upAgentIds: List<String> = emptyList(),
    val upStatus: String = "unknown",
    val upAgentNames: List<String> = emptyList(),
    val unmappedUpAgentNames: List<String> = emptyList(),
    val catalogRevision: String? = null,
    val poolType: String? = null,
    val upAgents: List<RecruitmentUpAgent> = emptyList(),
    val allowCustomUp: Boolean = false,
)

/** Stable pool-owned identity. Binding a placeholder never changes its id. */
data class RecruitmentUpAgent(
    val id: String,
    val name: String,
    val operatorId: String? = null,
    val active: Boolean = true,
)

data class RecruitmentPool(
    val poolId: String,
    val snapshot: RecruitmentPoolSnapshot,
    val progress: Long? = null,
    val mappedSnapshot: RecruitmentPoolSnapshot? = null,
    val wishAgentIds: List<String> = emptyList(),
)

data class RecruitmentTemporaryAgent(
    val agentId: String,
    val name: String,
    val mappedAgentId: String? = null,
    val mappedName: String? = null,
)

data class RecruitmentAgentSnapshot(
    val agentId: String,
    val name: String,
    val temporary: Boolean = false,
    val catalogRevision: String? = null,
    val rarity: Int = 5,
)
