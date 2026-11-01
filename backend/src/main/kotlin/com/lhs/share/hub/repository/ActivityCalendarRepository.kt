package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.LocalDate

@Repository
class ActivityCalendarRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun list(
        game: String?,
        from: LocalDate?,
        to: LocalDate?,
        categories: Set<ActivityCalendarCategory>,
        enabled: Boolean?,
    ): List<ActivityCalendarEvent> {
        val query = Query()
        game?.let { query.addCriteria(Criteria.where("game").`is`(it)) }
        from?.let {
            query.addCriteria(Criteria().orOperator(Criteria.where("endDate").gte(it), Criteria.where("endDate").`is`(null)))
        }
        to?.let { query.addCriteria(Criteria.where("startDate").lte(it)) }
        if (categories.isNotEmpty()) query.addCriteria(Criteria.where("category").`in`(categories))
        enabled?.let { query.addCriteria(Criteria.where("enabled").`is`(it)) }
        return template.find(query, ActivityCalendarEvent::class.java)
    }

    fun find(id: String): ActivityCalendarEvent? = template.findById(id, ActivityCalendarEvent::class.java)

    fun findAll(ids: Collection<String>): List<ActivityCalendarEvent> =
        if (ids.isEmpty()) emptyList() else template.find(Query(Criteria.where("_id").`in`(ids)), ActivityCalendarEvent::class.java)

    fun updateClassification(
        event: ActivityCalendarEvent,
        category: ActivityCalendarCategory,
        subtype: ActivityCalendarSubtype?,
        actor: String,
    ): Boolean {
        val query = Query(Criteria.where("_id").`is`(event.id).and("version").`is`(event.version))
        val update = Update().set("category", category).set("subtype", subtype).set("subtypeDetail", null)
            .set("updatedBy", actor).set("updatedAt", Instant.now()).set("version", (event.version ?: 0L) + 1L)
        return template.updateFirst(query, update, ActivityCalendarEvent::class.java).modifiedCount == 1L
    }

    fun save(event: ActivityCalendarEvent): ActivityCalendarEvent = template.save(event)

    fun insert(event: ActivityCalendarEvent): ActivityCalendarEvent = template.insert(event)
}
