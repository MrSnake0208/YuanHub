package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface StarLoadoutCurrentRepository : MongoRepository<StarLoadoutCurrent, String>, StarLoadoutCurrentRepositoryCustom {
    fun findByUserIdAndAccountId(userId: String, accountId: String): StarLoadoutCurrent?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface StarLoadoutCurrentRepositoryCustom {
    fun replaceForGeneration(
        userId: String,
        accountId: String,
        expectedRevision: Long,
        generation: Long,
        loadouts: List<StarOperatorLoadout>,
        now: Instant,
    ): StarLoadoutCurrent?
}

class StarLoadoutCurrentRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : StarLoadoutCurrentRepositoryCustom {
    override fun replaceForGeneration(
        userId: String,
        accountId: String,
        expectedRevision: Long,
        generation: Long,
        loadouts: List<StarOperatorLoadout>,
        now: Instant,
    ): StarLoadoutCurrent? = template.findAndModify(
        Query.query(
            Criteria.where("_id").`is`("$userId:$accountId").and("userId").`is`(userId)
                .and("accountId").`is`(accountId).and("revision").`is`(expectedRevision),
        ),
        Update().set("userId", userId).set("accountId", accountId).set("loadouts", loadouts)
            .set("generation", generation).set("revision", expectedRevision + 1).set("updatedAt", now),
        FindAndModifyOptions.options().upsert(expectedRevision == 0L).returnNew(true),
        StarLoadoutCurrent::class.java,
    )
}
