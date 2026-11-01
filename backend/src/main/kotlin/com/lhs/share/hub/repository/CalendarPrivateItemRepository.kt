package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository
import java.time.LocalDate

@Repository
class CalendarPrivateItemRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun owner(userId: String, accountId: String) = Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)

    fun list(userId: String, accountId: String, game: String, from: LocalDate, to: LocalDate): List<CalendarPrivateItem> = template.find(
        Query(
            owner(userId, accountId).and("game").`is`(game).and("date").lte(to).orOperator(
                Criteria.where("recurrence").`is`("MONTHLY"),
                Criteria.where("endDate").gte(from),
                Criteria.where("endDate").`is`(null).and("date").gte(from),
            ),
        )
            .with(Sort.by("date", "time", "_id")).limit(1001),
        CalendarPrivateItem::class.java,
    )

    fun find(userId: String, accountId: String, game: String, id: String): CalendarPrivateItem? =
        template.findOne(Query(owner(userId, accountId).and("game").`is`(game).and("_id").`is`(id)), CalendarPrivateItem::class.java)

    fun save(value: CalendarPrivateItem): CalendarPrivateItem = template.save(value)

    fun delete(userId: String, accountId: String, game: String, id: String, version: Long): Boolean = template.remove(
        Query(owner(userId, accountId).and("game").`is`(game).and("_id").`is`(id).and("version").`is`(version)),
        CalendarPrivateItem::class.java,
    ).deletedCount == 1L

    fun exists(userId: String, accountId: String): Boolean =
        template.exists(Query(owner(userId, accountId)), CalendarPrivateItem::class.java)

    fun deleteAccount(userId: String, accountId: String) {
        template.remove(Query(owner(userId, accountId)), CalendarPrivateItem::class.java)
    }
}
