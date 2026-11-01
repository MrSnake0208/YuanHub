package com.lhs.share.openapi

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * OpenApiPermission 枚举单元测试
 *
 * 守护权限 code / key / desc 的稳定契约(前端与第三方接口都依赖这些值)。
 */
class OpenApiPermissionTest {

    @Test
    fun permissions_have_expected_codes() {
        assertEquals(10001, OpenApiPermission.INVENTORY_READ.code)
        assertEquals(10002, OpenApiPermission.INVENTORY_WRITE.code)
        assertEquals(10003, OpenApiPermission.INVENTORY_EXPORT.code)
        assertEquals("inventory:read", OpenApiPermission.INVENTORY_READ.key)
        assertEquals("inventory:write", OpenApiPermission.INVENTORY_WRITE.key)
        assertEquals("inventory:export", OpenApiPermission.INVENTORY_EXPORT.key)
    }

    @Test
    fun codeByKey_returns_code_for_known_key() {
        assertEquals(10001, OpenApiPermission.codeByKey("inventory:read"))
        assertEquals(10002, OpenApiPermission.codeByKey("inventory:write"))
        assertEquals(10003, OpenApiPermission.codeByKey("inventory:export"))
    }

    @Test
    fun codeByKey_returns_null_for_unknown_key() {
        assertNull(OpenApiPermission.codeByKey("inventory:admin"))
        assertNull(OpenApiPermission.codeByKey(""))
    }

    @Test
    fun listAll_returns_key_code_desc_entries() {
        val list = OpenApiPermission.listAll()

        assertEquals(11, list.size)
        val read = list.first { it.scope == "inventory:read" }
        assertEquals("库存数据读取", read.description)

        val write = list.first { it.scope == "inventory:write" }
        assertEquals("库存数据写入", write.description)
        assertEquals("inventory:export", list.first { it.scope == "inventory:export" }.scope)
        assertEquals("密探数据读取", list.first { it.scope == "operator:read" }.description)
        assertEquals(20004, OpenApiPermission.codeByKey("operator:scan:write"))
        assertEquals(30001, OpenApiPermission.codeByKey("star:capture:write"))
        assertEquals("上传星石背包临时采集结果", list.first { it.scope == "star:capture:write" }.description)
        assertEquals(30002, OpenApiPermission.codeByKey("star:scan:write"))
        assertEquals("上传星石本地识别结果（网页核对后导入）", list.first { it.scope == "star:scan:write" }.description)

        assertEquals(40001, OpenApiPermission.codeByKey("calendar:read"))
        assertEquals("calendar:read", OpenApiPermission.CALENDAR_READ.key)
        assertEquals("活动日历读取", list.first { it.scope == "calendar:read" }.description)

        assertEquals(20005, OpenApiPermission.codeByKey("operator:daily-tasks:write"))
        assertEquals("今日历练完成记录", list.first { it.scope == "operator:daily-tasks:write" }.description)
    }

    @Test
    fun daily_tasks_write_permission_resolves_and_stays_unique() {
        assertEquals(20005, OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.code)
        assertEquals("operator:daily-tasks:write", OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.key)
        assertEquals("今日历练完成记录", OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.desc)
        assertEquals(20005, OpenApiPermission.codeByKey("operator:daily-tasks:write"))
        assertEquals(OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE, OpenApiPermission.byKey("operator:daily-tasks:write"))
        assertEquals(OpenApiPermission.entries.size, OpenApiPermission.entries.map { it.code }.distinct().size)
        assertEquals(OpenApiPermission.entries.size, OpenApiPermission.entries.map { it.key }.distinct().size)
    }
}
