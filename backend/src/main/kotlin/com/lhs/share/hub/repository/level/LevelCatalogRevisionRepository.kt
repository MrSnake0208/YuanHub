package com.lhs.share.hub.repository.level

import com.lhs.share.hub.repository.entity.level.LevelCatalogRevisionEntity
import org.springframework.data.mongodb.repository.MongoRepository

interface LevelCatalogRevisionRepository : MongoRepository<LevelCatalogRevisionEntity, String> {
    fun findByLevelKeyOrderByOccurredAtDesc(levelKey: String): List<LevelCatalogRevisionEntity>
}
