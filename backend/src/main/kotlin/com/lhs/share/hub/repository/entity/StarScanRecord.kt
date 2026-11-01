package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("star_scan_records")
@CompoundIndex(name = "idx_star_scan_owner_record", def = "{'userId': 1, 'accountId': 1, 'recordId': 1}", unique = true)
data class StarScanRecord(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val recordId: String,
    val report: String,
    val createdAt: Instant = Instant.now(),
    val appliedRequest: String? = null,
    val receipt: String? = null,
    val appliedAt: Instant? = null,
)
