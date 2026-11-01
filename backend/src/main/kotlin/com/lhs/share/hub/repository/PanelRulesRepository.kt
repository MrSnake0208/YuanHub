package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.ActivePanelRuleSet
import com.lhs.share.hub.repository.entity.OperatorPanelRule
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import com.lhs.share.hub.repository.entity.PanelRuleSet
import com.lhs.share.hub.repository.entity.StarPanelRule
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.index.Index
import org.springframework.data.mongodb.core.index.PartialIndexFilter
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository

@Repository
class PanelRulesRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    fun ensureIndexes() {
        listOf(OperatorPanelRule::class.java, StarPanelRule::class.java).forEach { type ->
            mongo.indexOps(type).createIndex(Index().on("version", Sort.Direction.ASC).on("sourceId", Sort.Direction.ASC).unique())
        }
        mongo.indexOps(OperatorPanelRule::class.java).createIndex(
            Index().on("version", Sort.Direction.ASC).on("operatorId", Sort.Direction.ASC).unique()
                .partial(PartialIndexFilter.of(Criteria.where("operatorId").type(2))),
        )
        if (!mongo.collectionExists(PanelRuleSet::class.java)) mongo.createCollection(PanelRuleSet::class.java)
    }

    fun insert(bundle: PanelRuleBundle) {
        mongo.insert(bundle.ruleSet)
        mongo.insert(bundle.operators, OperatorPanelRule::class.java)
        mongo.insert(bundle.stars, StarPanelRule::class.java)
    }

    fun load(version: String): PanelRuleBundle? {
        val set = mongo.findById(version, PanelRuleSet::class.java) ?: return null
        val query = Query.query(Criteria.where("version").`is`(version))
        return PanelRuleBundle(set, mongo.find(query, OperatorPanelRule::class.java), mongo.find(query, StarPanelRule::class.java))
    }

    fun activeVersion(game: String): String? = mongo.findById("active:$game", ActivePanelRuleSet::class.java)?.version

    fun activate(game: String, version: String) {
        mongo.save(ActivePanelRuleSet("active:$game", version))
    }
}
