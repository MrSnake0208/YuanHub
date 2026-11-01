package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.InventoryRevision
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface InventoryRevisionRepository : MongoRepository<InventoryRevision, String>, InventoryRevisionRepositoryCustom {
    fun findByUserIdAndAccountId(userId: String, accountId: String): InventoryRevision?
    fun deleteByUserIdAndAccountId(userId: String, accountId: String): Long
}

interface InventoryRevisionRepositoryCustom {
    /** Must run in the same Hub transaction as stock writes. Existing import/upgrade saves share this document. */
    fun compareAndIncrement(userId: String, accountId: String, expectedRevision: Long, now: Instant): InventoryRevision?
}

class InventoryRevisionRepositoryImpl(
    @param:Qualifier(
        "hubMongoTemplate",
    ) private val template: MongoTemplate,
) : InventoryRevisionRepositoryCustom {
    override fun compareAndIncrement(userId: String, accountId: String, expectedRevision: Long, now: Instant): InventoryRevision? =
        template.findAndModify(
            Query.query(
                Criteria.where("_id").`is`("$userId:$accountId")
                    .and("userId").`is`(userId).and("accountId").`is`(accountId).and("revision").`is`(expectedRevision),
            ),
            Update().set("userId", userId).set("accountId", accountId)
                .set("revision", expectedRevision + 1).set("updatedAt", now),
            FindAndModifyOptions.options().upsert(expectedRevision == 0L).returnNew(true),
            InventoryRevision::class.java,
        )
}
