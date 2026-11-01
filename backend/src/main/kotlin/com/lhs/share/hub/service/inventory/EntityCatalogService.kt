package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.inventory.response.EntityCatalogItemDto
import com.lhs.share.hub.controller.inventory.response.InventoryCatalogResponse
import com.lhs.share.hub.repository.EntityCatalogRepository
import com.lhs.share.hub.repository.entity.EntityCatalogEntity
import com.lhs.share.hub.service.operator.OperatorCatalogService
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.core.io.Resource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.core.io.support.ResourcePatternResolver
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger { }

/**
 * 对象目录服务(HubBackend.entity_catalog)
 *
 * 目录为全局只读字典,向后端校验 (entity_type, id) 与向前端展示统一对象名称。
 * 道具首次访问时从 classpath inventory/items.json 补齐，保留已维护的元数据。
 * 密探直接读取公共图鉴；entity_catalog 中遗留的 agent 行不再作为可写目录。
 */
@Service
class EntityCatalogService(
    private val repository: EntityCatalogRepository,
    private val objectMapper: ObjectMapper,
    private val operatorCatalogService: OperatorCatalogService,
) {
    /**
     * 目录版本(默认取当次播种日期;部署方可转储后覆盖)。
     */
    @Volatile
    private var catalogVersion: String = ""

    /**
     * 首次播种标记;应用生命周期内只执行一次,保证并发请求不会重复播种。
     */
    @Volatile
    private var seeded: Boolean = false

    /**
     * 返回完整对象目录(首次调用时惰性完成播种)
     */
    fun catalog(): InventoryCatalogResponse {
        ensureSeeded()
        val operators = operatorCatalogService.catalog()
        val items = repository.findByEntityTypeOrderByEntityIdAsc("item").map { entity ->
            EntityCatalogItemDto("item", entity.entityId, entity.name, entity.category)
        }
        val agents = operators.operators.map { operator ->
            EntityCatalogItemDto("agent", operator.id, operator.name)
        }
        return InventoryCatalogResponse(
            catalogVersion = maxOf(currentCatalogVersion(), operators.catalogVersion),
            entities = items + agents,
        )
    }

    /** 新导入与新增关注只接受当前公共目录的 ID。 */
    fun exists(entityType: String, entityId: String): Boolean {
        if (entityType == "agent") return operatorCatalogService.exists(entityId)
        ensureSeeded()
        return entityType == "item" && repository.findByEntityTypeAndEntityId(entityType, entityId) != null
    }

    fun agentMatchesGame(entityId: String, game: String): Boolean =
        operatorCatalogService.getOperator(entityId)?.games?.let { it.isEmpty() || game in it } == true

    fun existsReadOnly(entityType: String, entityId: String): Boolean = when (entityType) {
        "agent" -> operatorCatalogService.getOperatorReadOnly(entityId) != null
        "item" -> repository.findByEntityTypeAndEntityId(entityType, entityId) != null
        else -> false
    }

    fun agentMatchesGameReadOnly(entityId: String, game: String): Boolean =
        operatorCatalogService.getOperatorReadOnly(entityId)?.games?.let { it.isEmpty() || game in it } == true

    /**
     * 惰性播种:首次访问时补齐 classpath 中存在、collection 中缺失的对象。
     */
    private fun ensureSeeded() {
        if (seeded) return
        synchronized(this) {
            if (seeded) return
            seed()
            seeded = true
        }
    }

    private fun seed() {
        seedFromResources(itemsResource())
        catalogVersion = resolveCatalogVersion()
        log.info { "对象目录播种完成,版本: $catalogVersion" }
    }

    /**
     * 资源完整通过校验后才开始写入，失败时保留数据库中的上一份有效目录。
     */
    internal fun seedFromResources(itemResource: Resource?) {
        val items = itemResource?.let { parseCatalog(it, "item") }.orEmpty()
        upsertAll(items)
    }

    private fun currentCatalogVersion(): String = catalogVersion.ifEmpty { resolveCatalogVersion() }

    /**
     * 目录版本:默认用当次播种日期;部署方可替换资源文件中的 catalog_version 元数据。
     */
    private fun resolveCatalogVersion(): String = java.time.LocalDate.now().toString()

    /**
     * 解析单个 classpath 资源为目录实体列表。
     * 资源格式为 JSON 数组:[{ "id": "...", "name": "...", "category": "..."? }, ...]。
     */
    private fun parseCatalog(resource: Resource, entityType: String): List<EntityCatalogEntity> {
        val root: JsonNode = objectMapper.readTree(resource.inputStream)
        if (!root.isArray) {
            throw IllegalStateException("Catalog resource is not a JSON array: ${resource.description}")
        }
        val version = resolveCatalogVersion()
        val entities = root.map { node ->
            val id = node.get("id")?.asText()?.takeIf { it.isNotBlank() }
                ?: throw IllegalStateException("Catalog entry id is required: ${resource.description}")
            if (!idPattern(entityType).matches(id)) {
                throw IllegalStateException("Invalid $entityType catalog id: $id")
            }
            val name = node.get("name")?.asText()?.takeIf { it.isNotBlank() }
                ?: throw IllegalStateException("Catalog entry name is required: $id")
            val category = node.get("category")?.asText()?.takeIf { it.isNotBlank() }
            EntityCatalogEntity(
                entityType = entityType,
                entityId = id,
                name = name,
                category = category,
                catalogVersion = version,
            )
        }
        val duplicate = entities.groupingBy { it.entityId }.eachCount().entries.firstOrNull { it.value > 1 }?.key
        if (duplicate != null) {
            throw IllegalStateException("Duplicate $entityType catalog id: $duplicate")
        }
        return entities
    }

    /**
     * 逐条 upsert:不存在则插入；已存在时只补齐新增的可选分类元数据，
     * 不覆盖运维维护过的名称或已有分类。依靠唯一索引保证幂等。
     */
    private fun upsertAll(entities: List<EntityCatalogEntity>) {
        entities.forEach { entity ->
            val existing = repository.findByEntityTypeAndEntityId(entity.entityType, entity.entityId)
            when {
                existing == null -> repository.save(entity)
                existing.category == null && entity.category != null -> repository.save(
                    existing.copy(category = entity.category, catalogVersion = entity.catalogVersion),
                )
            }
        }
    }

    private fun itemsResource(): Resource? = loadResource("classpath:inventory/items.json")

    private fun loadResource(location: String): Resource? {
        return try {
            val resolver: ResourcePatternResolver = PathMatchingResourcePatternResolver()
            resolver.getResource(location).takeIf { it.exists() }
        } catch (e: Exception) {
            log.warn(e) { "加载目录资源失败: $location" }
            null
        }
    }

    companion object {
        private val ITEM_ID = Regex("^[a-z0-9_]+$")
        private val AGENT_ID = Regex("^char_[0-9]+_[a-z0-9_]+$")

        private fun idPattern(entityType: String): Regex = when (entityType) {
            "item" -> ITEM_ID
            "agent" -> AGENT_ID
            else -> throw IllegalArgumentException("Unsupported catalog entity type: $entityType")
        }
    }
}
