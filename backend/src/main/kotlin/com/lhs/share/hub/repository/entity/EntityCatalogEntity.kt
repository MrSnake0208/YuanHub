package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 对象目录条目(HubBackend.entity_catalog)
 *
 * 跨平台主键为 (entityType, entityId);name/category 为展示信息,不得用中文名代替稳定 id
 * 做主键。数据来源:item 取 agent/items.json 的 id/name/category,agent 取
 * agent/operators.json 的 formal id/name;首次启动时由 EntityCatalogService
 * 从 classpath 加载并 upsert,之后作为只读字典供校验与目录查询。
 */
@Document("entity_catalog")
@CompoundIndex(
    name = "idx_catalog_entity_unique",
    def = "{'entityType': 1, 'entityId': 1}",
    unique = true,
)
data class EntityCatalogEntity(
    @Id
    val id: String? = null,
    /**
     * 对象类型: item | agent
     */
    @Indexed
    val entityType: String,
    /**
     * 跨平台稳定 id(operators.json 的 formal id 或 items.json 的 id)
     */
    val entityId: String,
    /**
     * 展示名称
     */
    val name: String,
    /**
     * 可选目录分类；item 使用 MaaYuan 道具目录分类，agent 当前不提供。
     */
    val category: String? = null,
    /**
     * 目录版本(来源于加载时的 catalog_version,便于排查)
     */
    val catalogVersion: String,
    val createdAt: Instant = Instant.now(),
) : Serializable
