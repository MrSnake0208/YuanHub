package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.InventoryCurrent
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 用户当前库存仓储(HubBackend.inventory_current)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate。
 * 铁律:本接口必须位于 com.lhs.share.hub.repository 顶层包,否则不被
 * HubMongoConfig 扫描而落入主库(MaaBackend)。
 *
 * 每个用户、每种 entity_type 一个文档;读写一律带 userId 归属条件,仓储层杜绝越权。
 * 当前库存状态由服务层基于基线规则维护,本仓储只提供归属安全的读写原语。
 */
interface InventoryCurrentRepository : MongoRepository<InventoryCurrent, String> {
    /**
     * 按用户 + 对象类型查询当前库存文档;不存在时返回 null
     */
    fun findByUserIdAndAccountIdAndEntityType(userId: String, accountId: String, entityType: String): InventoryCurrent?

    /**
     * 列出某用户全部对象类型的当前库存文档(按更新时间倒序)
     */
    fun findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId: String, accountId: String): List<InventoryCurrent>

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
