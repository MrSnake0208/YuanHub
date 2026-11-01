package com.lhs.share.hub.controller.inventory.response

/**
 * 导入结果响应(协议 9.1)
 *
 * 重复 records 属于幂等成功,计入 duplicates;history_only 与 superseded
 * 表示已存档但未改变当前库存,用于排查导入结果,不参与业务计算。
 */
data class InventoryImportResult(
    val accepted: Int,
    val duplicates: Int = 0,
    val historyOnly: Int = 0,
    val superseded: Int = 0,
    val warnings: List<String> = emptyList(),
)
