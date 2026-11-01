package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/**
 * 库存子账号的密探特别关注偏好。
 *
 * 关注不是库存事实，不参与 inventory_current、inventory_records 或交换档案。
 */
@Document("inventory_agent_favorites")
@CompoundIndex(
    name = "idx_account_agent_favorite_unique",
    def = "{'accountId': 1, 'agentId': 1}",
    unique = true,
)
data class InventoryAgentFavorite(
    @Id
    val id: String? = null,
    @Indexed
    val userId: String,
    val accountId: String,
    val agentId: String,
    val createdAt: Instant = Instant.now(),
)
