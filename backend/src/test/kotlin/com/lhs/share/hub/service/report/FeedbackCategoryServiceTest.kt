package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackCategoryCatalogRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackCategoryCatalog
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import java.util.Optional

class FeedbackCategoryServiceTest {
    private val repository = mockk<FeedbackCategoryCatalogRepository>()
    private val service = FeedbackCategoryService(repository)

    @Test
    fun `排序持久化完整板块对象且重复顺序不写库`() {
        val calendar = FeedbackCategory("CUSTOM_CAL", "活动日历", FeedbackArea.CALENDAR, hidden = true)
        val other = FeedbackCategory("OTHER", "其他")
        var stored = FeedbackCategoryCatalog(categories = listOf(calendar, other), version = 4)
        every { repository.findById("feedback") } answers { Optional.of(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }
        val keys = listOf("OTHER", "CUSTOM_CAL")

        assertEquals(listOf(calendar, other) to listOf(other, calendar), service.reorder(keys, keys.reversed()))
        assertEquals(listOf(other, calendar), FeedbackCategoryService(repository).list())
        assertEquals(4L, stored.version)
        service.reorder(keys, keys)
        verify(exactly = 1) { repository.save(any()) }
    }

    @Test
    fun `排序拒绝重复缺失未知板块和过期顺序且不写库`() {
        val keys = listOf("CALENDAR", "OTHER")
        val stored = FeedbackCategoryCatalog(categories = keys.map { FeedbackCategory(it, it) })
        every { repository.findById("feedback") } returns Optional.of(stored)
        for (invalid in listOf(emptyList(), listOf("CALENDAR"), listOf("OTHER", "OTHER"), listOf("CALENDAR", "UNKNOWN"))) {
            assertEquals(400, assertThrows(ApiResultException::class.java) { service.reorder(invalid, keys) }.statusCode)
        }
        for (stale in listOf(keys.reversed(), listOf("CALENDAR"))) {
            assertEquals(409, assertThrows(ApiResultException::class.java) { service.reorder(keys.reversed(), stale) }.statusCode)
        }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `排序沿用版本冲突保护且空库可保存默认目录顺序`() {
        every { repository.findById("feedback") } returns Optional.empty()
        val keys = FeedbackArea.labels.keys.toList()
        every { repository.save(any()) } throws OptimisticLockingFailureException("stale")
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.reorder(keys.reversed(), keys) }.statusCode)
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>() }
        assertEquals(keys.reversed(), service.reorder(keys.reversed(), keys).second.map { it.key })
    }

    @Test
    fun `旧目录只补日历一次且读取不持久化不改历史板块`() {
        val historical = listOf(FeedbackCategory("CUSTOM_OLD", "旧板块"), FeedbackCategory(FeedbackArea.OTHER, "旧其他名称"))
        val stored = FeedbackCategoryCatalog(categories = historical, version = 7)
        every { repository.findById("feedback") } returns Optional.of(stored)
        repeat(2) {
            assertEquals(historical + FeedbackCategory(FeedbackArea.CALENDAR, "活动日历"), service.list())
            assertEquals(FeedbackArea.CALENDAR, service.requireValid(" calendar "))
        }
        assertEquals(historical, stored.categories)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `已有日历 key 或同名动态板块保持原标识和名称`() {
        for (calendar in listOf(FeedbackCategory("CUSTOM_CAL", "活动日历"), FeedbackCategory(FeedbackArea.CALENDAR, "自定义日历名称"))) {
            every { repository.findById("feedback") } returns Optional.of(FeedbackCategoryCatalog(categories = listOf(calendar)))
            val expected = if (calendar.key == FeedbackArea.CALENDAR) calendar else calendar.copy(builtinKey = FeedbackArea.CALENDAR)
            assertEquals(listOf(expected), service.list())
            assertEquals(calendar.key, service.requireValid(calendar.key))
        }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `同名自定义日历改名后仍复用原 key 不补第二个日历`() {
        var stored = FeedbackCategoryCatalog(categories = listOf(FeedbackCategory("CUSTOM_CAL", "活动日历")), version = 3)
        every { repository.findById("feedback") } answers { Optional.of(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }
        service.rename("CUSTOM_CAL", "活动与招募日程")
        assertEquals(listOf(FeedbackCategory("CUSTOM_CAL", "活动与招募日程", FeedbackArea.CALENDAR)), service.list())
        assertEquals(setOf("CUSTOM_CAL"), service.keys())
    }

    @Test
    fun `新增板块后所有读取使用持久化目录且改名保持标识`() {
        var stored: FeedbackCategoryCatalog? = null
        every { repository.findById("feedback") } answers { Optional.ofNullable(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }

        assertTrue(service.keys().containsAll(setOf(FeedbackArea.STAR, FeedbackArea.MAAYUAN)))
        val created = service.create("  新板块  ")
        assertTrue(created.key.startsWith("CUSTOM_"))
        assertEquals("新板块", service.label(created.key))
        assertEquals(created.key, service.rename(created.key, "新名称").second.key)
        assertEquals("新名称", service.label(created.key))
        assertTrue(service.keys().contains(FeedbackArea.STAR))
    }

    @Test
    fun `空名和重复名不会写入目录`() {
        every { repository.findById("feedback") } returns Optional.empty()
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.create("  ") }.statusCode)
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.create("星石") }.statusCode)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `隐藏和恢复保留目录标识名称且重复设置不写库`() {
        var stored = FeedbackCategoryCatalog(categories = listOf(FeedbackCategory("CUSTOM_CAL", "活动日历")), version = 3)
        every { repository.findById("feedback") } answers { Optional.of(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }

        val hidden = service.setHidden("CUSTOM_CAL", true).second
        assertTrue(hidden.hidden)
        assertEquals(FeedbackArea.CALENDAR, hidden.builtinKey)
        repeat(2) { assertEquals(hidden, service.setHidden("CUSTOM_CAL", true).second) }
        assertEquals(setOf("CUSTOM_CAL"), service.keys())
        assertEquals("活动日历", service.label("CUSTOM_CAL"))
        assertEquals("CUSTOM_CAL", service.requireValid("CUSTOM_CAL"))
        assertEquals(hidden, FeedbackCategoryService(repository).list().single())
        assertEquals(hidden, service.rename("CUSTOM_CAL", "新日历名称").first)
        assertTrue(service.list().single().hidden)
        assertEquals(false, service.setHidden("CUSTOM_CAL", false).second.hidden)
        verify(exactly = 3) { repository.save(any()) }
    }

    @Test
    fun `未知板块与并发隐藏不会静默写入`() {
        every { repository.findById("feedback") } returns Optional.empty()
        assertEquals(404, assertThrows(ApiResultException::class.java) { service.setHidden("MISSING", true) }.statusCode)
        verify(exactly = 0) { repository.save(any()) }
        every { repository.save(any()) } throws OptimisticLockingFailureException("stale")
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.setHidden(FeedbackArea.CALENDAR, true) }.statusCode)
    }

    @Test
    fun `并发修改返回冲突而非覆盖`() {
        every { repository.findById("feedback") } returns Optional.empty()
        every { repository.save(any()) } throws OptimisticLockingFailureException("stale")
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.create("新板块") }.statusCode)
    }

    @Test
    fun `专区显式创建稳定归属且不迁移旧麻圆板块`() {
        var stored = FeedbackCategoryCatalog(categories = FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) })
        every { repository.findById("feedback") } answers { Optional.of(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }
        assertEquals(listOf("yuanhub"), service.spaces().map { it.id })
        val space = service.createSpace("partner-a", "合作平台")
        assertEquals("yuanhub", service.list().single { it.key == "MAAYUAN" }.spaceId)
        val other = service.inSpace(space.id).single()
        assertEquals("partner-a", other.spaceId)
        assertTrue(other.key.startsWith("CUSTOM_"))
        service.updateSpace(space.id, "新名称", active = false)
        assertEquals(space.id, service.requireSpace(space.id).id)
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.requireSpace(space.id, forSubmission = true) }.statusCode)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.requireInSpace("OPERATOR", space.id) }.statusCode)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.updateSpace("yuanhub", "YuanHub", false) }.statusCode)
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.createSpace("partner-a", "另一个名称") }.statusCode)
    }

    @Test
    fun `专区内部允许同名板块且排序不改其他专区`() {
        var stored = FeedbackCategoryCatalog(categories = listOf(FeedbackCategory("CALENDAR", "活动日历"), FeedbackCategory("OTHER", "其他问题")))
        every { repository.findById("feedback") } answers { Optional.of(stored) }
        every { repository.save(any()) } answers { firstArg<FeedbackCategoryCatalog>().also { stored = it } }
        service.createSpace("partner-a", "平台 A")
        val added = service.create("活动日历", "partner-a")
        val defaults = service.inSpace("yuanhub")
        val before = service.inSpace("partner-a").map { it.key }
        service.reorder(before.reversed(), before, "partner-a")
        assertEquals(defaults, service.inSpace("yuanhub"))
        assertEquals(before.reversed(), service.inSpace("partner-a").map { it.key })
        assertEquals("partner-a", added.spaceId)
    }
}
