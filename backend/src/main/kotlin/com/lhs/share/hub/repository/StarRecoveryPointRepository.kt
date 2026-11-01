package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import org.springframework.data.mongodb.repository.MongoRepository

interface StarRecoveryPointRepository : MongoRepository<StarRecoveryPoint, String> {
    fun findByUserIdAndAccountIdAndRecoveryPointId(userId: String, accountId: String, recoveryPointId: String): StarRecoveryPoint?
    fun findTop3ByUserIdAndAccountIdOrderByCreatedAtDescIdDesc(userId: String, accountId: String): List<StarRecoveryPoint>
    fun findByUserIdAndAccountIdOrderByCreatedAtDescIdDesc(userId: String, accountId: String): List<StarRecoveryPoint>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
