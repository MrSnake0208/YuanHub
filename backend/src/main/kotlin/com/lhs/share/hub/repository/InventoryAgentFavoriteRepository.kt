package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 密探关注仓储。所有业务查询均带 userId 与 accountId，避免跨账号读取。
 */
interface InventoryAgentFavoriteRepository : MongoRepository<InventoryAgentFavorite, String> {
    fun findAllByUserIdAndAccountIdOrderByAgentIdAsc(userId: String, accountId: String): List<InventoryAgentFavorite>

    fun existsByUserIdAndAccountIdAndAgentId(userId: String, accountId: String, agentId: String): Boolean

    fun deleteByUserIdAndAccountIdAndAgentId(userId: String, accountId: String, agentId: String): Long

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
