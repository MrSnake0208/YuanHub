package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.EntityCatalogEntity
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 对象目录仓储(HubBackend.entity_catalog)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate。
 * 铁律:本接口必须位于 com.lhs.share.hub.repository 顶层包,否则不被
 * HubMongoConfig 扫描而落入主库(MaaBackend)。
 *
 * (entityType, entityId) 由唯一复合索引保证,目录为全局只读字典,
 * 首次由 EntityCatalogService 从 classpath 加载后 upsert。
 */
interface EntityCatalogRepository : MongoRepository<EntityCatalogEntity, String> {
    /**
     * 按对象类型 + 稳定 id 查询;不存在时返回 null(导入校验用)
     */
    fun findByEntityTypeAndEntityId(entityType: String, entityId: String): EntityCatalogEntity?

    /**
     * 列出某对象类型的全部目录条目(目录查询/加载用)
     */
    fun findByEntityTypeOrderByEntityIdAsc(entityType: String): List<EntityCatalogEntity>
}
