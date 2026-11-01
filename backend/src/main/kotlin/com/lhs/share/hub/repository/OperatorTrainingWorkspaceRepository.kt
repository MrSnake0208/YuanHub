package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorTrainingWorkspace
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface OperatorTrainingWorkspaceRepository :
    MongoRepository<OperatorTrainingWorkspace, String>,
    OperatorTrainingWorkspaceRepositoryCustom {
    fun findByUserIdAndAccountId(userId: String, accountId: String): OperatorTrainingWorkspace?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface OperatorTrainingWorkspaceRepositoryCustom {
    fun replace(userId: String, accountId: String, expected: Long, payload: String, now: Instant): OperatorTrainingWorkspace?
}

class OperatorTrainingWorkspaceRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : OperatorTrainingWorkspaceRepositoryCustom {
    override fun replace(userId: String, accountId: String, expected: Long, payload: String, now: Instant): OperatorTrainingWorkspace? =
        template.findAndModify(
            Query.query(
                Criteria.where("_id").`is`("$userId:$accountId").and("userId").`is`(userId)
                    .and("accountId").`is`(accountId).and("revision").`is`(expected),
            ),
            Update().set("userId", userId).set("accountId", accountId).set("payloadJson", payload)
                .set("revision", expected + 1).set("updatedAt", now),
            FindAndModifyOptions.options().upsert(expected == 0L).returnNew(true),
            OperatorTrainingWorkspace::class.java,
        )
}
