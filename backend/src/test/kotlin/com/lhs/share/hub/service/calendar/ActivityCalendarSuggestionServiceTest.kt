package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionAcceptRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionRejectRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionSubmitRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.ActivityCalendarSuggestionRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestion
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionOriginal
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarSuggestionServiceTest {
    private val repository = mockk<ActivityCalendarSuggestionRepository>()
    private val events = mockk<ActivityCalendarRepository>()
    private val transactions = mockk<TransactionTemplate>()
    private val calendar = ActivityCalendarService(events, mockk<RecruitmentCatalogRepository>())
    private val service = ActivityCalendarSuggestionService(repository, calendar, events, transactions)
    private val day = LocalDate.parse("2026-10-03")
    private val event =
        ActivityCalendarWriteRequest("如鸢", "活动", ActivityCalendarCategory.ACTIVITY, day, day, sourceUrl = "https://example.com/event")
    private val original =
        ActivityCalendarSuggestionOriginal("如鸢", "活动", ActivityCalendarCategory.ACTIVITY, day, day, sourceUrl = event.sourceUrl!!)
    private val pending = ActivityCalendarSuggestion("sug_one", "owner", "req-one", Instant.EPOCH, original, "私人")
    private val submit = ActivityCalendarSuggestionSubmitRequest(event, "私人", "req-one")

    private fun failure(status: Int, action: () -> Unit) {
        assertEquals(status, assertThrows(ActivityCalendarApiException::class.java, action).status.value())
    }

    @Test
    fun `submit normalizes shares calendar validation and never creates formal events`() {
        every { repository.findRequest("owner", "req-one") } returns null
        every { repository.insert(any()) } answers { firstArg() }
        val result = service.submit("owner", submit.copy(event = event.copy(title = " 活动 ")))
        assertEquals("owner", result.submitterId)
        assertEquals("活动", result.original.title)
        assertEquals(ActivityCalendarSuggestionStatus.PENDING, result.status)
        assertEquals(0L, result.version)
        assertNull(result.eventId)
        verify(exactly = 1) { repository.insert(any()) }
        verify {
            events wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @Test
    fun `same request reuses immutable original and unique index race recovers only same data`() {
        every { repository.findRequest("owner", "req-one") } returns pending
        assertEquals(pending.id, service.submit("owner", submit).id)
        failure(409) { service.submit("owner", submit.copy(event = event.copy(title = "different"))) }
        failure(409) { service.submit("owner", submit.copy(submissionNote = "other")) }
        verify(exactly = 0) { repository.insert(any()) }
        every { repository.findRequest("owner", "req-one") } returnsMany listOf(null, pending)
        every { repository.insert(any()) } throws DuplicateKeyException("unique")
        assertEquals(pending.id, service.submit("owner", submit).id)
        verify { events wasNot io.mockk.Called }
    }

    @Test
    fun `submission rejects missing source invalid key long note recruitment dates times links and lengths without writes`() {
        listOf(
            submit.copy(clientRequestId = ""), submit.copy(clientRequestId = "x".repeat(129)),
            submit.copy(submissionNote = "x".repeat(1001)), submit.copy(event = event.copy(sourceUrl = null)),
            submit.copy(event = event.copy(sourceUrl = "ftp://example.com")), submit.copy(event = event.copy(title = "x".repeat(121))),
            submit.copy(
                event = event.copy(game = "unknown"),
            ),
            submit.copy(event = event.copy(category = ActivityCalendarCategory.RECRUITMENT)),
            submit.copy(event = event.copy(endDate = day.minusDays(1))), submit.copy(event = event.copy(startTime = "10:00")),
            submit.copy(event = event.copy(startTime = "25:00", endTime = "12:00")),
            submit.copy(event = event.copy(startTime = "12:00", endTime = "11:00")),
            submit.copy(event = event.copy(description = "x".repeat(1001))),
        ).forEach { invalid -> failure(422) { service.submit("owner", invalid) } }
        verify {
            repository wasNot io.mockk.Called
            events wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @Test
    fun `private record unknown and other owner return same 404 and read performs no writes`() {
        every { repository.find("sug_one") } returns pending
        every { repository.find("missing") } returns null
        assertEquals(pending.id, service.detail("owner", "sug_one", false).id)
        assertEquals(pending.id, service.detail("editor", "sug_one", true).id)
        failure(404) { service.detail("other", "sug_one", false) }
        failure(404) { service.detail("other", "missing", false) }
        verify(exactly = 0) {
            repository.insert(any())
            repository.review(any(), any(), any(), any(), any(), any())
        }
    }

    @Test
    fun `pagination filter validation owner scope queue filters and bounded empty results are pure`() {
        every { repository.list("owner", ActivityCalendarSuggestionStatus.PENDING, null, 2, 20) } returns (listOf(pending) to 21L)
        every { repository.list(null, null, "如鸢", 1, 100) } returns (emptyList<ActivityCalendarSuggestion>() to 0L)
        val result = service.mine("owner", "PENDING", 2, 20)
        assertEquals(21L, result.total)
        assertEquals(2, result.page)
        assertEquals(20, result.pageSize)
        assertEquals(emptyList<Any>(), service.queue(null, "如鸢", 1, 100).items)
        failure(422) { service.mine("owner", null, 0, 20) }
        failure(422) { service.mine("owner", null, 1, 101) }
        failure(422) { service.mine("owner", "BAD", 1, 20) }
        failure(422) { service.queue(null, "BAD", 1, 20) }
        verify(exactly = 2) { repository.list(any(), any(), any(), any(), any()) }
        verify(exactly = 0) {
            repository.insert(any())
            repository.review(any(), any(), any(), any(), any(), any())
        }
    }

    @Test
    fun `reject requires reason valid version and pending CAS then terminal conflict cannot overwrite`() {
        every { repository.find(pending.id) } returns pending
        failure(422) { service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(0, "  ")) }
        failure(422) { service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(-1, "原因")) }
        failure(409) { service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(1, "原因")) }
        every { repository.review(pending.id, 0, ActivityCalendarSuggestionStatus.REJECTED, "editor", "原因", null) } returns
            pending.copy(status = ActivityCalendarSuggestionStatus.REJECTED, version = 1, reviewNote = "原因")
        assertEquals("原因", service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(0, " 原因 ")).reviewNote)
        every { repository.review(any(), any(), any(), any(), any(), any()) } returns null
        failure(409) { service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(0, "原因")) }
        every { repository.find(pending.id) } returns pending.copy(status = ActivityCalendarSuggestionStatus.REJECTED, version = 1)
        failure(409) { service.accept("editor", pending.id, ActivityCalendarSuggestionAcceptRequest(1, event, null)) }
        failure(409) { service.reject("editor", pending.id, ActivityCalendarSuggestionRejectRequest(1, "再次")) }
        verify {
            events wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @Test
    fun `pending acceptance requires mandatory source and Shanghai timezone without transaction or event write`() {
        every { repository.find(pending.id) } returns pending
        failure(422) {
            service.accept("editor", pending.id, ActivityCalendarSuggestionAcceptRequest(0, event.copy(sourceUrl = null), null))
        }
        failure(422) {
            service.accept("editor", pending.id, ActivityCalendarSuggestionAcceptRequest(0, event.copy(sourceUrl = "  "), null))
        }
        failure(422) {
            service.accept("editor", pending.id, ActivityCalendarSuggestionAcceptRequest(0, event.copy(timeZone = "UTC"), null))
        }
        verify {
            events wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @Test
    fun `accepted retry returns historical public snapshot current disabled event and never applies new draft or leaks admin notes`() {
        val snapshot = ActivityCalendarEvent(
            "evt_one", "如鸢", "审核标题", ActivityCalendarCategory.ACTIVITY, day, day, sourceNote = "管理私密",
            createdBy = "editor", createdAt = Instant.EPOCH, updatedBy = "editor", updatedAt = Instant.EPOCH, version = 0,
        )
        val accepted = pending.copy(
            status = ActivityCalendarSuggestionStatus.ACCEPTED,
            version = 1,
            eventId = snapshot.id,
            acceptedSnapshot = snapshot,
        )
        every { repository.find(pending.id) } returns accepted
        every { events.find(snapshot.id) } returns snapshot.copy(title = "当前标题", enabled = false)
        val result = service.accept("editor", pending.id, ActivityCalendarSuggestionAcceptRequest(0, event.copy(title = "新草稿"), "新说明"))
        assertEquals("审核标题", result.acceptedSnapshot!!.title)
        assertEquals("当前标题", result.currentEvent!!.item.title)
        assertEquals(false, result.currentEvent!!.enabled)
        assertEquals("私人", result.submissionNote)
        assertEquals("活动", result.original.title)
        verify(exactly = 0) {
            repository.review(any(), any(), any(), any(), any(), any())
            events.save(any())
        }
        verify { transactions wasNot io.mockk.Called }
    }

    @Test
    fun `suggestion original retains furniture detail and rejects conflicting retry classification`() {
        every { repository.findRequest("owner", "req-one") } returns null
        every { repository.insert(any()) } answers { firstArg() }
        val classified = submit.copy(
            event = event.copy(
                subtype = ActivityCalendarSubtype.FURNITURE,
                subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE,
            ),
        )
        val response = service.submit("owner", classified)
        assertEquals(ActivityCalendarSubtype.FURNITURE, response.original.subtype)
        assertEquals(ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE, response.original.subtypeDetail)
        every { repository.findRequest("owner", "req-one") } returns pending.copy(original = response.original)
        failure(409) { service.submit("owner", submit) }
        failure(422) { service.submit("owner", classified.copy(event = classified.event.copy(category = ActivityCalendarCategory.OTHER))) }
        verify { events wasNot io.mockk.Called }
    }
}
