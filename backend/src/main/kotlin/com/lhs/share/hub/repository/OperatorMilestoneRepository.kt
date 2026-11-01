package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorMilestones
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.Base64

@Repository
class OperatorMilestoneRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun id(user: String, account: String, game: String, operator: String) =
        listOf(user, account, game, operator).joinToString(":") {
            Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray(Charsets.UTF_8))
        }

    private fun owner(user: String, account: String, game: String, operator: String) =
        Criteria.where("userId").`is`(user).and("accountId").`is`(account).and("game").`is`(game).and("operatorId").`is`(operator)

    fun find(user: String, account: String, game: String, operator: String): OperatorMilestones? = template.findOne(
        Query(owner(user, account, game, operator).and("_id").`is`(id(user, account, game, operator))),
        OperatorMilestones::class.java,
    )

    fun replace(
        user: String,
        account: String,
        game: String,
        operator: String,
        expected: Long,
        dates: Map<String, String>,
    ): OperatorMilestones? {
        if (expected ==
            0L
        ) {
            return template.insert(OperatorMilestones(id(user, account, game, operator), user, account, game, operator, dates, 1))
        }
        return template.findAndModify(
            Query(owner(user, account, game, operator).and("_id").`is`(id(user, account, game, operator)).and("revision").`is`(expected)),
            Update().set("dates", dates).inc("revision", 1L),
            FindAndModifyOptions.options().returnNew(true),
            OperatorMilestones::class.java,
        )
    }

    fun observedAt(user: String, account: String, game: String, operator: String, milestone: String): Instant? {
        val criteria = owner(user, account, game, operator).and("huaji.owned").`is`(true)
        if (milestone == "awakening") {
            criteria.and("huaji.awakened").`is`(true)
        } else {
            criteria.and("huaji.stage").`is`(1 + (milestone.removePrefix("star_").toInt() - 1) * 6)
        }
        return template.findOne(
            Query(criteria).with(Sort.by(Sort.Direction.ASC, "createdAt")).limit(1),
            OperatorCorrectionRecord::class.java,
        )?.createdAt
    }

    fun deleteAccount(user: String, account: String) {
        template.remove(Query(Criteria.where("userId").`is`(user).and("accountId").`is`(account)), OperatorMilestones::class.java)
    }
}
