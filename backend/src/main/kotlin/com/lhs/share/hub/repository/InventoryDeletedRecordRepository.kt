package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.InventoryDeletedRecord
import org.springframework.data.mongodb.repository.MongoRepository

interface InventoryDeletedRecordRepository : MongoRepository<InventoryDeletedRecord, String> {
    fun findByUserIdAndAccountIdAndRecordId(userId: String, accountId: String, recordId: String): InventoryDeletedRecord?

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
