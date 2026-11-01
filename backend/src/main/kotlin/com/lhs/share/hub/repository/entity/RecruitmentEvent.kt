package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.data.annotation.Id
import org.springframework.data.convert.ValueConverter
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

@Document("recruitment_events")
@CompoundIndexes(
    CompoundIndex(name = "idx_recruitment_event_unique", def = "{'userId':1,'accountId':1,'eventId':1}", unique = true),
    CompoundIndex(name = "idx_recruitment_event_page", def = "{'userId':1,'accountId':1,'deletedAt':1,'sortOrder':-1,'eventId':-1}"),
    CompoundIndex(
        name = "idx_recruitment_pool_page",
        def = "{'userId':1,'accountId':1,'poolId':1,'deletedAt':1,'sortOrder':-1,'eventId':-1}",
    ),
    CompoundIndex(name = "idx_recruitment_batch_events", def = "{'userId':1,'accountId':1,'batchId':1}"),
)
data class RecruitmentEvent(
    @JsonIgnore @Id val id: String,
    @JsonIgnore val userId: String,
    @JsonIgnore val accountId: String,
    val eventId: String,
    val poolId: String,
    val poolSnapshot: RecruitmentPoolSnapshot,
    val agentSnapshot: RecruitmentAgentSnapshot,
    val pullSpan: Long?,
    val sortOrder: Long,
    val upStatus: String = "unknown",
    @field:ValueConverter(ActivityCalendarDateConverter::class) val acquiredDate: LocalDate? = null,
    val note: String? = null,
    val source: String = "manual",
    val batchId: String? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = createdAt,
    val deletedAt: Instant? = null,
    val deletedRevision: Long? = null,
    val importBatchId: String? = null,
    val importedAt: Instant? = null,
    // Legacy deletions did not deduct batch counts; only new deductions may be added back by undo.
    @JsonIgnore val batchCountDeducted: Boolean = false,
)

@Document("recruitment_batches")
@CompoundIndexes(
    CompoundIndex(name = "idx_recruitment_batch_unique", def = "{'userId':1,'accountId':1,'batchId':1}", unique = true),
    CompoundIndex(name = "idx_recruitment_batch_page", def = "{'userId':1,'accountId':1,'deletedAt':1,'createdAt':-1,'batchId':-1}"),
)
data class RecruitmentBatch(
    @JsonIgnore @Id val id: String,
    @JsonIgnore val userId: String,
    @JsonIgnore val accountId: String,
    val batchId: String,
    val poolId: String,
    val totalPullCount: Long,
    val createdAt: Instant = Instant.now(),
    val deletedAt: Instant? = null,
    val deletedRevision: Long? = null,
    val importBatchId: String? = null,
    val importedAt: Instant? = null,
)

@Document("recruitment_requests")
@CompoundIndex(name = "idx_recruitment_request_unique", def = "{'userId':1,'accountId':1,'requestId':1}", unique = true)
data class RecruitmentRequestRecord(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val requestId: String,
    val requestHash: String,
    val archiveRevision: Long,
    val eventIds: List<String> = emptyList(),
    val poolId: String? = null,
    val agentId: String? = null,
    val batchId: String? = null,
    val createdAt: Instant = Instant.now(),
)
