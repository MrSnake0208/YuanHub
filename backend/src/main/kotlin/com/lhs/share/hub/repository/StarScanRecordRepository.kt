package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarScanRecord
import org.springframework.data.mongodb.repository.MongoRepository

interface StarScanRecordRepository : MongoRepository<StarScanRecord, String> {
    fun findByUserIdAndAccountIdAndRecordId(userId: String, accountId: String, recordId: String): StarScanRecord?
    fun findTop20ByUserIdAndAccountIdAndAppliedAtIsNullOrderByCreatedAtDesc(userId: String, accountId: String): List<StarScanRecord>
    fun countByUserIdAndAccountIdAndAppliedAtIsNull(userId: String, accountId: String): Long
    fun deleteByUserIdAndAccountId(userId: String, accountId: String)
}
