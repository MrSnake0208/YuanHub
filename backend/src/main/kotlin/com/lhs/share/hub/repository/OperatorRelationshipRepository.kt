package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorRelationships
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
class OperatorRelationshipRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun id(user: String, account: String, game: String) = listOf(user, account, game).joinToString(":") {
        Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray(Charsets.UTF_8))
    }
    private fun owner(user: String, account: String) = Criteria.where("userId").`is`(user).and("accountId").`is`(account)
    fun find(user: String, account: String, game: String): OperatorRelationships? = template.findOne(
        Query(owner(user, account).and("_id").`is`(id(user, account, game)).and("game").`is`(game)),
        OperatorRelationships::class.java,
    )
    fun replace(user: String, account: String, game: String, expected: Long, entries: String): OperatorRelationships? {
        val now = Instant.now()
        if (expected == 0L) return template.insert(OperatorRelationships(id(user, account, game), user, account, game, entries, 1, now))
        return template.findAndModify(
            Query(owner(user, account).and("_id").`is`(id(user, account, game)).and("revision").`is`(expected)),
            Update().set("entriesJson", entries).set("updatedAt", now).inc("revision", 1L),
            FindAndModifyOptions.options().returnNew(true),
            OperatorRelationships::class.java,
        )
    }
    fun hasSubstantiveData(user: String, account: String): Boolean = template.exists(
        Query(owner(user, account).and("entriesJson").ne("{}")),
        OperatorRelationships::class.java,
    )
    fun deleteAccount(user: String, account: String) {
        template.remove(Query(owner(user, account)), OperatorRelationships::class.java)
    }
}
