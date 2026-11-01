package com.lhs.share.openapi

/**
 * 第三方 API Token 权限枚举
 *
 * 数据库存唯一整数 code;公开 API 只使用稳定字符串 key。
 */
enum class OpenApiPermission(
    val code: Int,
    val key: String,
    val desc: String,
) {
    /**
     * 库存数据读取
     */
    INVENTORY_READ(code = 10001, key = "inventory:read", desc = "库存数据读取"),

    /**
     * 库存数据写入
     */
    INVENTORY_WRITE(code = 10002, key = "inventory:write", desc = "库存数据写入"),

    /**
     * 库存交换文档导出
     */
    INVENTORY_EXPORT(code = 10003, key = "inventory:export", desc = "库存数据导出"),
    OPERATOR_READ(code = 20001, key = "operator:read", desc = "密探数据读取"),
    OPERATOR_WRITE(code = 20002, key = "operator:write", desc = "密探数据写入"),
    OPERATOR_EXPORT(code = 20003, key = "operator:export", desc = "密探数据导出"),
    OPERATOR_SCAN_WRITE(code = 20004, key = "operator:scan:write", desc = "密探自动采集写入"),
    OPERATOR_DAILY_TASKS_WRITE(code = 20005, key = "operator:daily-tasks:write", desc = "今日历练完成记录"),
    STAR_CAPTURE_WRITE(code = 30001, key = "star:capture:write", desc = "上传星石背包临时采集结果"),
    STAR_SCAN_WRITE(code = 30002, key = "star:scan:write", desc = "上传星石本地识别结果（网页核对后导入）"),

    /**
     * 活动日历读取
     */
    CALENDAR_READ(code = 40001, key = "calendar:read", desc = "活动日历读取"),
    ;

    companion object {
        /**
         * 按 key 反向查 code,未知 key 返回 null
         */
        fun codeByKey(key: String): Int? = entries.firstOrNull { it.key == key }?.code

        fun byKey(key: String): OpenApiPermission? = entries.firstOrNull { it.key == key }

        fun listAll(): List<OpenApiPermissionDto> = entries.map { OpenApiPermissionDto(scope = it.key, description = it.desc) }
    }
}

data class OpenApiPermissionDto(
    val scope: String,
    val description: String,
)
