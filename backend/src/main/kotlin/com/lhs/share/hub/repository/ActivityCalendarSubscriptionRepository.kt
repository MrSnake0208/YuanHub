package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.ActivityCalendarSubscription
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository

@Repository
class ActivityCalendarSubscriptionRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun owner(userId: String, accountId: String) = Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)

    fun find(userId: String, accountId: String, eventId: String): ActivityCalendarSubscription? =
        template.findOne(Query(owner(userId, accountId).and("eventId").`is`(eventId)), ActivityCalendarSubscription::class.java)

    fun list(userId: String, accountId: String): List<ActivityCalendarSubscription> =
        template.find(Query(owner(userId, accountId).and("subscribed").`is`(true)), ActivityCalendarSubscription::class.java)

    fun exists(userId: String, accountId: String): Boolean =
        template.exists(Query(owner(userId, accountId)), ActivityCalendarSubscription::class.java)

    fun save(value: ActivityCalendarSubscription): ActivityCalendarSubscription = template.save(value)

    fun deleteAccount(userId: String, accountId: String) {
        template.remove(Query(owner(userId, accountId)), ActivityCalendarSubscription::class.java)
    }
}
