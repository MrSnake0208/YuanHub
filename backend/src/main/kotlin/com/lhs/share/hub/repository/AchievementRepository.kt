package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.AchievementArchive
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository

@Repository
class AchievementRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    private fun owner(userId: String, accountId: String) = Query(Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId))

    fun find(userId: String, accountId: String): AchievementArchive? =
        mongo.findOne(owner(userId, accountId), AchievementArchive::class.java)
    fun save(value: AchievementArchive): AchievementArchive = mongo.save(value)
    fun hasSubstantiveData(userId: String, accountId: String): Boolean = find(userId, accountId)?.records?.any { it.substantive() } == true
    fun deleteAccount(userId: String, accountId: String) {
        mongo.remove(owner(userId, accountId), AchievementArchive::class.java)
    }
}
