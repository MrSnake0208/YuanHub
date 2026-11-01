package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequest
import com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequestDecoder
import com.lhs.share.hub.controller.calendar.response.CalendarPrivateItemResponse
import com.lhs.share.hub.controller.calendar.response.CalendarPrivateItemsResponse
import com.lhs.share.hub.repository.CalendarPrivateItemRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class CalendarPrivateItemService(
    private val repository: CalendarPrivateItemRepository,
    private val accounts: SubAccountRepository,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun list(userId: String, accountId: String, from: LocalDate, to: LocalDate): CalendarPrivateItemsResponse {
        val owner = account(userId, accountId)
        if (from.year !in 1..9999 || to.year !in 1..9999 || to < from || ChronoUnit.DAYS.between(from, to) >= 100) {
            throw calendarInvalid("私人事项日期范围须在100天以内")
        }
        val values = repository.list(userId, accountId, owner.game, from, to)
        if (values.size > 1000) throw calendarInvalid("当前范围私人事项超过1000条，请缩小日期范围")
        val instances = mutableListOf<CalendarPrivateItemResponse>()
        for (value in values) {
            for (date in CalendarPrivateItemOccurrences.dates(value, from, to)) {
                instances.add(response(value, date))
                if (instances.size > 1000) throw calendarInvalid("当前范围私人事项超过1000条，请缩小日期范围")
            }
        }
        return CalendarPrivateItemsResponse(instances.sortedWith(compareBy({ it.startDate }, { it.time ?: "" }, { it.id })))
    }

    fun get(userId: String, accountId: String, id: String): CalendarPrivateItemResponse = response(find(account(userId, accountId), id))

    fun create(userId: String, request: CalendarPrivateItemRequest): CalendarPrivateItemResponse = write {
        val owner = account(userId, request.accountId)
        fence(owner)
        validate(request)
        if (request.expectedVersion != null) throw calendarInvalid("新建不接受expected_version")
        val now = clock.instant().truncatedTo(ChronoUnit.MILLIS)
        response(
            repository.save(
                CalendarPrivateItem(
                    "pci_${UUID.randomUUID()}", userId, owner.accountId, owner.game,
                    request.title.trim(), request.date, request.time, request.note, now, now,
                    endDate = request.endDate ?: request.date,
                    reminderOn = request.reminderOn,
                    reminderDaysBefore = request.reminderDaysBefore,
                    recurrence = request.recurrence,
                ),
            ),
        )
    }

    fun update(userId: String, id: String, request: CalendarPrivateItemRequest): CalendarPrivateItemResponse = write {
        val owner = account(userId, request.accountId)
        fence(owner)
        val current = find(owner, id)
        val version = request.expectedVersion ?: throw calendarInvalid("请提供expected_version")
        CalendarPrivateItemRequestDecoder.requireVersion(version)
        if (current.version != version) throw conflict()
        validate(request)
        if (request.endDate == null && current.endDate != null && current.endDate != current.date) {
            throw calendarInvalid("多日事项请使用start_date/end_date编辑，原区间已保留", "end_date")
        }
        response(
            repository.save(
                current.copy(
                    title = request.title.trim(),
                    date = request.date,
                    endDate = request.endDate ?: request.date,
                    time = if (request.timeProvided) request.time else current.time,
                    note = if (request.noteProvided) request.note else current.note,
                    reminderOn = if (request.reminderOnProvided) request.reminderOn else current.reminderOn,
                    reminderDaysBefore = if (request.reminderDaysBeforeProvided) request.reminderDaysBefore else current.reminderDaysBefore,
                    recurrence = if (request.recurrenceProvided) request.recurrence else current.recurrence,
                    updatedAt = clock.instant().truncatedTo(ChronoUnit.MILLIS),
                ),
            ),
        )
    }

    fun delete(userId: String, accountId: String, id: String, expectedVersion: Long, occurrenceDate: LocalDate? = null): Boolean = write {
        val owner = account(userId, accountId)
        fence(owner)
        val current = find(owner, id)
        CalendarPrivateItemRequestDecoder.requireVersion(expectedVersion)
        if (current.version != expectedVersion) throw conflict()
        if (occurrenceDate != null) {
            if (occurrenceDate.year !in 1..9999 || !CalendarPrivateItemOccurrences.occursOn(current, occurrenceDate)) {
                throw calendarInvalid("该期私人事项不存在", "occurrence_date")
            }
            repository.save(
                current.copy(
                    excludedDates = current.excludedDates + occurrenceDate,
                    updatedAt = clock.instant().truncatedTo(ChronoUnit.MILLIS),
                ),
            )
        } else if (!repository.delete(userId, accountId, owner.game, id, expectedVersion)) {
            throw conflict()
        }
        true
    }

    private fun account(userId: String, accountId: String): SubAccount = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw ActivityCalendarApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

    private fun find(owner: SubAccount, id: String): CalendarPrivateItem {
        if (!id.matches(Regex("pci_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))) throw notFound()
        return repository.find(owner.userId, owner.accountId, owner.game, id) ?: throw notFound()
    }

    private fun fence(owner: SubAccount) {
        if (!accounts.fenceRecruitmentWrite(owner.userId, owner.accountId, owner.game)) throw conflict()
    }

    private fun validate(request: CalendarPrivateItemRequest) {
        if (request.recurrence !in setOf("NONE", "MONTHLY")) throw calendarInvalid("仅支持不重复或每月固定", "recurrence")
        if (request.reminderOn != null && request.reminderOn !in setOf("START", "END")) {
            throw calendarInvalid("提醒日期须为START或END", "reminder_on")
        }
        if (request.reminderDaysBefore !in 0..1) throw calendarInvalid("仅支持当天或提前一天提醒", "reminder_days_before")
        if (request.endDate != null && (request.endDate.year !in 1..9999 || request.endDate < request.date)) {
            throw calendarInvalid("结束日期不能早于开始日期，且须为有效日期", "end_date")
        }
        if (request.title.trim().length !in 1..100 || request.note.length > 1000 || request.date.year !in 1..9999 ||
            request.time != null && !request.time.matches(Regex("([01][0-9]|2[0-3]):[0-5][0-9]"))
        ) {
            throw calendarInvalid("标题须为1–100字，说明最多1000字，日期或时间不正确")
        }
    }

    private fun response(value: CalendarPrivateItem, occurrenceDate: LocalDate? = null): CalendarPrivateItemResponse =
        CalendarPrivateItemResponse(
            value.id, value.accountId, value.game, value.title, occurrenceDate ?: value.date, value.time, value.note,
            checkNotNull(value.version), value.createdAt, value.updatedAt,
            endDate = occurrenceDate?.let { CalendarPrivateItemOccurrences.end(value, it) } ?: value.endDate ?: value.date,
            reminderOn = value.reminderOn,
            reminderDaysBefore = value.reminderDaysBefore,
            recurrence = value.recurrence,
            occurrenceDate = if (value.recurrence == "MONTHLY") occurrenceDate else null,
            seriesStartDate = value.date,
            seriesEndDate = value.endDate ?: value.date,
        )

    private fun <T : Any> write(action: () -> T): T = try {
        checkNotNull(transaction.execute { action() })
    } catch (_: OptimisticLockingFailureException) {
        throw conflict()
    } catch (_: DuplicateKeyException) {
        throw conflict()
    } catch (error: RuntimeException) {
        if (RecruitmentService.isWriteConflict(error)) throw conflict()
        throw error
    }

    private fun notFound() = ActivityCalendarApiException(HttpStatus.NOT_FOUND, "private_item_not_found", "私人事项不存在")
    private fun conflict() = ActivityCalendarApiException(HttpStatus.CONFLICT, "private_item_conflict", "事项或账号已变化，请读取最新内容后重试")
}
