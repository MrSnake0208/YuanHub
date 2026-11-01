package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestion
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
class ActivityCalendarSuggestionRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun find(id: String): ActivityCalendarSuggestion? = template.findById(id, ActivityCalendarSuggestion::class.java)

    fun findRequest(userId: String, requestId: String): ActivityCalendarSuggestion? = template.findOne(
        Query(Criteria.where("submitterId").`is`(userId).and("clientRequestId").`is`(requestId)),
        ActivityCalendarSuggestion::class.java,
    )

    fun insert(suggestion: ActivityCalendarSuggestion): ActivityCalendarSuggestion = template.insert(suggestion)

    fun list(
        userId: String?,
        status: ActivityCalendarSuggestionStatus?,
        game: String?,
        page: Int,
        pageSize: Int,
    ): Pair<List<ActivityCalendarSuggestion>, Long> {
        val query = Query()
        userId?.let { query.addCriteria(Criteria.where("submitterId").`is`(it)) }
        status?.let { query.addCriteria(Criteria.where("status").`is`(it)) }
        game?.let { query.addCriteria(Criteria.where("original.game").`is`(it)) }
        val total = template.count(query, ActivityCalendarSuggestion::class.java)
        val direction = if (userId == null) Sort.Direction.ASC else Sort.Direction.DESC
        query.with(Sort.by(direction, "createdAt", "_id")).skip((page.toLong() - 1) * pageSize).limit(pageSize)
        return template.find(query, ActivityCalendarSuggestion::class.java) to total
    }

    /** Only review fields change. Originals and request identity are immutable. */
    fun review(
        id: String,
        expectedVersion: Long,
        status: ActivityCalendarSuggestionStatus,
        actor: String,
        note: String?,
        event: ActivityCalendarEvent? = null,
    ): ActivityCalendarSuggestion? = template.findAndModify(
        Query(
            Criteria.where(
                "_id",
            ).`is`(id).and("status").`is`(ActivityCalendarSuggestionStatus.PENDING).and("version").`is`(expectedVersion),
        ),
        Update().set("status", status).inc("version", 1L).set("reviewedBy", actor).set("reviewedAt", Instant.now())
            .set("reviewNote", note).set("eventId", event?.id).set("acceptedSnapshot", event),
        FindAndModifyOptions.options().returnNew(true),
        ActivityCalendarSuggestion::class.java,
    )
}
