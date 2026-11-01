package com.lhs.share.hub.service.development

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.development.request.DevelopmentGoalRequest
import com.lhs.share.hub.repository.DevelopmentGoalRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.DevelopmentCriterion
import com.lhs.share.hub.repository.entity.DevelopmentGoal
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import java.time.Instant
import java.util.Optional

class DevelopmentGoalServiceTest {
    private val repository = mockk<DevelopmentGoalRepository>()
    private val feedback = mockk<FeedbackTicketRepository>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val service = DevelopmentGoalService(repository, feedback, authorization)

    @BeforeEach
    fun setup() {
        every { authorization.requirePermission("admin", AdminPermission.DEVELOPMENT_GOAL_MANAGE) } just Runs
        every { repository.save(any<DevelopmentGoal>()) } answers { firstArg<DevelopmentGoal>().copy(version = 0) }
    }

    @Test
    fun `目标独立创建且不要求反馈来源`() {
        val result = service.create("admin", request())
        assertEquals("目标", result.title)
        assertEquals("PLANNED", result.stage)
        assertEquals(1, result.criteria.size)
        assertEquals(emptyList<String>(), result.feedbackIds)
        verify(exactly = 0) { feedback.findAllById(any<Iterable<String>>()) }
    }

    @Test
    fun `公开读取只返回公开标题并过滤取消公开的关联且没有写入`() {
        every { repository.findAll(any<Pageable>()) } returns
            PageImpl(listOf(goal().copy(feedbackIds = listOf("public", "private", "missing"))))
        every { feedback.findAllById(any<Iterable<String>>()) } returns listOf(ticket("public", "PUBLIC"), ticket("private", "PRIVATE"))
        val result = service.list(1, 12, null).data.single()
        assertEquals(listOf("公开标题"), result.linkedFeedback.map { it.title })
        assertEquals(listOf("public"), result.linkedFeedback.map { it.id })
        assertNull(result.feedbackIds)
        verify(exactly = 0) { repository.save(any<DevelopmentGoal>()) }
        verify(exactly = 0) { feedback.save(any<FeedbackTicket>()) }
    }

    @Test
    fun `不能新关联私人或不存在的反馈`() {
        every { feedback.findAllById(any<Iterable<String>>()) } returns listOf(ticket("private", "PRIVATE"))
        assertEquals(
            400,
            assertThrows(ApiResultException::class.java) {
                service.create("admin", request().copy(feedbackIds = listOf("private", "missing")))
            }.statusCode,
        )
        verify(exactly = 0) { repository.save(any<DevelopmentGoal>()) }
    }

    @Test
    fun `公开反馈关联只使用整理后标题且不改变反馈状态`() {
        every { feedback.findAllById(any<Iterable<String>>()) } returns listOf(ticket("public", "PUBLIC"))
        val result = service.create("admin", request().copy(feedbackIds = listOf("public", "public")))
        assertEquals(listOf("public"), result.feedbackIds)
        assertEquals("公开标题", result.linkedFeedback.single().title)
        verify(exactly = 0) { feedback.save(any<FeedbackTicket>()) }
    }

    @Test
    fun `未全部验收不可完成并拒绝非法阶段日期和空白内容`() {
        val invalid = listOf(
            request().copy(stage = "COMPLETED"),
            request().copy(stage = "UNKNOWN"),
            request().copy(title = " "),
            request().copy(description = " "),
            request().copy(criteria = emptyList()),
            request().copy(criteria = listOf(DevelopmentCriterion(" "))),
            request().copy(targetDate = "2026-02-30"),
            request().copy(feedbackIds = List(21) { "r$it" }),
            request().copy(feedbackIds = listOf(" ")),
            request().copy(feedbackIds = listOf("r".repeat(81))),
        )
        invalid.forEach { value ->
            assertEquals(400, assertThrows(ApiResultException::class.java) { service.create("admin", value) }.statusCode)
        }
        val completed = service.create("admin", request().copy(stage = "COMPLETED", criteria = listOf(DevelopmentCriterion("验收", true))))
        assertEquals("COMPLETED", completed.stage)
    }

    @Test
    fun `旧版本及并发保存冲突不会静默覆盖`() {
        every { repository.findById("goal_1") } returns Optional.of(goal())
        assertEquals(
            409,
            assertThrows(ApiResultException::class.java) {
                service.update("admin", "goal_1", request().copy(expectedVersion = 1))
            }.statusCode,
        )
        assertEquals(409, assertThrows(ApiResultException::class.java) { service.update("admin", "goal_1", request()) }.statusCode)
        every { repository.save(any<DevelopmentGoal>()) } throws OptimisticLockingFailureException("concurrent write")
        assertEquals(
            409,
            assertThrows(ApiResultException::class.java) {
                service.update("admin", "goal_1", request().copy(expectedVersion = 2))
            }.statusCode,
        )
    }

    @Test
    fun `保持既有关联时允许它已取消公开但不返回私人标题`() {
        every { repository.findById("goal_1") } returns Optional.of(goal().copy(feedbackIds = listOf("private")))
        every { feedback.findAllById(any<Iterable<String>>()) } returns listOf(ticket("private", "PRIVATE"))
        val result = service.update("admin", "goal_1", request().copy(feedbackIds = listOf("private"), expectedVersion = 2))
        assertEquals(emptyList<String>(), result.linkedFeedback.map { it.title })
    }

    @Test
    fun `写入及管理查询都先检查权限`() {
        every { authorization.requirePermission("guest", AdminPermission.DEVELOPMENT_GOAL_MANAGE) } throws ApiResultException(403, "权限不足")
        listOf<() -> Any>(
            { service.create("guest", request()) },
            { service.update("guest", "goal_1", request()) },
            { service.list(1, 12, null, "guest") },
            { service.get("guest", "goal_1") },
        ).forEach { action -> assertEquals(403, assertThrows(ApiResultException::class.java) { action() }.statusCode) }
        verify(exactly = 0) { repository.findById(any()) }
        verify(exactly = 0) { repository.save(any<DevelopmentGoal>()) }
    }

    @Test
    fun `筛选分页有界且非法输入不查询数据库`() {
        every { repository.findByStage("IN_PROGRESS", any()) } returns PageImpl(emptyList())
        assertEquals(0, service.list(1, 12, "IN_PROGRESS").data.size)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.list(0, 12, null) }.statusCode)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.list(1, 51, null) }.statusCode)
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.list(1, 12, "UNKNOWN") }.statusCode)
        verify(exactly = 0) { repository.findAll(any<Pageable>()) }
    }

    private fun request() = DevelopmentGoalRequest(" 目标 ", " 交付说明 ", "PLANNED", listOf(DevelopmentCriterion("验收")))
    private fun goal() = DevelopmentGoal(
        "goal_1",
        "目标",
        "交付说明",
        "PLANNED",
        listOf(DevelopmentCriterion("验收")),
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        version = 2,
    )
    private fun ticket(id: String, visibility: String) = FeedbackTicket(
        id = id,
        type = "BUG",
        reporterUserId = "reporter",
        content = "私人正文",
        title = "私人标题",
        visibility = visibility,
        publicTitle = "公开标题",
    )
}
