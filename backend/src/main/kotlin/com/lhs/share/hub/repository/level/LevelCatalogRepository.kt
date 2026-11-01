package com.lhs.share.hub.repository.level

import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository

interface LevelCatalogRepository : MongoRepository<LevelCatalogEntity, String>, LevelCatalogRepositoryCustom {
    fun findByLevelKey(levelKey: String): LevelCatalogEntity?
    fun findByGameAndStageId(game: String, stageId: String): LevelCatalogEntity?
    fun findByGameAndLevelId(game: String, levelId: String): LevelCatalogEntity?
    fun findAllByOrderBySortOrderAscLevelKeyAsc(): List<LevelCatalogEntity>
    fun findTopByOrderByUpdatedAtDesc(): LevelCatalogEntity?
}

interface LevelCatalogRepositoryCustom {
    fun updateIfRevision(levelKey: String, expectedRevision: Long, replacement: LevelCatalogEntity): LevelCatalogEntity?
}

class LevelCatalogRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val mongoTemplate: MongoTemplate,
) : LevelCatalogRepositoryCustom {
    override fun updateIfRevision(levelKey: String, expectedRevision: Long, replacement: LevelCatalogEntity): LevelCatalogEntity? {
        val query = Query.query(
            Criteria().andOperator(
                Criteria.where("levelKey").`is`(levelKey),
                Criteria.where("revision").`is`(expectedRevision),
            ),
        )
        val update = Update()
            .set("game", replacement.game)
            .set("catOne", replacement.catOne)
            .set("catTwo", replacement.catTwo)
            .set("catThree", replacement.catThree)
            .set("name", replacement.name)
            .set("levelId", replacement.levelId)
            .set("stageId", replacement.stageId)
            .set("status", replacement.status)
            .set("isOpen", replacement.isOpen)
            .set("endTime", replacement.endTime)
            .set("sortOrder", replacement.sortOrder)
            .set("revision", replacement.revision)
            .set("updatedAt", replacement.updatedAt)
            .set("updatedBy", replacement.updatedBy)
        return mongoTemplate.findAndModify(
            query,
            update,
            FindAndModifyOptions.options().returnNew(true),
            LevelCatalogEntity::class.java,
        )
    }
}
