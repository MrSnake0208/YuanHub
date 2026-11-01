package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate

class CalendarPrivateItemOccurrencesTest {
    private fun date(value: String) = LocalDate.parse(value)
    private fun record(start: String, end: String = start) = CalendarPrivateItem(
        "pci_series", "owner", "account", "如鸢", "月度事项", date(start), "09:00", "说明", Instant.EPOCH, Instant.EPOCH,
        version = 0, endDate = date(end), recurrence = "MONTHLY",
    )

    @Test
    fun `monthly clamps to short month without drifting and never precedes first start`() {
        for ((start, expected) in listOf(
            "2026-01-31" to listOf("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"),
            "2026-01-30" to listOf("2026-01-30", "2026-02-28", "2026-03-30", "2026-04-30"),
            "2028-01-29" to listOf("2028-01-29", "2028-02-29", "2028-03-29", "2028-04-29"),
        )) {
            val year = start.take(4)
            assertEquals(
                expected.map(::date),
                CalendarPrivateItemOccurrences.dates(record(start), date("$year-01-01"), date("$year-04-30")),
            )
        }
        assertTrue(CalendarPrivateItemOccurrences.dates(record("2026-11-01"), date("2026-10-01"), date("2026-10-31")).isEmpty())
        assertEquals(
            listOf("2026-11-01", "2026-12-01", "2027-01-01").map(::date),
            CalendarPrivateItemOccurrences.dates(record("2026-11-01"), date("2026-11-01"), date("2027-01-31")),
        )
    }

    @Test
    fun `query includes crossing ranges and excludes only persisted occurrence dates`() {
        val value = record("2026-01-31", "2026-02-02")
        assertEquals(listOf(date("2026-02-28")), CalendarPrivateItemOccurrences.dates(value, date("2026-03-01"), date("2026-03-01")))
        assertEquals(date("2026-03-02"), CalendarPrivateItemOccurrences.end(value, date("2026-02-28")))
        val excluded = value.copy(excludedDates = setOf(date("2026-02-28")))
        assertTrue(CalendarPrivateItemOccurrences.dates(excluded, date("2026-03-01"), date("2026-03-01")).isEmpty())
        assertEquals(listOf(date("2026-03-31")), CalendarPrivateItemOccurrences.dates(excluded, date("2026-03-31"), date("2026-03-31")))
        val long = record("2025-01-01", "2025-04-01")
        assertEquals(4, CalendarPrivateItemOccurrences.dates(long, date("2026-04-01"), date("2026-04-01")).size)
    }

    @Test
    fun `supported year bounds terminate without overflow`() {
        val minimum = record("0001-01-01", "0001-03-01")
        assertEquals(listOf(date("0001-01-01")), CalendarPrivateItemOccurrences.dates(minimum, date("0001-01-01"), date("0001-01-01")))
        val maximum = record("9999-11-30", "9999-12-31")
        assertEquals(date("9999-12-31"), CalendarPrivateItemOccurrences.end(maximum, date("9999-12-30")))
        assertEquals(2, CalendarPrivateItemOccurrences.dates(maximum, date("9999-12-31"), date("9999-12-31")).size)
    }
}
