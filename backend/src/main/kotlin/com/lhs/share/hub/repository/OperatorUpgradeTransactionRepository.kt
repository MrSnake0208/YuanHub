package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorUpgradeTransaction
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorUpgradeTransactionRepository : MongoRepository<OperatorUpgradeTransaction, String> {
    fun findByUserIdAndAccountIdAndIdempotencyKey(userId: String, accountId: String, idempotencyKey: String): OperatorUpgradeTransaction?

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
