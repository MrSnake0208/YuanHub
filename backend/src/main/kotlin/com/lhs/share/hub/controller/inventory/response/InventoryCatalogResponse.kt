package com.lhs.share.hub.controller.inventory.response

import com.fasterxml.jackson.annotation.JsonInclude

/**
 * 对象目录响应(协议 5.1 目录交换 GET /v1/inventory/catalog)
 *
 * format / version 为协议元数据;catalog_version 为目录版本(发布版本或日期);
 * entities 为全部 { entity_type, id, name, category? },供合作平台建立映射与展示分类。
 */
data class InventoryCatalogResponse(
    val format: String = "myshare-entity-catalog",
    val version: Int = 1,
    val catalogVersion: String,
    val entities: List<EntityCatalogItemDto>,
)

/**
 * 单个对象目录条目:跨平台主键为 (entity_type, id),name/category 仅展示。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class EntityCatalogItemDto(
    val entityType: String,
    val id: String,
    val name: String,
    val category: String? = null,
)
