package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorDailyTasks
import com.lhs.share.hub.repository.entity.OperatorTrainingTask
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.Base64

@Repository
class OperatorDailyTasksRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun id(user: String, account: String, plan: String, date: String) = listOf(user, account, plan, date).joinToString(":") {
        Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray(Charsets.UTF_8))
    }

    private fun owner(user: String, account: String, plan: String, date: String) =
        Criteria.where("_id").`is`(id(user, account, plan, date)).and("userId").`is`(user)
            .and("accountId").`is`(account).and("planId").`is`(plan).and("date").`is`(date)

    fun find(user: String, account: String, plan: String, date: String): OperatorDailyTasks? =
        template.findOne(Query(owner(user, account, plan, date)), OperatorDailyTasks::class.java)

    fun replace(
        user: String,
        account: String,
        plan: String,
        date: String,
        expected: Long,
        tasks: List<OperatorTrainingTask>,
        now: Instant,
    ): OperatorDailyTasks? {
        if (expected ==
            0L
        ) {
            return template.insert(OperatorDailyTasks(id(user, account, plan, date), user, account, plan, date, tasks, 1, now))
        }
        return template.findAndModify(
            Query(owner(user, account, plan, date).and("version").`is`(expected)),
            Update().set("tasks", tasks).set("updatedAt", now).inc("version", 1L),
            FindAndModifyOptions.options().returnNew(true),
            OperatorDailyTasks::class.java,
        )
    }

    fun deleteAccount(user: String, account: String) {
        template.remove(Query(Criteria.where("userId").`is`(user).and("accountId").`is`(account)), OperatorDailyTasks::class.java)
    }
}
