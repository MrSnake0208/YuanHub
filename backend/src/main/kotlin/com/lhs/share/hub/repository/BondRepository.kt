package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.BondArchive
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository

@Repository
class BondRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    private fun owner(userId: String, accountId: String) = Query(Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId))

    fun find(userId: String, accountId: String): BondArchive? = mongo.findOne(owner(userId, accountId), BondArchive::class.java)
    fun save(value: BondArchive): BondArchive = mongo.save(value)
    fun hasSubstantiveData(userId: String, accountId: String) = find(userId, accountId)?.records?.isNotEmpty() == true
    fun deleteAccount(userId: String, accountId: String) {
        mongo.remove(owner(userId, accountId), BondArchive::class.java)
    }
}
