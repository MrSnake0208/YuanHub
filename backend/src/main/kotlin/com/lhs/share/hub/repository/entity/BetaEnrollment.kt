package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.util.UUID

@Document("hub_beta_enrollments")
@CompoundIndexes(
    CompoundIndex(name = "beta_user_unique", def = "{'campaignId':1,'userId':1}", unique = true),
    CompoundIndex(name = "beta_queue", def = "{'campaignId':1,'status':1,'queueSequence':1}"),
    CompoundIndex(name = "beta_reserved_queue", def = "{'campaignId':1,'status':1,'shareSnapshotEligible':1,'queueSequence':1}"),
)
data class BetaEnrollment(
    @Id val id: String = UUID.randomUUID().toString(),
    val campaignId: String,
    val userId: String,
    var status: BetaEnrollmentStatus = BetaEnrollmentStatus.WAITING,
    val shareSnapshotEligible: Boolean,
    val snapshotId: String?,
    var queueSequence: Long,
    var joinedAt: Instant,
    val createdAt: Instant = joinedAt,
    var grantedAt: Instant? = null,
    var slotPool: BetaSlotPool? = null,
    var grantTrigger: String? = null,
    var acceptedRulesVersion: String,
    var acceptedAt: Instant = joinedAt,
    var intentTags: Set<String> = emptySet(),
    var withdrawnAt: Instant? = null,
    var withdrawReason: String? = null,
)
