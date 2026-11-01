package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSourceType
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarServiceTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val recruitment = mockk<RecruitmentCatalogRepository>()
    private val service = ActivityCalendarService(repository, recruitment)
    private val date = LocalDate.parse("2026-10-03")
    private val request = ActivityCalendarWriteRequest("如鸢", " 活动 ", ActivityCalendarCategory.ACTIVITY, date, date.plusDays(7))
    private val event = ActivityCalendarEvent(
        "evt_test", "如鸢", "活动", ActivityCalendarCategory.ACTIVITY, date, date.plusDays(7),
        createdBy = "creator", createdAt = Instant.EPOCH, updatedBy = "creator", updatedAt = Instant.EPOCH, version = 0,
    )

    @Test
    fun `公开读取合并排序且不派生停用缺日期或倒置卡池并保持只读`() {
        every { repository.list(null, null, null, emptySet(), true) } returns listOf(
            event.copy(id = "evt_z", startTime = "10:00", endTime = "11:00"),
            event.copy(id = "evt_a"),
        )
        every { recruitment.all() } returns listOf(
            pool("later", date.plusDays(1), date.plusDays(3)),
            pool("earlier", date.minusDays(2), date),
            pool("disabled", date, date).copy(enabled = false),
            pool("hidden", date, date).copy(hidden = true),
            pool("missing-start", null, date),
            pool("missing-end", date, null),
            pool("no-dates", null, null),
            pool("inverted", date.plusDays(1), date),
        )
        val items = service.publicItems(null, null, null, null).items
        assertEquals(listOf("recruitment:earlier", "evt_a", "evt_z", "recruitment:later"), items.map { it.id })
        assertEquals(ActivityCalendarSourceType.MANUAL, items[1].sourceType)
        assertNull(items[1].sourceRef)
        assertNull(items[1].startTime)
        assertNull(items[1].endTime)
        assertEquals("earlier", items[0].sourceRef)
        assertEquals(ActivityCalendarSourceType.RECRUITMENT_POOL, items[0].sourceType)
        assertEquals(ActivityCalendarCategory.RECRUITMENT, items[0].category)
        assertEquals("https://example.com/pool", items[0].sourceUrl)
        assertEquals(items, service.publicItems(null, null, null, null).items)
        verify(exactly = 0) {
            repository.save(any())
            recruitment.save(any())
        }
    }

    @Test
    fun `日历仅投影公开目录已确认绑定的有效UP名称且不改标题来源或日期`() {
        every { repository.list(null, null, null, emptySet(), true) } returns listOf(event)
        val confirmed = pool("confirmed", date, date.plusDays(7)).copy(
            poolType = "LIMITED",
            upStatus = "verified",
            upAgents = listOf(
                RecruitmentUpAgent("a", " 甲 ", "operator-a"),
                RecruitmentUpAgent("b", "乙", "operator-b"),
                RecruitmentUpAgent("duplicate", "甲", "operator-a"),
                RecruitmentUpAgent("inactive", "退役", "operator-c", active = false),
                RecruitmentUpAgent("placeholder", "占位候选"),
                RecruitmentUpAgent("blank-id", "未绑定", " "),
                RecruitmentUpAgent("blank-name", " ", "operator-d"),
            ),
            sourceUpAgentNames = listOf("来源候选"),
        )
        every { recruitment.all() } returns listOf(
            confirmed,
            confirmed.copy(poolId = "partial", upStatus = "partial"),
            confirmed.copy(poolId = "single", upAgents = listOf(RecruitmentUpAgent("a", "甲", "operator-a"))),
            confirmed.copy(poolId = "unmapped", upAgents = listOf(RecruitmentUpAgent("a", "占位候选"))),
            confirmed.copy(poolId = "inactive", upAgents = confirmed.upAgents.map { it.copy(active = false) }),
            confirmed.copy(poolId = "unknown", upStatus = "unknown"),
            confirmed.copy(poolId = "selection", upStatus = "selection"),
            pool("legacy", date, date),
            confirmed.copy(poolId = "hidden", hidden = true),
            confirmed.copy(poolId = "disabled", enabled = false),
            confirmed.copy(poolId = "other-game", game = "代号鸢"),
        )
        val items = service.publicItems(null, null, null, null).items.associateBy { it.id }
        for (id in listOf("confirmed", "partial", "other-game")) {
            assertEquals(listOf("甲", "乙"), items.getValue("recruitment:$id").upAgentNames)
        }
        assertEquals(listOf("甲"), items.getValue("recruitment:single").upAgentNames)
        for (id in listOf("unmapped", "inactive", "unknown", "selection", "legacy")) {
            assertTrue(items.getValue("recruitment:$id").upAgentNames.isEmpty())
        }
        assertTrue(items.getValue(event.id).upAgentNames.isEmpty())
        assertFalse(items.containsKey("recruitment:hidden"))
        assertFalse(items.containsKey("recruitment:disabled"))
        val item = items.getValue("recruitment:confirmed")
        assertEquals(confirmed.name, item.title)
        assertEquals(confirmed.poolId, item.sourceRef)
        assertEquals(confirmed.poolType, item.poolType)
        assertEquals(confirmed.startDate, item.startDate)
        assertEquals(confirmed.endDate, item.endDate)
        assertEquals(confirmed.sourceUrl, item.sourceUrl)
        assertEquals(items.values.toSet(), service.publicItems(null, null, null, null).items.toSet())
        verify(exactly = 0) {
            repository.save(any())
            recruitment.save(any())
        }
    }

    @Test
    fun `游戏类别和闭区间overlap应用于两个来源且支持重复和逗号类别`() {
        val categories = setOf(ActivityCalendarCategory.ACTIVITY, ActivityCalendarCategory.RECRUITMENT)
        every { repository.list("如鸢", date, date.plusDays(1), categories, true) } returns listOf(event)
        every { recruitment.all() } returns listOf(
            pool("touch-start", date.minusDays(10), date),
            pool("touch-end", date.plusDays(1), date.plusDays(10)),
            pool("cover", date.minusDays(10), date.plusDays(10)),
            pool("before", date.minusDays(10), date.minusDays(1)),
            pool("after", date.plusDays(2), date.plusDays(10)),
            pool("other-game", date, date).copy(game = "代号鸢"),
        )
        val items = service.publicItems("如鸢", date, date.plusDays(1), listOf("ACTIVITY,RECRUITMENT", "ACTIVITY")).items
        assertEquals(
            setOf("evt_test", "recruitment:touch-start", "recruitment:touch-end", "recruitment:cover"),
            items.map {
                it.id
            }.toSet(),
        )
        verify { repository.list("如鸢", date, date.plusDays(1), categories, true) }
        every { repository.list(null, null, null, setOf(ActivityCalendarCategory.SHOP), true) } returns emptyList()
        assertTrue(service.publicItems(null, null, null, listOf("SHOP")).items.isEmpty())
        every { repository.list(null, date, null, emptySet(), true) } returns emptyList()
        assertFalse(service.publicItems(null, date, null, null).items.any { it.id == "recruitment:before" })
        every { repository.list(null, null, date, emptySet(), true) } returns emptyList()
        assertFalse(service.publicItems(null, null, date, null).items.any { it.id == "recruitment:after" })
    }

    @Test
    fun `管理读取停用手工项与只读招募来源且支持状态和标题筛选`() {
        every { repository.list(null, null, null, emptySet(), null) } returns listOf(event.copy(enabled = false))
        every { recruitment.all() } returns listOf(pool("pool", date, date))
        val items = service.adminItems(null, null, null, null, null, null).items
        assertFalse(items.first { it.item.id == "evt_test" }.enabled)
        assertFalse(items.first { it.item.id == "evt_test" }.readOnly)
        val derived = items.first { it.readOnly }
        assertNull(derived.version)
        assertEquals("来源备注", derived.sourceNote)
        assertEquals(listOf("evt_test"), service.adminItems(null, null, null, null, null, " 活动 ").items.map { it.item.id })
        every { repository.list(null, null, null, emptySet(), false) } returns listOf(event.copy(enabled = false))
        assertEquals(listOf("evt_test"), service.adminItems(null, null, null, null, false, null).items.map { it.item.id })
        verify(exactly = 0) {
            repository.save(any())
            recruitment.save(any())
        }
    }

    @Test
    fun `创建生成身份保留日期精度更新保留创建审计并支持停用`() {
        every { repository.save(any()) } answers
            { firstArg<ActivityCalendarEvent>().copy(version = (firstArg<ActivityCalendarEvent>().version ?: -1) + 1) }
        val created = service.create("creator", request)
        assertTrue(created.item.id.startsWith("evt_"))
        assertEquals("活动", created.item.title)
        assertNull(created.item.startTime)
        assertNull(created.item.endTime)
        assertEquals(0L, created.version)
        assertEquals("creator", created.createdBy)
        every { repository.find(event.id) } returns event
        val updated = service.update("editor", event.id, request.copy(expectedVersion = 0, enabled = false))
        assertEquals(1L, updated.version)
        assertFalse(updated.enabled)
        assertEquals("creator", updated.createdBy)
        assertEquals(Instant.EPOCH, updated.createdAt)
        assertEquals("editor", updated.updatedBy)
    }

    @Test
    fun `显式旧版本和实际保存竞争均返回冲突且派生项不可写`() {
        every { repository.find(event.id) } returns event
        assertEquals(409, failure { service.update("editor", event.id, request.copy(expectedVersion = 1)) }.status.value())
        verify(exactly = 0) { repository.save(any()) }
        every { repository.save(any()) } throws OptimisticLockingFailureException("concurrent update")
        val conflict = failure { service.update("editor", event.id, request.copy(expectedVersion = 0)) }
        assertEquals(409, conflict.status.value())
        assertEquals("activity_calendar_version_conflict", conflict.code)
        assertEquals(422, failure { service.update("editor", "recruitment:pool", request.copy(expectedVersion = 0)) }.status.value())
        verify(exactly = 0) {
            repository.find("recruitment:pool")
            recruitment.save(any())
        }
        every { repository.find("missing") } returns null
        assertEquals(404, failure { service.update("editor", "missing", request.copy(expectedVersion = 0)) }.status.value())
    }

    @Test
    fun `写入校验长度游戏类别日期成对时间时区来源与更新版本`() {
        val invalid = listOf(
            request.copy(game = "other"), request.copy(title = " "), request.copy(title = "a".repeat(121)),
            request.copy(category = ActivityCalendarCategory.RECRUITMENT), request.copy(endDate = date.minusDays(1)),
            request.copy(startTime = "10:00"), request.copy(endTime = "10:00"),
            request.copy(startTime = "24:00", endTime = "12:00"),
            request.copy(startTime = "9:00", endTime = "12:00"),
            request.copy(endDate = date, startTime = "12:00", endTime = "11:59"),
            request.copy(timeZone = "bad-zone"), request.copy(description = "a".repeat(1001)),
            request.copy(sourceUrl = "javascript:alert(1)"), request.copy(sourceUrl = "http:/missing-host"),
            request.copy(sourceUrl = "https://bad host"), request.copy(expectedVersion = 0),
        )
        invalid.forEach { input -> assertEquals(422, failure { service.create("editor", input) }.status.value()) }
        listOf(null, -1L, Long.MAX_VALUE).forEach { version ->
            assertEquals(422, failure { service.update("editor", event.id, request.copy(expectedVersion = version)) }.status.value())
        }
        verify(exactly = 0) { repository.save(any()) }
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        service.create(
            "editor",
            request.copy(title = "a".repeat(120), description = "a".repeat(1000), sourceUrl = " https://example.com/path "),
        )
        service.create("editor", request.copy(endDate = date, startTime = "10:00", endTime = "10:00"))
        service.create("editor", request.copy(startTime = "23:00", endTime = "01:00"))
    }

    @Test
    fun `无效查询在读取前被拒绝`() {
        assertEquals(422, failure { service.publicItems("other", null, null, null) }.status.value())
        assertEquals(422, failure { service.publicItems(null, date, date.minusDays(1), null) }.status.value())
        assertEquals(422, failure { service.publicItems(null, null, null, listOf("UNKNOWN")) }.status.value())
        verify {
            repository wasNot io.mockk.Called
            recruitment wasNot io.mockk.Called
        }
    }

    private fun pool(id: String, start: LocalDate?, end: LocalDate?) =
        RecruitmentCatalogPool(id, "如鸢", "卡池", start, end, sourceUrl = "https://example.com/pool", sourceNote = "来源备注")

    private fun failure(action: () -> Unit) = assertThrows(ActivityCalendarApiException::class.java, action)

    @Test
    fun `all explicit subtypes validate and survive writes reads without relabeling legacy categories`() {
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        for (subtype in ActivityCalendarSubtype.entries) {
            for (category in subtype.categories) {
                val result = service.create("editor", request.copy(category = category, subtype = subtype))
                assertEquals(category, result.item.category)
                assertEquals(subtype, result.item.subtype)
            }
        }
        val cave = service.create(
            "editor",
            request.copy(subtype = ActivityCalendarSubtype.FURNITURE, subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE),
        )
        assertEquals(ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE, cave.item.subtypeDetail)
        for (category in ActivityCalendarCategory.entries.filter { it != ActivityCalendarCategory.RECRUITMENT }) {
            val result = service.adminItem(event.copy(category = category))
            assertEquals(category, result.item.category)
            assertNull(result.item.subtype)
            assertNull(result.item.subtypeDetail)
        }
        assertEquals(
            "subtype",
            failure {
                service.validate(request.copy(category = ActivityCalendarCategory.OTHER, subtype = ActivityCalendarSubtype.FURNITURE))
            }.field,
        )
        assertEquals(
            "subtype_detail",
            failure {
                service.validate(request.copy(subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE))
            }.field,
        )
        every { repository.find(event.id) } returns event
        val updated = service.update("editor", event.id, request.copy(expectedVersion = 0, subtype = ActivityCalendarSubtype.LARGE_EVENT))
        assertEquals(ActivityCalendarSubtype.LARGE_EVENT, updated.item.subtype)
        assertEquals(event.startDate, updated.item.startDate)
        assertEquals(event.endDate, updated.item.endDate)
    }

    @Test
    fun `title only updates preserve every historical classification and unrelated business fields`() {
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 1) }
        val historical = listOf(
            event.copy(category = ActivityCalendarCategory.LOGIN),
            event.copy(category = ActivityCalendarCategory.MAINTENANCE),
            event.copy(category = ActivityCalendarCategory.SHOP, subtype = ActivityCalendarSubtype.ACTIVITY_SHOP),
            event.copy(category = ActivityCalendarCategory.OTHER, subtype = ActivityCalendarSubtype.STAR_POOL),
            event.copy(subtype = ActivityCalendarSubtype.FIRST_MEETING_ROULETTE),
            event.copy(subtype = ActivityCalendarSubtype.MEDIUM_EVENT),
            event.copy(subtype = ActivityCalendarSubtype.TAISHAN_FU),
            event.copy(subtype = ActivityCalendarSubtype.FURNITURE_TRIAL),
            event.copy(subtype = ActivityCalendarSubtype.MYSTERIOUS_CAVE),
            event.copy(subtype = ActivityCalendarSubtype.FURNITURE, subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE),
        )
        for (old in historical) {
            every { repository.find(old.id) } returns old
            val updated = service.update(
                "editor",
                old.id,
                request.copy(
                    title = "只改标题",
                    category = old.category,
                    subtype = old.subtype,
                    subtypeDetail = old.subtypeDetail,
                    expectedVersion = 0,
                ),
            )
            assertEquals(old.id, updated.item.id)
            assertEquals(old.category, updated.item.category)
            assertEquals(old.subtype, updated.item.subtype)
            assertEquals(old.subtypeDetail, updated.item.subtypeDetail)
            assertEquals(old.game, updated.item.game)
            assertEquals(old.startDate, updated.item.startDate)
            assertEquals(old.endDate, updated.item.endDate)
            assertEquals(old.enabled, updated.enabled)
        }
    }

    @Test
    fun `catalog raw pool type is passed through with stable source identity visibility and read only`() {
        every { repository.list(null, null, null, emptySet(), null) } returns emptyList()
        every { recruitment.all() } returns listOf(
            pool("typed", date, date).copy(poolType = "复刻限定"),
            pool("unknown", date, date).copy(poolType = "未识别类型"),
            pool("hidden", date, date).copy(poolType = "限定", hidden = true),
            pool("disabled", date, date).copy(poolType = "限定", enabled = false),
        )
        val result = service.adminItems(null, null, null, null, null, null).items
        assertEquals(listOf("recruitment:typed", "recruitment:unknown"), result.map { it.item.id })
        assertEquals(listOf("复刻限定", "未识别类型"), result.map { it.item.poolType })
        assertTrue(result.all { it.readOnly && it.version == null && it.item.subtype == null })
        assertEquals(listOf("typed", "unknown"), result.map { it.item.sourceRef })
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `持续活动保留空结束日期允许开始时刻并可补齐结束日期`() {
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        val open = service.create("editor", request.copy(endDate = null, startTime = "05:00"))
        assertNull(open.item.endDate)
        assertNull(open.item.endAt)
        assertEquals(Instant.parse("2026-10-02T21:00:00Z"), open.item.startAt)
        assertEquals("end_time", failure { service.create("editor", request.copy(endDate = null, endTime = "04:59")) }.field)
        assertEquals("start_time", failure { service.create("editor", request.copy(endDate = null, startTime = "25:00")) }.field)
        every { repository.find(open.item.id) } returns event.copy(id = open.item.id, endDate = null, startTime = "05:00")
        val closed = service.update("editor", open.item.id, request.copy(expectedVersion = 0, startTime = "05:00", endTime = "04:59"))
        assertEquals(date.plusDays(7), closed.item.endDate)
        assertEquals(Instant.parse("2026-10-09T20:59:00Z"), closed.item.endAt)
    }
}
