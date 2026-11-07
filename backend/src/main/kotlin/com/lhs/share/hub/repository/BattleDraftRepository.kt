package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.BattleDraft
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
class BattleDraftRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    private fun owner(userId: String, accountId: String) = Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId)

    fun list(userId: String, accountId: String): List<BattleDraft> =
        template.find(Query(owner(userId, accountId)).with(Sort.by(Sort.Direction.DESC, "updatedAt")), BattleDraft::class.java)

    fun find(userId: String, accountId: String, id: String): BattleDraft? =
        template.findOne(Query(owner(userId, accountId).and("_id").`is`(id)), BattleDraft::class.java)

    /** 依次尝试空闲槽位；唯一索引冲突说明被并发请求占用，继续下一个。全部占满返回 null。 */
    fun insert(userId: String, accountId: String, limit: Int, build: (slot: Int) -> BattleDraft): BattleDraft? {
        val used = list(userId, accountId).map { it.slot }.toSet()
        for (slot in 0 until limit) {
            if (slot in used) continue
            try {
                return template.insert(build(slot))
            } catch (_: DuplicateKeyException) {
                continue
            }
        }
        return null
    }

    fun replace(
        userId: String,
        accountId: String,
        id: String,
        expected: Long,
        title: String,
        game: String,
        payload: String,
        now: Instant,
    ): BattleDraft? = template.findAndModify(
        Query(owner(userId, accountId).and("_id").`is`(id).and("revision").`is`(expected)),
        Update().set("title", title).set("game", game).set("payloadJson", payload).set("updatedAt", now).inc("revision", 1L),
        FindAndModifyOptions.options().returnNew(true),
        BattleDraft::class.java,
    )

    fun delete(userId: String, accountId: String, id: String): Boolean =
        template.remove(Query(owner(userId, accountId).and("_id").`is`(id)), BattleDraft::class.java).deletedCount > 0
}
