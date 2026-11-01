package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface StarStateCurrentRepository : MongoRepository<StarStateCurrent, String>, StarStateCurrentRepositoryCustom {
    fun findByUserIdAndAccountId(userId: String, accountId: String): StarStateCurrent?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface StarStateCurrentRepositoryCustom {
    fun replace(
        userId: String,
        accountId: String,
        expectedGeneration: Long,
        expectedRevision: Long,
        newGeneration: Long,
        snapshot: StarStateSnapshot,
        now: Instant,
    ): StarStateCurrent?

    /** A real write to the same document makes Loadout validation conflict with state replacement. */
    fun fenceLoadoutWrite(userId: String, accountId: String, generation: Long, revision: Long): Boolean
}

class StarStateCurrentRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : StarStateCurrentRepositoryCustom {
    override fun replace(
        userId: String,
        accountId: String,
        expectedGeneration: Long,
        expectedRevision: Long,
        newGeneration: Long,
        snapshot: StarStateSnapshot,
        now: Instant,
    ): StarStateCurrent? = template.findAndModify(
        ownerQuery(userId, accountId)
            .addCriteria(Criteria.where("generation").`is`(expectedGeneration))
            .addCriteria(Criteria.where("revision").`is`(expectedRevision)),
        Update().set("userId", userId).set("accountId", accountId)
            .set("generation", newGeneration).set("revision", expectedRevision + 1)
            .set("inventory", snapshot.inventory).set("planTargets", snapshot.planTargets)
            .set("experience", snapshot.experience).set("bag", snapshot.bag).set("updatedAt", now),
        FindAndModifyOptions.options().upsert(expectedRevision == 0L).returnNew(true),
        StarStateCurrent::class.java,
    )

    override fun fenceLoadoutWrite(userId: String, accountId: String, generation: Long, revision: Long): Boolean =
        template.findAndModify(
            ownerQuery(userId, accountId)
                .addCriteria(Criteria.where("generation").`is`(generation))
                .addCriteria(Criteria.where("revision").`is`(revision)),
            Update().inc("loadoutFence", 1),
            FindAndModifyOptions.options().returnNew(true),
            StarStateCurrent::class.java,
        ) != null

    private fun ownerQuery(userId: String, accountId: String) = Query.query(
        Criteria.where("_id").`is`("$userId:$accountId")
            .and("userId").`is`(userId).and("accountId").`is`(accountId),
    )
}
