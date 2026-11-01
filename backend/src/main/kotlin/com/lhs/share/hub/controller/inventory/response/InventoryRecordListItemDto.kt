package com.lhs.share.hub.controller.inventory.response

import com.lhs.share.hub.repository.entity.InventoryRecord
import java.time.Instant

/**
 * 导入记录列表项(记录排查与删除入口)
 *
 * Jackson SNAKE_CASE 序列化:record_id / record_type / entity_type /
 * acquisition_channel / stamina_cost / effective_at / received_at / stock_effect。
 */
data class InventoryRecordListItemDto(
    val accountId: String,
    val recordId: String,
    val recordType: String,
    val entityType: String,
    val acquisitionChannel: String?,
    val staminaCost: Long?,
    val effectiveAt: Instant,
    val receivedAt: Instant,
    val stockEffect: String,
    val transactionId: String?,
    val entries: List<InventoryRecordEntryDto>,
    val resourceRevision: Long? = null,
) {
    companion object {
        fun of(record: InventoryRecord): InventoryRecordListItemDto = InventoryRecordListItemDto(
            accountId = record.accountId,
            recordId = record.recordId,
            recordType = record.recordType,
            entityType = record.entityType,
            acquisitionChannel = record.acquisitionChannel,
            staminaCost = record.staminaCost,
            effectiveAt = record.effectiveAt,
            receivedAt = record.receivedAt,
            stockEffect = record.stockEffect,
            transactionId = record.transactionId,
            entries = record.entries.map { InventoryRecordEntryDto(id = it.id, name = it.name, count = it.count) },
            resourceRevision = record.resourceRevision,
        )
    }
}

/**
 * 记录条目
 */
data class InventoryRecordEntryDto(
    val id: String,
    val name: String?,
    val count: Long,
)
