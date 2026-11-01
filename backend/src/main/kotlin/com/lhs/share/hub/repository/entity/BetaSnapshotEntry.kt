package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.util.UUID

@Document("hub_beta_snapshot_entries")
@CompoundIndex(name = "beta_snapshot_user_unique", def = "{'campaignId':1,'snapshotId':1,'userId':1}", unique = true)
data class BetaSnapshotEntry(
    @Id val id: String = UUID.randomUUID().toString(),
    val campaignId: String,
    val snapshotId: String,
    val userId: String,
    val capturedAt: Instant,
)
