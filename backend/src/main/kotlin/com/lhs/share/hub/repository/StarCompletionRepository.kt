package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarCompletion
import org.springframework.data.mongodb.repository.MongoRepository

interface StarCompletionRepository : MongoRepository<StarCompletion, String> {
    fun findByUserIdAndAccountIdAndOperationId(userId: String, accountId: String, operationId: String): StarCompletion?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
