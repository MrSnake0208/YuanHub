package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorPlannerImport
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorPlannerImportRepository : MongoRepository<OperatorPlannerImport, String> {
    fun findByUserIdAndAccountIdAndMigrationId(userId: String, accountId: String, migrationId: String): OperatorPlannerImport?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
