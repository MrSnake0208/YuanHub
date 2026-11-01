package com.lhs.share.hub.controller.inventory.response

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class InventoryImportEventTest {
    private val mapper = jacksonObjectMapper()
        .registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

    @Test
    fun `dispatch sub-channel and all entries are preserved`() {
        val entries = listOf(
            InventoryEntryRequest(id = "item_a", count = 1),
            InventoryEntryRequest(id = "item_b", count = 2),
            InventoryEntryRequest(id = "item_c", count = 3),
        )

        val event = event(record("item-record", "item", "派遣-洛阳", entries))
        val eventRecord = event.records.single()
        val json = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(event)

        assertEquals("派遣-洛阳", eventRecord.acquisitionChannel)
        assertEquals("派遣-洛阳", json.at("/records/0/acquisition_channel").asText())
        assertEquals(
            listOf(
                InventoryImportEventEntry("item_a", 1),
                InventoryImportEventEntry("item_b", 2),
                InventoryImportEventEntry("item_c", 3),
            ),
            eventRecord.entries,
        )
    }

    @Test
    fun `stronghold intelligence channel is preserved in event and JSON`() {
        val event = event(record("intel-record", "item", "据点情报", listOf(entry("item_a", 1))))

        assertEquals("据点情报", event.records.single().acquisitionChannel)
        assertEquals(
            "据点情报",
            mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(event)
                .at("/records/0/acquisition_channel")
                .asText(),
        )
    }

    @Test
    fun `record without acquisition channel still creates event`() {
        val event = event(record("channel-less", "item", null, listOf(entry("item_a", 1))))

        assertNull(event.records.single().acquisitionChannel)
    }

    @Test
    fun `item and agent records each preserve channel and complete entries`() {
        val itemEntries = listOf(entry("item_a", 1), entry("item_b", 2), entry("item_c", 3))
        val agentEntries = listOf(entry("agent_a", 4), entry("agent_b", 5))
        val event = event(
            record("item-record", "item", "派遣-寿春", itemEntries),
            record("agent-record", "agent", "派遣-寿春", agentEntries),
        )

        assertEquals(listOf("派遣-寿春", "派遣-寿春"), event.records.map { it.acquisitionChannel })
        assertEquals(
            listOf(
                itemEntries.map { InventoryImportEventEntry(it.id, it.count) },
                agentEntries.map { InventoryImportEventEntry(it.id, it.count) },
            ),
            event.records.map { it.entries },
        )
    }

    private fun event(vararg records: InventoryRecordRequest): InventoryImportEvent = InventoryImportEvent.of(
        accountId = "main",
        request = InventoryImportRequest(
            format = "myshare-inventory-exchange",
            version = 2,
            exportedAt = "2026-08-23T00:00:00Z",
            producer = ProducerDto(platform = "test"),
            records = records.toList(),
        ),
        result = InventoryImportResult(accepted = records.size),
    )

    private fun record(
        recordId: String,
        entityType: String,
        acquisitionChannel: String?,
        entries: List<InventoryEntryRequest>,
    ): InventoryRecordRequest {
        return InventoryRecordRequest(
            accountId = "main",
            recordId = recordId,
            recordType = "reward_delta",
            entityType = entityType,
            acquisitionChannel = acquisitionChannel,
            effectiveAt = "2026-08-23T00:00:00Z",
            entries = entries,
        )
    }

    private fun entry(id: String, count: Long) = InventoryEntryRequest(id = id, count = count)
}
