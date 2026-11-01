package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

object CalendarPrivateItemOccurrences {
    private val lastDate = LocalDate.of(9999, 12, 31)

    fun occursOn(value: CalendarPrivateItem, date: LocalDate): Boolean =
        value.recurrence == "MONTHLY" && date >= value.date && date !in value.excludedDates &&
            date.dayOfMonth == minOf(value.date.dayOfMonth, date.lengthOfMonth())

    fun end(value: CalendarPrivateItem, start: LocalDate): LocalDate {
        val duration = ChronoUnit.DAYS.between(value.date, value.endDate ?: value.date)
        return start.plusDays(minOf(duration, ChronoUnit.DAYS.between(start, lastDate)))
    }

    // Iterate the query window plus the original duration, never the series' entire history.
    fun dates(value: CalendarPrivateItem, from: LocalDate, to: LocalDate): List<LocalDate> {
        if (value.recurrence != "MONTHLY") return listOf(value.date)
        val duration = ChronoUnit.DAYS.between(value.date, value.endDate ?: value.date)
        val earliest = from.minusDays(minOf(duration, ChronoUnit.DAYS.between(LocalDate.of(1, 1, 1), from)))
        val firstMonth = YearMonth.from(maxOf(value.date, earliest))
        var month = YearMonth.from(to)
        val dates = mutableListOf<LocalDate>()
        while (month >= firstMonth) {
            val start = month.atDay(minOf(value.date.dayOfMonth, month.lengthOfMonth()))
            if (occursOn(value, start) && start <= to && end(value, start) >= from) {
                dates.add(start)
                if (dates.size > 1000) throw calendarInvalid("当前范围私人事项超过1000条，请缩小日期范围")
            }
            if (month == firstMonth) break
            month = month.minusMonths(1)
        }
        return dates.asReversed()
    }
}
