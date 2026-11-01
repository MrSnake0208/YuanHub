package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.LedgerCampaign
import com.lhs.share.hub.repository.entity.LedgerCatalogPackage
import com.lhs.share.hub.repository.entity.LedgerCatalogSequence
import com.lhs.share.hub.repository.entity.LedgerCatalogSettings
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository

@Repository
class LedgerCatalogRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun packages(): List<LedgerCatalogPackage> = template.findAll(LedgerCatalogPackage::class.java)
    fun campaigns(): List<LedgerCampaign> = template.findAll(LedgerCampaign::class.java)
    fun settings(): LedgerCatalogSettings? = template.findById("default", LedgerCatalogSettings::class.java)
    fun findPackage(id: String): LedgerCatalogPackage? = template.findById(id, LedgerCatalogPackage::class.java)
    fun findCampaign(id: String): LedgerCampaign? = template.findById(id, LedgerCampaign::class.java)
    fun save(value: LedgerCatalogPackage): LedgerCatalogPackage = template.save(value)
    fun save(value: LedgerCampaign): LedgerCampaign = template.save(value)
    fun save(value: LedgerCatalogSettings): LedgerCatalogSettings = template.save(value)
    fun insert(value: LedgerCatalogPackage): LedgerCatalogPackage = template.insert(value)
    fun insert(value: LedgerCampaign): LedgerCampaign = template.insert(value)
    fun insert(value: LedgerCatalogSettings): LedgerCatalogSettings = template.insert(value)
    fun insertSequence(game: String) = template.insert(LedgerCatalogSequence("counter:$game"))
    fun nextId(game: String): Long = template.findAndModify(
        Query(Criteria.where("_id").`is`("counter:$game").and("lastId").lt(999999999L)),
        Update().inc("lastId", 1L),
        FindAndModifyOptions.options().returnNew(true),
        LedgerCatalogSequence::class.java,
    )?.lastId ?: throw IllegalStateException("公共礼包ID未初始化或已耗尽")
}
