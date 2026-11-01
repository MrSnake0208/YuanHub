package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.TodayPreferences
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.Base64

@Repository
class TodayPreferencesRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun id(userId: String, mode: String) =
        Base64.getUrlEncoder().withoutPadding().encodeToString(userId.toByteArray(Charsets.UTF_8)) + ":" + mode

    private fun owner(userId: String, mode: String) =
        Criteria.where("_id").`is`(id(userId, mode)).and("userId").`is`(userId).and("layoutMode").`is`(mode)

    fun find(userId: String, mode: String): TodayPreferences? = template.findOne(Query(owner(userId, mode)), TodayPreferences::class.java)

    fun replace(userId: String, mode: String, expected: Long, hidden: List<String>, now: Instant): TodayPreferences? {
        if (expected == 0L) {
            // _id唯一性保护首次建档，后续写入使用同一模式的原子CAS。
            return try {
                template.insert(TodayPreferences(id(userId, mode), userId, mode, hidden, updatedAt = now))
            } catch (_: DuplicateKeyException) {
                null
            }
        }
        return template.findAndModify(
            Query(owner(userId, mode).and("version").`is`(expected)),
            Update().set("hiddenModules", hidden).set("schemaVersion", 1).set("updatedAt", now).inc("version", 1L),
            FindAndModifyOptions.options().returnNew(true),
            TodayPreferences::class.java,
        )
    }
}
