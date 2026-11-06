package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarInventorySync
import com.lhs.share.hub.repository.entity.StarPlanInheritancePending
import org.springframework.data.mongodb.repository.MongoRepository

interface StarInventorySyncRepository : MongoRepository<StarInventorySync, String> {
    fun findByUserIdAndAccountIdAndScanId(userId: String, accountId: String, scanId: String): StarInventorySync?
    fun findAllByUserIdAndAccountId(userId: String, accountId: String): java.util.stream.Stream<StarInventorySync>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface StarPlanInheritancePendingRepository : MongoRepository<StarPlanInheritancePending, String> {
    fun findByUserIdAndAccountId(userId: String, accountId: String): StarPlanInheritancePending?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
