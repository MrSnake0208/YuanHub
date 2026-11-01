package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorAnnotation
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface OperatorAnnotationRepository : MongoRepository<OperatorAnnotation, String>, OperatorAnnotationRepositoryCustom {
    fun findByUserIdAndAccountIdAndOperatorId(userId: String, accountId: String, operatorId: String): OperatorAnnotation?
    fun findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId: String, accountId: String): List<OperatorAnnotation>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface OperatorAnnotationRepositoryCustom {
    fun compareAndSet(
        userId: String,
        accountId: String,
        operatorId: String,
        expectedRevision: Long,
        growthState: String,
        note: String?,
        updatedAt: Instant,
    ): OperatorAnnotation?
}

class OperatorAnnotationRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : OperatorAnnotationRepositoryCustom {
    override fun compareAndSet(
        userId: String,
        accountId: String,
        operatorId: String,
        expectedRevision: Long,
        growthState: String,
        note: String?,
        updatedAt: Instant,
    ): OperatorAnnotation? = template.findAndModify(
        Query.query(
            Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)
                .and("operatorId").`is`(operatorId).and("revision").`is`(expectedRevision),
        ),
        Update().set("growthState", growthState).set("note", note).set("updatedAt", updatedAt).inc("revision", 1),
        FindAndModifyOptions.options().returnNew(true),
        OperatorAnnotation::class.java,
    )
}
