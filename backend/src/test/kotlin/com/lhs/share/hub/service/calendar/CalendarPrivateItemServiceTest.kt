package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequest
import com.lhs.share.hub.repository.CalendarPrivateItemRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

class CalendarPrivateItemServiceTest {
    private val repository = mockk<CalendarPrivateItemRepository>()
    private val accounts = mockk<SubAccountRepository>()
    private val now = Instant.parse("2026-10-10T04:00:00Z")
    private val day = LocalDate.parse("2026-10-15")
    private val id = "pci_00000000-0000-0000-0000-000000000001"
    private val owner = SubAccount(userId = "owner", accountId = "a", name = "大号", game = "如鸢")
    private val service = CalendarPrivateItemService(
        repository,
        accounts,
        TransactionTemplate(mockk<PlatformTransactionManager>(relaxed = true)),
        Clock.fixed(now, ZoneOffset.UTC),
    )
    private fun request() = CalendarPrivateItemRequest("a", "  领取奖励  ", day, null, "私人说明\n第二行", null)
    private fun record() = CalendarPrivateItem(id, "owner", "a", "如鸢", "领取奖励", day, null, "私人说明", now, now, 0)
    private fun failure(status: Int, action: () -> Unit) =
        assertEquals(status, assertThrows(ActivityCalendarApiException::class.java, action).status.value())

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId("owner", "a") } returns owner
        every { accounts.fenceRecruitmentWrite("owner", "a", "如鸢") } returns true
        every { repository.find("owner", "a", "如鸢", id) } returns record()
        every { repository.save(any()) } answers { firstArg<CalendarPrivateItem>().let { it.copy(version = it.version?.plus(1) ?: 0) } }
    }

    @Test
    fun `create derives identity game timestamps and single time without public data or todo`() {
        val allDay = service.create("owner", request())
        assertEquals("领取奖励", allDay.title)
        assertEquals("a", allDay.accountId)
        assertEquals("如鸢", allDay.game)
        assertEquals("Asia/Shanghai", allDay.timeZone)
        assertEquals(now, allDay.createdAt)
        assertEquals(0L, allDay.version)
        assertNull(allDay.time)
        assertEquals("23:59", service.create("owner", request().copy(time = "23:59")).time)
        verify(exactly = 2) { accounts.fenceRecruitmentWrite("owner", "a", "如鸢") }
        verify { repository.save(match { it.userId == "owner" && it.accountId == "a" && it.game == "如鸢" && it.id.startsWith("pci_") }) }
    }

    @Test
    fun `owner scoped reads bounded date ranges and overflow fail rather than truncate`() {
        every { repository.list("owner", "a", "如鸢", day, day.plusDays(99)) } returns listOf(record())
        assertEquals(listOf(id), service.list("owner", "a", day, day.plusDays(99)).items.map { it.id })
        failure(422) { service.list("owner", "a", day, day.plusDays(100)) }
        failure(422) { service.list("owner", "a", day, day.minusDays(1)) }
        every { repository.list("owner", "a", "如鸢", day, day) } returns List(1001) { record() }
        failure(422) { service.list("owner", "a", day, day) }
        assertEquals(id, service.get("owner", "a", id).id)
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
    }

    @Test
    fun `all operations require account owner and unknown or foreign item gives same 404`() {
        every { accounts.findByUserIdAndAccountId("intruder", "a") } returns null
        listOf<() -> Unit>(
            { service.list("intruder", "a", day, day) },
            { service.get("intruder", "a", id) },
            { service.create("intruder", request()) },
            { service.update("intruder", id, request().copy(expectedVersion = 0)) },
            { service.delete("intruder", "a", id, 0) },
        ).forEach { failure(404, it) }
        every { repository.find("owner", "a", "如鸢", id) } returns null
        val missing = assertThrows(ActivityCalendarApiException::class.java) { service.get("owner", "a", id) }
        assertEquals("private_item_not_found", missing.code)
        failure(404) { service.update("owner", id, request().copy(expectedVersion = 0)) }
        failure(404) { service.delete("owner", "a", id, 0) }
        failure(404) { service.get("owner", "a", "evt_public") }
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { repository.delete(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `CAS update and delete reject stale versions and concurrent writes`() {
        val updated = service.update("owner", id, request().copy(title = "修改", time = "00:00", expectedVersion = 0))
        assertEquals(1L, updated.version)
        assertEquals(now, updated.createdAt)
        assertEquals("00:00", updated.time)
        failure(409) { service.update("owner", id, request().copy(expectedVersion = 1)) }
        failure(409) { service.delete("owner", "a", id, 1) }
        every { repository.delete("owner", "a", "如鸢", id, 0) } returns false
        failure(409) { service.delete("owner", "a", id, 0) }
        every { repository.delete("owner", "a", "如鸢", id, 0) } returns true
        assertEquals(true, service.delete("owner", "a", id, 0))
        every { repository.save(any()) } throws OptimisticLockingFailureException("race")
        failure(409) { service.update("owner", id, request().copy(expectedVersion = 0)) }
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } returns false
        failure(409) { service.create("owner", request()) }
    }

    @Test
    fun `range create update and legacy reads retain dates time note and version`() {
        val end = LocalDate.parse("2027-01-02")
        val start = LocalDate.parse("2026-12-30")
        val created = service.create("owner", request().copy(date = start, endDate = end, time = "23:59"))
        assertEquals(start, created.startDate)
        assertEquals(start, created.date)
        assertEquals(end, created.endDate)
        val legacy = service.get("owner", "a", id)
        assertEquals(day, legacy.startDate)
        assertEquals(day, legacy.endDate)
        val expanded = service.update("owner", id, request().copy(endDate = day.plusDays(5), expectedVersion = 0))
        assertEquals(day.plusDays(5), expanded.endDate)
        val multiDay = record().copy(endDate = day.plusDays(5), time = "09:00")
        every { repository.find("owner", "a", "如鸢", id) } returns multiDay
        val retained = service.update(
            "owner",
            id,
            request().copy(endDate = day.plusDays(6), timeProvided = false, noteProvided = false, expectedVersion = 0),
        )
        assertEquals("09:00", retained.time)
        assertEquals(multiDay.note, retained.note)
        failure(422) { service.update("owner", id, request().copy(expectedVersion = 0)) }
        val collapsed = service.update("owner", id, request().copy(endDate = day, time = null, note = "", expectedVersion = 0))
        assertEquals(day, collapsed.endDate)
        assertNull(collapsed.time)
        assertEquals("", collapsed.note)
    }

    @Test
    fun `range validation accepts leap year and long spans but rejects reversed or out of bounds dates`() {
        val leap = LocalDate.parse("2028-02-29")
        assertEquals(leap, service.create("owner", request().copy(date = leap, endDate = leap)).endDate)
        assertEquals(
            LocalDate.parse("2030-12-31"),
            service.create("owner", request().copy(endDate = LocalDate.parse("2030-12-31"))).endDate,
        )
        failure(422) { service.create("owner", request().copy(endDate = day.minusDays(1))) }
        failure(422) { service.update("owner", id, request().copy(endDate = day.minusDays(1), expectedVersion = 0)) }
        failure(422) { service.create("owner", request().copy(endDate = LocalDate.of(10000, 1, 1))) }
        failure(422) { service.create("owner", request().copy(date = LocalDate.of(0, 1, 1))) }
    }

    @Test
    fun `validation applies even to direct service callers`() {
        listOf(
            request().copy(title = " "),
            request().copy(title = "文".repeat(101)),
            request().copy(note = "文".repeat(1001)),
            request().copy(time = "24:00"),
            request().copy(time = "8:30"),
            request().copy(expectedVersion = 0),
            request().copy(reminderOn = "OTHER"),
            request().copy(reminderDaysBefore = -1),
            request().copy(reminderDaysBefore = 2),
        ).forEach { value -> failure(422) { service.create("owner", value) } }
        failure(422) { service.update("owner", id, request()) }
        failure(422) { service.delete("owner", "a", id, -1) }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `reminder settings default off persist and survive legacy updates until explicitly disabled`() {
        assertNull(service.create("owner", request()).reminderOn)
        val configured = request().copy(reminderOn = "END", reminderDaysBefore = 1, endDate = day.plusDays(5))
        val created = service.create("owner", configured)
        assertEquals("END", created.reminderOn)
        assertEquals(1, created.reminderDaysBefore)
        every { repository.find("owner", "a", "如鸢", id) } returns
            record().copy(reminderOn = "END", reminderDaysBefore = 1)
        val legacy = service.update("owner", id, request().copy(expectedVersion = 0))
        assertEquals("END", legacy.reminderOn)
        assertEquals(1, legacy.reminderDaysBefore)
        val changed = service.update(
            "owner",
            id,
            configured.copy(
                reminderOn = "START",
                reminderDaysBefore = 0,
                expectedVersion = 0,
                reminderOnProvided = true,
                reminderDaysBeforeProvided = true,
            ),
        )
        assertEquals("START", changed.reminderOn)
        assertEquals(0, changed.reminderDaysBefore)
        val disabled = service.update("owner", id, request().copy(expectedVersion = 0, reminderOnProvided = true))
        assertNull(disabled.reminderOn)
        assertEquals(1, disabled.reminderDaysBefore)
    }

    @Test
    fun `monthly save expand edit exceptions and delete retain owner and CAS`() {
        val start = LocalDate.parse("2026-11-01")
        val monthly = record().copy(date = start, endDate = start, recurrence = "MONTHLY")
        val created = service.create("owner", request().copy(date = start, recurrence = "MONTHLY"))
        assertEquals("MONTHLY", created.recurrence)
        every { repository.list("owner", "a", "如鸢", start, start.plusDays(90)) } returns listOf(monthly)
        val instances = service.list("owner", "a", start, start.plusDays(90)).items
        assertEquals(listOf(start, start.plusMonths(1), start.plusMonths(2)), instances.map { it.occurrenceDate })
        assertEquals(setOf(id), instances.map { it.id }.toSet())
        assertEquals(setOf(start), instances.map { it.seriesStartDate }.toSet())
        every { repository.find("owner", "a", "如鸢", id) } returns monthly
        assertEquals("MONTHLY", service.update("owner", id, request().copy(expectedVersion = 0)).recurrence)
        assertEquals("NONE", service.update("owner", id, request().copy(expectedVersion = 0, recurrenceProvided = true)).recurrence)
        failure(409) { service.delete("owner", "a", id, 1, start.plusMonths(1)) }
        failure(422) { service.delete("owner", "a", id, 0, start.minusMonths(1)) }
        failure(422) { service.delete("owner", "a", id, 0, start.plusDays(1)) }
        service.delete("owner", "a", id, 0, start.plusMonths(1))
        verify {
            repository.save(
                match {
                    it.id == id && it.excludedDates == setOf(start.plusMonths(1)) && it.userId == "owner" &&
                        it.accountId == "a"
                },
            )
        }
        verify(exactly = 0) { repository.delete(any(), any(), any(), any(), any()) }
        every { accounts.findByUserIdAndAccountId("intruder", "a") } returns null
        failure(404) { service.delete("intruder", "a", id, 0, start) }
        every { repository.save(any()) } throws OptimisticLockingFailureException("race")
        failure(409) { service.delete("owner", "a", id, 0, start) }
    }
}
