package com.lhs.share.hub.controller.inventory.response

import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.StockEntry
import java.time.Instant

/**
 * 当前库存响应(inventory_current 单文档)
 *
 * entries 直接映射实体 StockEntry(count + listed_baseline_at),不额外冗余
 * acquired/total_acquired:时段获得量由历史流水按需聚合。
 */
data class InventoryCurrentResponse(
    val userId: String,
    val accountId: String,
    val entityType: String,
    val fullBaselineAt: Instant?,
    val entries: Map<String, StockEntryDto>,
    val updatedAt: Instant,
) {
    companion object {
        fun of(current: InventoryCurrent): InventoryCurrentResponse = InventoryCurrentResponse(
            userId = current.userId,
            accountId = current.accountId,
            entityType = current.entityType,
            fullBaselineAt = current.fullBaselineAt,
            entries = current.entries.mapValues { (_, e) -> StockEntryDto.of(e) },
            updatedAt = current.updatedAt,
        )
    }
}

/**
 * 单个对象的当前库存值
 */
data class StockEntryDto(
    val count: Long,
    val listedBaselineAt: Instant?,
) {
    companion object {
        fun of(entry: StockEntry): StockEntryDto = StockEntryDto(
            count = entry.count,
            listedBaselineAt = entry.listedBaselineAt,
        )
    }
}
