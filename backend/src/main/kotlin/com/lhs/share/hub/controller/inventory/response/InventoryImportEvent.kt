package com.lhs.share.hub.controller.inventory.response

import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import java.time.Instant
import java.util.UUID

data class InventoryImportEvent(
    val eventId: String = UUID.randomUUID().toString(),
    val accountId: String,
    val accepted: Int,
    val duplicates: Int,
    val historyOnly: Int,
    val superseded: Int,
    val records: List<InventoryImportEventRecord>,
    val occurredAt: Instant = Instant.now(),
) {
    companion object {
        fun of(accountId: String, request: InventoryImportRequest, result: InventoryImportResult) = InventoryImportEvent(
            accountId = accountId,
            accepted = result.accepted,
            duplicates = result.duplicates,
            historyOnly = result.historyOnly,
            superseded = result.superseded,
            records = request.records.map { record ->
                InventoryImportEventRecord(
                    recordId = record.recordId,
                    recordType = record.recordType,
                    entityType = record.entityType,
                    acquisitionChannel = record.acquisitionChannel,
                    entries = record.entries.map { InventoryImportEventEntry(it.id, it.count) },
                )
            },
        )
    }
}

data class InventoryImportEventRecord(
    val recordId: String,
    val recordType: String,
    val entityType: String,
    val acquisitionChannel: String? = null,
    val entries: List<InventoryImportEventEntry>,
)

data class InventoryImportEventEntry(val id: String, val count: Long)
