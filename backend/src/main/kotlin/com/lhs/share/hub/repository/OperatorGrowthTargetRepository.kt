package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorGrowthTarget
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface OperatorGrowthTargetRepository : MongoRepository<OperatorGrowthTarget, String>, OperatorGrowthTargetRepositoryCustom {
    fun findByUserIdAndAccountIdAndOperatorId(userId: String, accountId: String, operatorId: String): OperatorGrowthTarget?
    fun findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId: String, accountId: String): List<OperatorGrowthTarget>
    fun deleteByUserIdAndAccountIdAndOperatorId(userId: String, accountId: String, operatorId: String): Long
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface OperatorGrowthTargetRepositoryCustom {
    fun compareAndSet(
        userId: String,
        accountId: String,
        operatorId: String,
        expectedRevision: Long,
        level: Int?,
        elite: Int?,
        starLevel: Int?,
        heartPaper: Int?,
        updatedAt: Instant,
        huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
    ): OperatorGrowthTarget?

    fun deleteIfRevision(userId: String, accountId: String, operatorId: String, expectedRevision: Long): Boolean
}

class OperatorGrowthTargetRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : OperatorGrowthTargetRepositoryCustom {
    override fun compareAndSet(
        userId: String,
        accountId: String,
        operatorId: String,
        expectedRevision: Long,
        level: Int?,
        elite: Int?,
        starLevel: Int?,
        heartPaper: Int?,
        updatedAt: Instant,
        huaji: com.lhs.share.hub.repository.entity.OperatorHuaji?,
    ): OperatorGrowthTarget? = template.findAndModify(
        Query.query(
            Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)
                .and("operatorId").`is`(operatorId).and("revision").`is`(expectedRevision),
        ),
        Update().set("targetLevel", level).set("targetElite", elite).set("targetStarLevel", starLevel)
            .set("targetHeartPaper", heartPaper).set("targetHuaji", huaji).set("updatedAt", updatedAt).inc("revision", 1),
        FindAndModifyOptions.options().returnNew(true),
        OperatorGrowthTarget::class.java,
    )

    override fun deleteIfRevision(userId: String, accountId: String, operatorId: String, expectedRevision: Long): Boolean = template.remove(
        Query.query(
            Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)
                .and("operatorId").`is`(operatorId).and("revision").`is`(expectedRevision),
        ),
        OperatorGrowthTarget::class.java,
    ).deletedCount == 1L
}
