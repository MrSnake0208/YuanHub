package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackSupportRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.repository.entity.FeedbackSupport
import com.lhs.share.hub.repository.entity.FeedbackTicket
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import java.time.Instant
import java.util.Optional

class FeedbackPublicServiceTest {
    private val ticketRepository = mockk<FeedbackTicketRepository>()
    private val queryRepository = mockk<FeedbackTicketQueryRepository>()
    private val supportRepository = mockk<FeedbackSupportRepository>()
    private val categories = mockk<FeedbackCategoryService>()
    private val service = FeedbackPublicService(ticketRepository, queryRepository, supportRepository, categories)

    init {
        every { categories.spaces() } returns listOf(FeedbackSpace("yuanhub", "YuanHub（主站）"))
        every { categories.requireSpace("yuanhub", any()) } returns FeedbackSpace("yuanhub", "YuanHub（主站）")
        every { categories.requireInSpace(any(), "yuanhub") } answers { FeedbackArea.requireValid(firstArg()) }
        every { categories.list() } returns FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) }
        every { categories.label(any()) } answers { FeedbackArea.labels[firstArg()] }
    }

    private fun ticket(
        id: String,
        visibility: String? = FeedbackVisibility.PUBLIC,
        mergedIntoId: String? = null,
        supportCount: Int = 0,
        type: String = FeedbackType.BUG,
    ) = FeedbackTicket(
        id = id,
        type = type,
        category = FeedbackArea.OPERATOR,
        area = FeedbackArea.OPERATOR,
        status = "OPEN",
        reporterUserId = "reporter",
        content = "用户原始正文不应出现在公开接口",
        title = "用户原始标题",
        visibility = visibility,
        publicTitle = "公开标题",
        publicSummary = "公开摘要",
        publicStatus = PublicFeedbackStatus.COLLECTING,
        supportCount = supportCount,
        mergedIntoId = mergedIntoId,
        publishedAt = Instant.parse("2026-09-01T00:00:00Z"),
        publicUpdatedAt = Instant.parse("2026-09-02T00:00:00Z"),
    )

    @Test
    fun `历史误公开举报在详情和关注接口一律为不存在`() {
        for (report in listOf(
            ticket("report", type = "REPORT"),
            ticket("report", type = " feedback ").copy(category = " report "),
        )) {
            every { ticketRepository.findById("report") } returns Optional.of(report)
            assertEquals(404, assertThrows(ApiResultException::class.java) { service.getById(null, "report") }.statusCode)
            assertEquals(404, assertThrows(ApiResultException::class.java) { service.support("user", "report") }.statusCode)
            assertEquals(404, assertThrows(ApiResultException::class.java) { service.unsupport("user", "report") }.statusCode)
        }
        verify(exactly = 0) { supportRepository.save(any()) }
        verify(exactly = 0) { supportRepository.deleteByFeedbackIdAndUserId(any(), any()) }
    }

    @Test
    fun `合并跳转不会公开举报目标`() {
        every { ticketRepository.findById("source") } returns Optional.of(ticket("source", mergedIntoId = "report"))
        every { ticketRepository.findById("report") } returns Optional.of(ticket("report", type = "REPORT"))
        assertEquals(null, service.getById(null, "source").mergedInto)
        assertEquals(404, assertThrows(ApiResultException::class.java) { service.support("user", "source") }.statusCode)
        verify(exactly = 0) { supportRepository.save(any()) }
    }

    @Test
    fun `匿名公开日历反馈仅显示目录板块和公开内容且每批只读一次目录`() {
        val publicTicket = ticket(
            "rpt_cal",
            type = FeedbackType.EXPERIENCE,
        ).copy(category = FeedbackArea.CALENDAR, area = FeedbackArea.CALENDAR)
        every { queryRepository.publicSearch(any(), any(), any(), any(), any(), any()) } returns
            PageImpl(listOf(publicTicket, publicTicket.copy(id = "rpt_cal_2")))
        every { ticketRepository.findById("rpt_cal") } returns Optional.of(publicTicket)
        val page = service.list(null, 1, 20, "EXPERIENCE", null, null, null, "latest")
        assertTrue(page.items.all { it.category == FeedbackArea.CALENDAR && it.categoryLabel == "活动日历" })
        verify(exactly = 1) { categories.list() }
        val detail = service.getById(null, "rpt_cal")
        assertEquals(FeedbackArea.CALENDAR, detail.category)
        assertEquals("活动日历", detail.categoryLabel)
        assertEquals(FeedbackType.EXPERIENCE, detail.type)
        val privateFields =
            setOf("content", "messages", "reporterUserId", "clientInfo", "diagnostics", "workArea", "operatorAssigneeUserId")
        assertTrue(detail.javaClass.declaredFields.none { it.name in privateFields })
        assertTrue(page.items.first().javaClass.declaredFields.none { it.name in privateFields })
        verify(exactly = 0) { supportRepository.findByUserIdAndFeedbackIdIn(any(), any()) }
    }

    @Test
    fun `缺失 visibility 的历史工单在公开详情中表现为不存在`() {
        every { ticketRepository.findById("rpt_legacy") } returns Optional.of(ticket("rpt_legacy", visibility = null))

        val error = assertThrows(ApiResultException::class.java) {
            service.getById("user", "rpt_legacy")
        }

        assertEquals(404, error.statusCode)
    }

    @Test
    fun `公开列表只暴露公开字段并标记当前用户支持`() {
        every {
            queryRepository.publicSearch(any(), any(), any(), any(), any(), any())
        } returns PageImpl(listOf(ticket("rpt_1", supportCount = 3)), PageRequest.of(0, 20), 1)
        every {
            supportRepository.findByUserIdAndFeedbackIdIn("user", listOf("rpt_1"))
        } returns listOf(FeedbackSupport(feedbackId = "rpt_1", userId = "user"))

        val page = service.list("user", 1, 20, null, null, null, null, "latest")

        assertEquals(1, page.total)
        assertEquals(1, page.items.size)
        val item = page.items.single()
        assertEquals("公开标题", item.publicTitle)
        assertEquals("公开摘要", item.publicSummary)
        assertEquals(FeedbackType.BUG, item.type)
        assertEquals(3, item.supportCount)
        assertTrue(item.supportedByCurrentUser)
    }

    @Test
    fun `相似查询在有效字符不足时直接返回空且不访问数据库`() {
        val result = service.similar("user", "a", null, null)

        assertTrue(result.isEmpty())
        verify(exactly = 0) { queryRepository.searchPublicSimilar(any(), any()) }
    }

    @Test
    fun `相似查询最多返回请求的条数`() {
        val candidates = (1..4).map { ticket("rpt_$it") }
        every { queryRepository.searchPublicSimilar(any(), any()) } returns candidates
        every { supportRepository.findByUserIdAndFeedbackIdIn(any(), any()) } returns emptyList()

        val result = service.similar("user", "账号显示错误", FeedbackType.BUG, 2)

        assertEquals(2, result.size)
    }

    @Test
    fun `首次支持写入唯一记录并加票一次`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_1", "user") } returns false andThen true
        every { supportRepository.save(any()) } answers { firstArg() }
        every { queryRepository.incrementSupportCount("rpt_1") } returns ticket("rpt_1", supportCount = 1)

        val detail = service.support("user", "rpt_1")

        verify(exactly = 1) { supportRepository.save(match { it.feedbackId == "rpt_1" && it.userId == "user" }) }
        verify(exactly = 1) { queryRepository.incrementSupportCount("rpt_1") }
        assertEquals(1, detail.supportCount)
        assertTrue(detail.supportedByCurrentUser)
    }

    @Test
    fun `重复支持不会重复写记录或加票`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1", supportCount = 1))
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_1", "user") } returns true

        val detail = service.support("user", "rpt_1")

        verify(exactly = 0) { supportRepository.save(any()) }
        verify(exactly = 0) { queryRepository.incrementSupportCount(any()) }
        assertEquals(1, detail.supportCount)
    }

    @Test
    fun `取消支持在没有记录时不减票`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { supportRepository.deleteByFeedbackIdAndUserId("rpt_1", "user") } returns 0
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_1", "user") } returns false

        val detail = service.unsupport("user", "rpt_1")

        verify(exactly = 0) { queryRepository.decrementSupportCount(any()) }
        assertEquals(0, detail.supportCount)
        assertFalse(detail.supportedByCurrentUser)
    }

    @Test
    fun `取消支持删除记录时减票一次`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1", supportCount = 2))
        every { supportRepository.deleteByFeedbackIdAndUserId("rpt_1", "user") } returns 1
        every { queryRepository.decrementSupportCount("rpt_1") } returns ticket("rpt_1", supportCount = 1)
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_1", "user") } returns false

        val detail = service.unsupport("user", "rpt_1")

        verify(exactly = 1) { queryRepository.decrementSupportCount("rpt_1") }
        assertEquals(1, detail.supportCount)
    }

    @Test
    fun `支持已合并反馈时落在最终主反馈`() {
        val source = ticket("rpt_source", mergedIntoId = "rpt_main")
        val main = ticket("rpt_main")
        every { ticketRepository.findById("rpt_source") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_main") } returns Optional.of(main)
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_main", "user") } returns false andThen true
        every { supportRepository.save(any()) } answers { firstArg() }
        every { queryRepository.incrementSupportCount("rpt_main") } returns main.copy(supportCount = 1)

        service.support("user", "rpt_source")

        verify(exactly = 1) { supportRepository.save(match { it.feedbackId == "rpt_main" }) }
        verify(exactly = 1) { queryRepository.incrementSupportCount("rpt_main") }
    }

    @Test
    fun `公开详情返回合并指向`() {
        val source = ticket("rpt_source", mergedIntoId = "rpt_main")
        val main = ticket("rpt_main")
        every { ticketRepository.findById("rpt_source") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_main") } returns Optional.of(main)
        every { supportRepository.existsByFeedbackIdAndUserId(any(), any()) } returns false

        val detail = service.getById("user", "rpt_source")

        assertEquals("rpt_main", detail.mergedInto?.id)
        assertEquals("公开标题", detail.mergedInto?.publicTitle)
        assertEquals("公开摘要", detail.publicSummary)
    }

    @Test
    fun `列表分页参数非法抛 400`() {
        val error = assertThrows(ApiResultException::class.java) {
            service.list("user", 0, 20, null, null, null, null, "latest")
        }
        assertEquals(400, error.statusCode)
    }
}
