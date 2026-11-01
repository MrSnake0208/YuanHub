package com.lhs.share.hub.repository

import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.repository.entity.AchievementSuggestion
import com.lhs.share.hub.repository.entity.AchievementSuggestionStatus
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
class AchievementSuggestionRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    fun find(id: String): AchievementSuggestion? = mongo.findById(id, AchievementSuggestion::class.java)
    fun findRequest(actor: String, requestId: String): AchievementSuggestion? = mongo.findOne(
        Query(Criteria.where("submitterId").`is`(actor).and("clientRequestId").`is`(requestId)),
        AchievementSuggestion::class.java,
    )
    fun insert(value: AchievementSuggestion): AchievementSuggestion = mongo.insert(value)

    fun list(
        actor: String?,
        status: AchievementSuggestionStatus?,
        game: String?,
        page: Int,
        size: Int,
    ): Pair<List<AchievementSuggestion>, Long> {
        val query = Query()
        actor?.let { query.addCriteria(Criteria.where("submitterId").`is`(it)) }
        status?.let { query.addCriteria(Criteria.where("status").`is`(it)) }
        game?.let { query.addCriteria(Criteria.where("original.game").`is`(it)) }
        val total = mongo.count(query, AchievementSuggestion::class.java)
        query.with(Sort.by(if (actor == null) Sort.Direction.ASC else Sort.Direction.DESC, "createdAt", "_id"))
            .skip((page.toLong() - 1) * size).limit(size)
        return mongo.find(query, AchievementSuggestion::class.java) to total
    }

    private fun pending(id: String, version: Long) = Query(
        Criteria.where("_id").`is`(id).and("status").`is`(AchievementSuggestionStatus.PENDING).and("version").`is`(version),
    )

    // The version fence is acquired inside the same transaction as the catalog append.
    fun lockPending(id: String, version: Long): Boolean =
        mongo.updateFirst(pending(id, version), Update().inc("version", 1L), AchievementSuggestion::class.java).modifiedCount == 1L

    fun accept(id: String, lockedVersion: Long, actor: String, note: String?, entry: AchievementEntry): AchievementSuggestion? =
        mongo.findAndModify(
            pending(id, lockedVersion),
            audit(actor, note).set("status", AchievementSuggestionStatus.ACCEPTED).set("achievementId", entry.achievementId)
                .set("acceptedSnapshot", entry),
            FindAndModifyOptions.options().returnNew(true),
            AchievementSuggestion::class.java,
        )

    fun reject(id: String, version: Long, actor: String, note: String): AchievementSuggestion? = mongo.findAndModify(
        pending(id, version),
        audit(actor, note).inc("version", 1L).set("status", AchievementSuggestionStatus.REJECTED),
        FindAndModifyOptions.options().returnNew(true),
        AchievementSuggestion::class.java,
    )

    private fun audit(actor: String, note: String?) =
        Update().set("reviewedBy", actor).set("reviewedAt", Instant.now()).set("reviewNote", note)
}
