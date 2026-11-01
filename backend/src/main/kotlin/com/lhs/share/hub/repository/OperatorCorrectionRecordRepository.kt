package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorCorrectionRecordRepository : MongoRepository<OperatorCorrectionRecord, String> {
    fun findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc(userId: String, accountId: String, game: String): List<OperatorCorrectionRecord>

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
