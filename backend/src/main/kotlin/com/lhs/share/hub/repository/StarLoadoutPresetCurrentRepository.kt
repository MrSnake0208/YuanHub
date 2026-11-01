package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StarLoadoutPreset
import com.lhs.share.hub.repository.entity.StarLoadoutPresetCurrent
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface StarLoadoutPresetCurrentRepository :
    MongoRepository<StarLoadoutPresetCurrent, String>,
    StarLoadoutPresetCurrentRepositoryCustom {
    fun findByUserId(userId: String): StarLoadoutPresetCurrent?
}

interface StarLoadoutPresetCurrentRepositoryCustom {
    fun replace(
        userId: String,
        expectedRevision: Long,
        mainPresets: List<StarLoadoutPreset>,
        supportPresets: List<StarLoadoutPreset>,
        now: Instant,
    ): StarLoadoutPresetCurrent?
}

class StarLoadoutPresetCurrentRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : StarLoadoutPresetCurrentRepositoryCustom {
    override fun replace(
        userId: String,
        expectedRevision: Long,
        mainPresets: List<StarLoadoutPreset>,
        supportPresets: List<StarLoadoutPreset>,
        now: Instant,
    ): StarLoadoutPresetCurrent? = template.findAndModify(
        Query.query(
            Criteria.where("_id").`is`(userId).and("userId").`is`(userId)
                .and("revision").`is`(expectedRevision),
        ),
        Update().set("userId", userId).set("mainPresets", mainPresets).set("supportPresets", supportPresets)
            .set("revision", expectedRevision + 1).set("updatedAt", now),
        FindAndModifyOptions.options().upsert(expectedRevision == 0L).returnNew(true),
        StarLoadoutPresetCurrent::class.java,
    )
}
