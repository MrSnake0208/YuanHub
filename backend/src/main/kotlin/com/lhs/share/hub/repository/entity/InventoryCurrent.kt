package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 用户当前库存(HubBackend.inventory_current)
 *
 * 每个用户、每个子账号、每种 entity_type 一个文档。entries 以 entity_id 为键,值为
 * [StockEntry],仅存源状态(count + listed_baseline_at),派生量(周/月获得量)
 * 由 inventory_records 按需聚合,绝不在本集合维护 acquired / total_acquired。
 *
 * userId 引用 MaaBackend.maa_user.userId,跨库无法 join;库存为私有数据,
 * 读写一律带 userId 归属条件。
 *
 * 对象有效基线的计算规则:max(full_baseline_at, entries[id].listed_baseline_at)。
 * - full 快照:替换整个 entries 并更新 full_baseline_at,未列出的对象归零。
 * - listed 快照:只替换正文列出的对象,并更新对应对象的 listed_baseline_at。
 * - reward_delta:增加 entries.<id>.count,但不改变任何基线。
 */
@Document("inventory_current")
@CompoundIndex(
    name = "idx_user_account_entity",
    def = "{'userId': 1, 'accountId': 1, 'entityType': 1}",
    unique = true,
)
data class InventoryCurrent(
    @Id
    val id: String? = null,
    /**
     * 库存归属用户 id(引用 MaaBackend.maa_user.userId),取自 JWT,绝不由前端传入
     */
    @Indexed
    val userId: String,
    val accountId: String,
    /**
     * 对象类型: item(普通道具) | agent(角色关联物品)
     */
    val entityType: String,
    /**
     * 最近一次具有权威性的 full 快照时间;从未做过 full 快照时为 null
     */
    val fullBaselineAt: Instant? = null,
    /**
     * 当前库存条目,键为跨平台稳定 id(entity_id),值为 [StockEntry]
     */
    val entries: Map<String, StockEntry> = emptyMap(),
    val updatedAt: Instant = Instant.now(),
) : Serializable

/**
 * 单个对象的当前库存值
 */
data class StockEntry(
    /**
     * 绝对库存数量,可能为 0(仅 listed 快照不会写入 0 归零,full 快照下 0 直接不保留键)
     */
    val count: Long = 0,
    /**
     * 最近一次 listed 快照覆盖该对象的时间;从未被 listed 快照覆盖时为 null
     */
    val listedBaselineAt: Instant? = null,
)
