package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorMatchConnection
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorMatchConnectionRepository : MongoRepository<OperatorMatchConnection, String> {
    fun findByToken(token: String): OperatorMatchConnection?
    fun findFirstByUserIdOrderByCreatedAtAscIdAsc(userId: String): OperatorMatchConnection?
    fun deleteAllByUserId(userId: String)
}
