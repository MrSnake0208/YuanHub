package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorResetTransaction
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorResetTransactionRepository : MongoRepository<OperatorResetTransaction, String> {
    fun findByUserIdAndAccountIdAndId(userId: String, accountId: String, id: String): OperatorResetTransaction?
    fun findByUserIdAndAccountIdAndIdempotencyKey(userId: String, accountId: String, idempotencyKey: String): OperatorResetTransaction?
    fun findByUserIdAndAccountIdAndGameAndOperatorIdAndIdLessThanOrderByIdDesc(
        userId: String,
        accountId: String,
        game: String,
        operatorId: String,
        id: String,
        pageable: Pageable,
    ): List<OperatorResetTransaction>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
