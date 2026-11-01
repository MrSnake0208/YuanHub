package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface OperatorCurrentRepository : MongoRepository<OperatorCurrent, String>, OperatorCurrentRepositoryCustom {
    fun findByUserIdAndAccountIdAndGame(userId: String, accountId: String, game: String): OperatorCurrent?
    fun findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId: String, accountId: String): List<OperatorCurrent>
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
    fun deleteByUserIdAndAccountIdAndGame(userId: String, accountId: String, game: String)
}

interface OperatorCurrentRepositoryCustom {
    fun compareAndSetEntries(
        userId: String,
        accountId: String,
        game: String,
        operatorId: String,
        expectedRevision: Long,
        entries: Map<String, OperatorEntry>,
        updatedAt: Instant,
    ): OperatorCurrent?
}

class OperatorCurrentRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val mongoTemplate: MongoTemplate,
) : OperatorCurrentRepositoryCustom {
    override fun compareAndSetEntries(
        userId: String,
        accountId: String,
        game: String,
        operatorId: String,
        expectedRevision: Long,
        entries: Map<String, OperatorEntry>,
        updatedAt: Instant,
    ): OperatorCurrent? {
        val conditions = mutableListOf(
            Criteria.where("userId").`is`(userId),
            Criteria.where("accountId").`is`(accountId),
            Criteria.where("game").`is`(game),
            revisionCriteria(operatorId, expectedRevision),
        )
        entries.filterKeys { it != operatorId }.forEach { (id, entry) ->
            conditions += revisionCriteria(id, entry.revision - 1)
        }
        val query = Query.query(Criteria().andOperator(*conditions.toTypedArray()))
        val update = Update().set("updatedAt", updatedAt)
        entries.forEach { (id, entry) -> update.set("entries.$id", entry) }
        return mongoTemplate.findAndModify(
            query,
            update,
            FindAndModifyOptions.options().returnNew(true),
            OperatorCurrent::class.java,
        )
    }

    private fun revisionCriteria(operatorId: String, expectedRevision: Long): Criteria {
        val path = "entries.$operatorId.revision"
        return if (expectedRevision == 0L) {
            Criteria().orOperator(Criteria.where(path).`is`(0L), Criteria.where(path).exists(false))
        } else {
            Criteria.where(path).`is`(expectedRevision)
        }
    }
}
