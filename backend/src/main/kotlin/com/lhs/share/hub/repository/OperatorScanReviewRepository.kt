package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorScanReview
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorScanReviewRepository : MongoRepository<OperatorScanReview, String> {
    fun findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId: String, accountId: String): List<OperatorScanReview>

    fun findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(
        userId: String,
        accountId: String,
        operatorId: String,
    ): List<OperatorScanReview>

    fun deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(
        userId: String,
        accountId: String,
        operatorId: String,
        recordIds: Collection<String>,
    )

    fun findByUserIdAndAccountIdAndRecordIdAndOperatorId(
        userId: String,
        accountId: String,
        recordId: String,
        operatorId: String,
    ): OperatorScanReview?

    fun deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(userId: String, accountId: String, recordId: String, operatorId: String)

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
