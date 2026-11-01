package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.BondCatalog
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository

@Repository
class BondCatalogRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    fun find(game: String): BondCatalog? = mongo.findById(game, BondCatalog::class.java)
    fun insert(value: BondCatalog): BondCatalog = mongo.insert(value)
    fun replace(value: BondCatalog, revision: Long) = mongo.replace(
        Query(Criteria.where("_id").`is`(value.game).and("revision").`is`(revision)),
        value,
    ).modifiedCount == 1L
    fun fence(game: String, version: String) = mongo.updateFirst(
        Query(Criteria.where("_id").`is`(game).and("published.catalogVersion").`is`(version)),
        Update().inc("writeFence", 1),
        BondCatalog::class.java,
    ).matchedCount == 1L
}
