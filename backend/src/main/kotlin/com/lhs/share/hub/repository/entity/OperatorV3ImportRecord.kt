package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** Idempotency and audit record for one committed v3 operator snapshot record. */
@Document("operator_v3_import_records")
@CompoundIndex(
    name = "idx_op_v3_import_user_account_record_unique",
    def = "{'userId': 1, 'accountId': 1, 'recordId': 1}",
    unique = true,
)
data class OperatorV3ImportRecord(
    @Id val id: String? = null,
    @Indexed val userId: String,
    val accountId: String,
    val sourceAccountId: String,
    val recordId: String,
    val game: String,
    val sourceKind: String,
    val snapshotScope: String,
    val payload: String,
    val revisions: Map<String, Long>,
    val importedAt: Instant = Instant.now(),
    val statuses: Map<String, String> = emptyMap(),
)
