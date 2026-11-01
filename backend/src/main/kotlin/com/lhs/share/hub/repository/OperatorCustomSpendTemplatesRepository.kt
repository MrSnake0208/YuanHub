package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorCustomSpendTemplates
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
class OperatorCustomSpendTemplatesRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun find(userId: String): OperatorCustomSpendTemplates? = template.findById(userId, OperatorCustomSpendTemplates::class.java)

    fun replace(userId: String, expected: Long, payload: String, now: Instant): OperatorCustomSpendTemplates? {
        if (expected == 0L) {
            return try {
                template.insert(OperatorCustomSpendTemplates(userId, payload, 1, now))
            } catch (_: DuplicateKeyException) {
                null
            }
        }
        return template.findAndModify(
            Query(Criteria.where("_id").`is`(userId).and("revision").`is`(expected)),
            Update().set("payloadJson", payload).set("updatedAt", now).inc("revision", 1L),
            FindAndModifyOptions.options().returnNew(true),
            OperatorCustomSpendTemplates::class.java,
        )
    }
}
