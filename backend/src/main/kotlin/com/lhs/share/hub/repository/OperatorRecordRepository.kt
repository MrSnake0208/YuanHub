package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorRecord
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorRecordRepository : MongoRepository<OperatorRecord, String> {
    fun findByUserIdAndAccountIdAndRecordId(userId: String, accountId: String, recordId: String): OperatorRecord?
    fun findByUserIdAndAccountIdOrderByEffectiveAtAsc(userId: String, accountId: String): List<OperatorRecord>
    fun findByUserIdAndAccountIdOrderByEffectiveAtDesc(userId: String, accountId: String): List<OperatorRecord>
    fun findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc(userId: String, accountId: String, game: String?): List<OperatorRecord>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
