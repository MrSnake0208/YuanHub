package com.lhs.share.hub.controller.inventory.response

import java.time.Instant

/**
 * 时段获得量响应(协议 6 查询接口 /acquired)
 *
 * 只聚合 record_type = reward_delta 的历史流水;区间为 [from, to)。
 */
data class InventoryAcquiredResponse(
    val accountId: String,
    val entityType: String,
    val from: Instant,
    val to: Instant,
    val acquired: Map<String, Long>,
)
