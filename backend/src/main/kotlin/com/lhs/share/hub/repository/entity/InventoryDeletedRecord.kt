package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** 原记录备份；和删除、恢复及库存重放处于同一个 Hub Mongo transaction。 */
@Document("inventory_deleted_records")
@CompoundIndex(name = "idx_deleted_user_account_record", def = "{'userId': 1, 'accountId': 1, 'recordId': 1}", unique = true)
data class InventoryDeletedRecord(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val recordId: String,
    val record: InventoryRecord,
    val deletedAt: Instant = Instant.now(),
)
