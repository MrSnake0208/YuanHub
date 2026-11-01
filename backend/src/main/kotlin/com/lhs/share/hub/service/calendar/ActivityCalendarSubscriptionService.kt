package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.CalendarCompletionRequest
import com.lhs.share.hub.controller.calendar.request.CalendarProgressRequest
import com.lhs.share.hub.controller.calendar.request.CalendarSubscribeRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarItem
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionResponse
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionSummaryResponse
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionsResponse
import com.lhs.share.hub.repository.ActivityCalendarSubscriptionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarSubscription
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class ActivityCalendarSubscriptionService(
    private val repository: ActivityCalendarSubscriptionRepository,
    private val accounts: SubAccountRepository,
    private val calendar: ActivityCalendarService,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val zone = ZoneId.of("Asia/Shanghai")
    private fun today(): LocalDate = LocalDate.ofInstant(clock.instant(), zone)

    /**
     * [maxWindowDays] 是端点级窗口上限:网页端沿用 100 天,小组件 OpenAPI 端点放宽到 180 天。
     */
    fun list(
        userId: String,
        accountId: String,
        from: LocalDate?,
        to: LocalDate?,
        category: String?,
        maxWindowDays: Long = 100,
    ): CalendarSubscriptionsResponse {
        val account = account(userId, accountId)
        val start = from ?: today()
        val end = to ?: start.plusDays(90)
        if (end < start || ChronoUnit.DAYS.between(start, end) > maxWindowDays) {
            throw calendarInvalid("日期范围须在${maxWindowDays}天以内")
        }
        val selected = category?.let { value ->
            ActivityCalendarCategory.entries.find { it.name == value } ?: throw calendarInvalid("不支持的活动类别")
        }
        val records = resolved(userId, account)
        return CalendarSubscriptionsResponse(
            records.filter {
                it.item != null && (it.item.endDate == null || it.item.endDate >= start) && it.item.startDate <= end &&
                    (selected == null || it.item.category == selected)
            },
            records.filter { it.item == null },
            records.size,
        )
    }

    fun summary(userId: String, accountId: String): CalendarSubscriptionSummaryResponse {
        val records = resolved(userId, account(userId, accountId))
        val now = clock.instant()
        val day = today()
        val pending = records.filter { !it.completed }
        val reminders = pending.filter { record ->
            val item = record.item
            item != null && !ended(item, now, day) &&
                (started(item, now, day) || deadline(item) <= now.plus(3, ChronoUnit.DAYS))
        }.sortedWith(
            compareBy<CalendarSubscriptionResponse> {
                deadline(checkNotNull(it.item))
            }.thenBy { it.eventId },
        )
        return CalendarSubscriptionSummaryResponse(reminders.take(3), pending.size, records.size)
    }

    fun get(userId: String, accountId: String, eventId: String): CalendarSubscriptionResponse {
        val owner = account(userId, accountId)
        return response(find(userId, accountId, eventId), sources(owner)[eventId])
    }

    fun subscribe(userId: String, eventId: String, request: CalendarSubscribeRequest): CalendarSubscriptionResponse = write {
        val owner = account(userId, request.accountId)
        fence(owner)
        val current = repository.find(userId, owner.accountId, eventId)
        if (current?.version != request.expectedVersion || (current == null && !request.subscribed)) throw calendarConflict()
        val item = sources(owner)[eventId]
        if (request.subscribed &&
            (item == null || ended(item, clock.instant(), today()) || (current != null && current.game != item.game))
        ) {
            throw calendarInvalid("该活动已截止、停用或与当前账号游戏不符，无法订阅")
        }
        val now = clock.instant()
        val next = current?.copy(subscribed = request.subscribed, updatedAt = now) ?: ActivityCalendarSubscription(
            id = "acs_${UUID.randomUUID()}",
            userId = userId,
            accountId = owner.accountId,
            eventId = eventId,
            game = owner.game,
            createdAt = now,
            updatedAt = now,
        )
        response(repository.save(next), item)
    }

    fun completion(userId: String, eventId: String, request: CalendarCompletionRequest): CalendarSubscriptionResponse = write {
        val owner = account(userId, request.accountId)
        fence(owner)
        val current = find(userId, owner.accountId, eventId)
        if (current.version != request.expectedVersion) throw calendarConflict()
        if (!current.subscribed || current.game != owner.game) throw calendarInvalid("该订阅当前不可编辑")
        val item = sources(owner)[eventId]
        val next = if (current.manualCompleted == request.completed) {
            current
        } else {
            repository.save(
                current.copy(manualCompleted = request.completed, updatedAt = clock.instant()),
            )
        }
        response(next, item)
    }

    fun progress(userId: String, eventId: String, request: CalendarProgressRequest): CalendarSubscriptionResponse = write {
        val owner = account(userId, request.accountId)
        fence(owner)
        val current = find(userId, owner.accountId, eventId)
        if (current.version != request.expectedVersion) throw calendarConflict()
        val item = sources(owner)[eventId]
        if (!current.subscribed || item == null || current.game != item.game) throw calendarInvalid("该订阅当前不可编辑")
        val checklistOnly = request.progressMode == "checklist"
        if (request.progressMode != null && (
                !checklistOnly || request.completed || request.memoTitle != null ||
                    request.memoNote != null || request.manualCompleted != null
                )
        ) {
            throw calendarInvalid("待办保存不能同时修改历史备忘或整期完成状态")
        }
        val previousTitles = current.checklist.associate { it.id to it.title }
        val entries = request.checklist.map {
            if (checklistOnly && previousTitles[it.id] == it.title) it else it.copy(title = it.title.trim())
        }
        if (entries.size > 50 ||
            entries.any { it.title.isBlank() || it.title.length !in 1..80 || !it.id.matches(Regex("[A-Za-z0-9_-]{1,80}")) } ||
            entries.map { it.id }.distinct().size != entries.size ||
            (entries.isNotEmpty() && request.completed && request.manualCompleted == null)
        ) {
            throw calendarInvalid("待办名称、标识或完成状态不正确")
        }
        val memoTitle = request.memoTitle?.trim() ?: current.memoTitle
        val memoNote = request.memoNote ?: current.memoNote
        if (memoTitle.isBlank() || memoTitle.length > 60 || memoNote.length > 1000) throw calendarInvalid("备忘标题或备注不正确")
        val completed = if (checklistOnly) current.completed else entries.isEmpty() && request.completed
        response(
            repository.save(
                current.copy(
                    checklist = entries,
                    completed = completed,
                    manualCompleted = request.manualCompleted ?: current.manualCompleted,
                    memoTitle = memoTitle,
                    memoNote = memoNote,
                    updatedAt = clock.instant(),
                ),
            ),
            item,
        )
    }

    private fun sources(account: SubAccount): Map<String, ActivityCalendarItem> =
        calendar.publicItems(account.game, null, null, null).items.associateBy { it.id }

    private fun resolved(userId: String, account: SubAccount): List<CalendarSubscriptionResponse> {
        val records = repository.list(userId, account.accountId)
        if (records.isEmpty()) return emptyList()
        val items = sources(account)
        return records.map { response(it, items[it.eventId]) }.sortedBy { it.eventId }
    }

    private fun response(record: ActivityCalendarSubscription, item: ActivityCalendarItem?) = CalendarSubscriptionResponse(
        record.eventId,
        checkNotNull(record.version),
        record.subscribed,
        record.isCompleted(),
        record.checklist,
        item?.takeIf { it.game == record.game },
        record.memoTitle,
        record.memoNote,
        record.manualCompleted,
        record.completed,
    )

    private fun account(userId: String, accountId: String): SubAccount = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw ActivityCalendarApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

    private fun find(userId: String, accountId: String, eventId: String): ActivityCalendarSubscription =
        repository.find(userId, accountId, eventId)
            ?: throw ActivityCalendarApiException(HttpStatus.NOT_FOUND, "subscription_not_found", "订阅不存在")

    private fun fence(owner: SubAccount) {
        if (!accounts.fenceRecruitmentWrite(owner.userId, owner.accountId, owner.game)) throw calendarConflict()
    }

    private fun <T : Any> write(action: () -> T): T = try {
        checkNotNull(transaction.execute { action() })
    } catch (_: DuplicateKeyException) {
        throw calendarConflict()
    } catch (_: OptimisticLockingFailureException) {
        throw calendarConflict()
    } catch (e: RuntimeException) {
        if (RecruitmentService.isWriteConflict(e)) throw calendarConflict()
        throw e
    }

    private fun started(item: ActivityCalendarItem, now: Instant, day: LocalDate): Boolean =
        item.startAt?.let { it <= now } ?: (item.startDate <= day)

    private fun deadline(item: ActivityCalendarItem): Instant =
        item.endAt ?: item.endDate?.plusDays(1)?.atStartOfDay(zone)?.toInstant() ?: Instant.MAX

    private fun ended(item: ActivityCalendarItem, now: Instant, day: LocalDate): Boolean =
        item.endAt?.let { it <= now } ?: (item.endDate?.let { it < day } ?: false)
}
