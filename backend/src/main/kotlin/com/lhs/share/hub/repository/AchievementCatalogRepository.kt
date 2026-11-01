package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.CatalogPublication
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository

@Repository
class AchievementCatalogRepository(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    private val collection get() = mongo.getCollectionName(AchievementCatalog::class.java)

    fun published(game: String): CatalogPublication? {
        val raw = mongo.findOne(
            Query(Criteria.where("_id").`is`(game)).also { it.fields().include("published") },
            Document::class.java,
            collection,
        )?.get("published", Document::class.java) ?: return null
        return publication(raw, "published", mutableListOf())
    }

    private fun publication(raw: Document, path: String, issues: MutableList<String>): CatalogPublication {
        val legacy = AchievementCatalogCompatibility.content(raw.get("content", Document::class.java), path, issues)
        return mongo.converter.read(CatalogPublication::class.java, raw).also { it.content.legacyRewards = legacy }
    }

    fun find(game: String): AchievementCatalog? {
        val raw = mongo.findById(game, Document::class.java, collection) ?: return null
        val issues = mutableListOf<String>()
        val publishedRaw = raw.get("published", Document::class.java)
        val published = publication(publishedRaw, "published", issues)
        val draftRaw = raw.get("draft", Document::class.java)
        val draftRewards = AchievementCatalogCompatibility.content(draftRaw, "draft", issues)
        val historyRewards = (raw["history"] as? List<*>)?.filterIsInstance<Document>()?.mapIndexed { index, doc ->
            publication(doc, "history[$index]", issues).content.legacyRewards
        } ?: emptyList()
        (raw["identities"] as? Document)?.forEach { (id, entry) ->
            if (entry is Document) AchievementCatalogCompatibility.normalizeEntry(entry, "identities[$id]", issues)
        }
        return mongo.converter.read(AchievementCatalog::class.java, raw).also { value ->
            value.published.content.legacyRewards = published.content.legacyRewards
            value.draft.legacyRewards = draftRewards
            value.history.forEachIndexed { index, snapshot -> snapshot.content.legacyRewards = historyRewards[index] }
            value.compatibilityIssues = issues
        }
    }

    fun raw(game: String): Document? = mongo.findById(game, Document::class.java, collection)

    fun insert(value: AchievementCatalog): AchievementCatalog = mongo.insert(value)
    fun replace(value: AchievementCatalog, expectedRevision: Long): Boolean = mongo.replace(
        Query(Criteria.where("_id").`is`(value.game).and("revision").`is`(expectedRevision)),
        value,
    ).modifiedCount == 1L
}
