package com.lhs.share.hub.controller.inventory.response

import com.fasterxml.jackson.annotation.JsonInclude
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

/**
 * 导出响应(协议 5.1 交换文档的读侧视图,可直接被其它兼容平台导入)
 *
 * 每条 entity_type 生成一条 full stock_snapshot(当前状态导出);
 * 若 include=rewards,再附带区间内的 reward_delta 流水。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class InventoryExportResponse(
    val format: String = "myshare-inventory-exchange",
    @field:Schema(allowableValues = ["2"], minimum = "2", maximum = "2", defaultValue = "2")
    val version: Int = 2,
    @field:Schema(format = "date-time")
    val exportedAt: Instant,
    val catalogVersion: String?,
    val producer: ProducerDto,
    val accounts: List<InventoryExportAccountDto>,
    val records: List<InventoryExportRecordDto>,
)

data class InventoryExportAccountDto(
    val id: String,
    val name: String,
)

/**
 * 导出记录:与导入记录结构一致,方便往返。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class InventoryExportRecordDto(
    val accountId: String,
    val recordId: String,
    @field:Schema(allowableValues = ["reward_delta", "stock_snapshot"])
    val recordType: String,
    @field:Schema(allowableValues = ["item", "agent"])
    val entityType: String,
    val acquisitionChannel: String? = null,
    val staminaCost: Long? = null,
    @field:Schema(format = "date-time")
    val effectiveAt: Instant,
    @field:Schema(allowableValues = ["full", "listed"])
    val snapshotScope: String?,
    val entries: List<InventoryExportEntryDto>,
)

/**
 * 导出条目
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class InventoryExportEntryDto(
    val id: String,
    val name: String?,
    val count: Long,
)
