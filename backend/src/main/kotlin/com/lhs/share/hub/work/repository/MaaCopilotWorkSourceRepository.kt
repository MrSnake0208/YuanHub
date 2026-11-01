package com.lhs.share.hub.work.repository

import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.annotation.Id
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.stereotype.Repository
import java.time.LocalDateTime

data class MaaCopilotWorkSource(
    @Id val mongoId: String? = null,
    val copilotId: Long? = null,
    val stageName: String? = null,
    val stageId: String? = null,
    val name: String? = null,
    val levelMeta: MaaCopilotLevelMeta? = null,
    val uploaderId: String? = null,
    val uploadTime: LocalDateTime? = null,
    val firstUploadTime: LocalDateTime? = null,
    val views: Long = 0,
    val hotScore: Double = 0.0,
    val likeCount: Long = 0,
    val content: String? = null,
    val tags: List<String> = emptyList(),
)

data class MaaCopilotLevelMeta(val stageId: String? = null, val levelId: String? = null, val name: String? = null)

data class MaaCopilotPage(val items: List<MaaCopilotWorkSource>, val total: Long)

/** Read-only view of MaaBackend.maa_copilot. */
@Repository
class MaaCopilotWorkSourceRepository(
    @param:Qualifier("mongoTemplate") private val mongoTemplate: MongoTemplate,
) {
    fun findPublic(page: Int, limit: Int): MaaCopilotPage {
        val base = publicCriteria()
        val total = mongoTemplate.count(Query.query(base), MaaCopilotWorkSource::class.java, COLLECTION)
        val query = Query.query(publicCriteria())
            .with(Sort.by(Sort.Order.desc("uploadTime"), Sort.Order.desc("copilotId")))
            .skip(((page - 1) * limit).toLong())
            .limit(limit)
        fields(query)
        return MaaCopilotPage(mongoTemplate.find(query, MaaCopilotWorkSource::class.java, COLLECTION), total)
    }

    fun findPublicById(id: Long): MaaCopilotWorkSource? {
        val query = Query.query(publicCriteria().and("copilotId").`is`(id))
        fields(query)
        return mongoTemplate.findOne(query, MaaCopilotWorkSource::class.java, COLLECTION)
    }

    private fun fields(query: Query) {
        query.fields().include(
            "copilotId",
            "stageName",
            "stageId",
            "name",
            "levelMeta",
            "uploaderId",
            "uploadTime",
            "firstUploadTime",
            "views",
            "hotScore",
            "likeCount",
            "content",
            "tags",
        )
    }

    private fun publicCriteria(): Criteria = Criteria.where("status").`is`("PUBLIC").and("delete").`is`(false)

    private companion object {
        const val COLLECTION = "maa_copilot"
    }
}
