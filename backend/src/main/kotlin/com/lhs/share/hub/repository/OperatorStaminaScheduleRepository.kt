package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorStaminaSchedule
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface OperatorStaminaScheduleRepository : MongoRepository<OperatorStaminaSchedule, String>, OperatorStaminaScheduleRepositoryCustom {
    fun findByUserIdAndAccountIdAndPlanId(userId: String, accountId: String, planId: String): OperatorStaminaSchedule?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface OperatorStaminaScheduleRepositoryCustom {
    fun replace(userId: String, accountId: String, planId: String, expected: Long, payload: String, now: Instant): OperatorStaminaSchedule?
}

class OperatorStaminaScheduleRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : OperatorStaminaScheduleRepositoryCustom {
    override fun replace(
        userId: String,
        accountId: String,
        planId: String,
        expected: Long,
        payload: String,
        now: Instant,
    ): OperatorStaminaSchedule? = template.findAndModify(
        Query.query(
            Criteria.where("_id").`is`("$userId:$accountId:$planId").and("userId").`is`(userId)
                .and("accountId").`is`(accountId).and("planId").`is`(planId).and("revision").`is`(expected),
        ),
        Update().set("userId", userId).set("accountId", accountId).set("planId", planId).set("payloadJson", payload)
            .set("revision", expected + 1).set("updatedAt", now),
        FindAndModifyOptions.options().upsert(expected == 0L).returnNew(true),
        OperatorStaminaSchedule::class.java,
    )
}
