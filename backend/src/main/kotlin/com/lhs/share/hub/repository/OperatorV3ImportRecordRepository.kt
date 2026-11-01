package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorV3ImportRecord
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorV3ImportRecordRepository : MongoRepository<OperatorV3ImportRecord, String> {
    fun findByUserIdAndAccountIdAndRecordId(userId: String, accountId: String, recordId: String): OperatorV3ImportRecord?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
