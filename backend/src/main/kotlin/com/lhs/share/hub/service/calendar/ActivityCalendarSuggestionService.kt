package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionAcceptRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionRejectRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionSubmitRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionCurrentEvent
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionPage
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionResponse
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.ActivityCalendarSuggestionRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestion
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionOriginal
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import com.lhs.share.hub.service.account.SubAccountService
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@Service
class ActivityCalendarSuggestionService(
    private val repository: ActivityCalendarSuggestionRepository,
    private val calendar: ActivityCalendarService,
    private val events: ActivityCalendarRepository,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun submit(actor: String, request: ActivityCalendarSuggestionSubmitRequest): ActivityCalendarSuggestionResponse {
        if (!Regex("[A-Za-z0-9_-]{1,128}").matches(request.clientRequestId)) throw calendarInvalid("client_request_id须为1至128位字母、数字、下划线或短横线")
        val note = note(request.submissionNote, false)
        val event = calendar.validate(request.event)
        val source = event.sourceUrl ?: throw calendarInvalid("必须提供来源链接")
        val original = ActivityCalendarSuggestionOriginal(
            event.game, event.title, event.category, event.startDate, event.endDate,
            event.startTime, event.endTime, event.description, source,
            subtype = event.subtype, subtypeDetail = event.subtypeDetail,
        )
        fun reuse(existing: ActivityCalendarSuggestion): ActivityCalendarSuggestionResponse {
            if (existing.original != original || existing.submissionNote != note) throw conflict("同一请求标识的资料不同，请使用新的提交标识")
            return response(existing)
        }
        repository.findRequest(actor, request.clientRequestId)?.let { return reuse(it) }
        val suggestion =
            ActivityCalendarSuggestion("sug_${UUID.randomUUID()}", actor, request.clientRequestId, Instant.now(), original, note)
        return try {
            response(repository.insert(suggestion))
        } catch (error: DuplicateKeyException) {
            reuse(repository.findRequest(actor, request.clientRequestId) ?: throw error)
        }
    }

    fun detail(actor: String, id: String, editor: Boolean): ActivityCalendarSuggestionResponse {
        val suggestion = find(id)
        if (suggestion.submitterId != actor && !editor) throw notFound()
        return response(suggestion)
    }

    fun mine(actor: String, status: String?, page: Int, pageSize: Int): ActivityCalendarSuggestionPage =
        list(actor, status, null, page, pageSize)

    fun queue(status: String?, game: String?, page: Int, pageSize: Int): ActivityCalendarSuggestionPage =
        list(null, status, game, page, pageSize)

    private fun list(actor: String?, status: String?, game: String?, page: Int, pageSize: Int): ActivityCalendarSuggestionPage {
        if (page < 1 || pageSize !in 1..100) throw calendarInvalid("page须大于0，page_size须为1至100")
        if (game != null && game !in SubAccountService.SUPPORTED_GAMES) throw calendarInvalid("不支持的游戏")
        val filter = status?.let { value ->
            ActivityCalendarSuggestionStatus.entries.find { it.name == value } ?: throw calendarInvalid("不支持的建议状态")
        }
        val (items, total) = repository.list(actor, filter, game, page, pageSize)
        return ActivityCalendarSuggestionPage(items.map(::response), total, page, pageSize)
    }

    fun accept(actor: String, id: String, request: ActivityCalendarSuggestionAcceptRequest): ActivityCalendarSuggestionResponse {
        requireVersion(request.expectedVersion)
        // A completed acceptance is idempotent; a retry never applies a new draft.
        val current = find(id)
        if (current.status == ActivityCalendarSuggestionStatus.ACCEPTED) return response(current)
        requirePending(current, request.expectedVersion)
        if (request.event.sourceUrl.isNullOrBlank()) throw calendarInvalid("采纳活动必须提供来源链接")
        if (request.event.timeZone != "Asia/Shanghai") throw calendarInvalid("建议活动时区必须为Asia/Shanghai")
        val reviewNote = note(request.reviewNote, false)
        try {
            val accepted = transactions.execute {
                val locked = find(id)
                if (locked.status == ActivityCalendarSuggestionStatus.ACCEPTED) return@execute locked
                requirePending(locked, request.expectedVersion)
                val created = calendar.create(actor, request.event.copy(enabled = true, expectedVersion = null))
                val snapshot = events.find(created.item.id) ?: error("Created event missing in transaction")
                repository.review(id, request.expectedVersion, ActivityCalendarSuggestionStatus.ACCEPTED, actor, reviewNote, snapshot)
                    ?: throw conflict("建议已被处理，请刷新状态")
            } ?: error("Acceptance transaction returned no result")
            return response(accepted)
        } catch (error: RuntimeException) {
            // Mongo can abort competing transactions or lose a commit response. Inspect outside the transaction.
            if (error is ActivityCalendarApiException && error.status == HttpStatus.CONFLICT || mongoCompetition(error)) {
                val result = repository.find(id)
                if (result?.status == ActivityCalendarSuggestionStatus.ACCEPTED) return response(result)
                throw conflict("建议已被处理，请刷新状态")
            }
            throw error
        }
    }

    fun reject(actor: String, id: String, request: ActivityCalendarSuggestionRejectRequest): ActivityCalendarSuggestionResponse {
        requireVersion(request.expectedVersion)
        val reason = note(request.reviewNote, true)!!
        requirePending(find(id), request.expectedVersion)
        return response(
            repository.review(id, request.expectedVersion, ActivityCalendarSuggestionStatus.REJECTED, actor, reason)
                ?: throw conflict("建议已被处理，请刷新状态"),
        )
    }

    private fun response(value: ActivityCalendarSuggestion): ActivityCalendarSuggestionResponse {
        val current = value.eventId?.let(calendar::findAdminItem)
        return ActivityCalendarSuggestionResponse(
            value.id, value.submitterId, value.createdAt, value.original, value.submissionNote, value.status, value.version,
            value.reviewedBy, value.reviewedAt, value.reviewNote, value.eventId,
            value.acceptedSnapshot?.let(calendar::adminItem)?.item,
            current?.let { ActivityCalendarSuggestionCurrentEvent(it.item, it.enabled) },
        )
    }

    private fun find(id: String): ActivityCalendarSuggestion = repository.find(id) ?: throw notFound()

    private fun requireVersion(version: Long) {
        if (version < 0 || version == Long.MAX_VALUE) throw calendarInvalid("expected_version不正确")
    }

    private fun requirePending(value: ActivityCalendarSuggestion, version: Long) {
        if (value.status != ActivityCalendarSuggestionStatus.PENDING || value.version != version) throw conflict("建议状态或版本已改变，请刷新状态")
    }

    private fun note(value: String?, required: Boolean): String? {
        val normalized = value?.trim()?.takeIf { it.isNotEmpty() }
        if ((normalized?.length ?: 0) > 1000 || required && normalized == null) throw calendarInvalid("审核说明或补充说明须不超过1000字，不采纳原因必填")
        return normalized
    }

    private fun mongoCompetition(error: Throwable): Boolean = generateSequence(error) { it.cause }.any {
        it is MongoException &&
            (
                it.code == 112 || it.code == 251 || it.hasErrorLabel("TransientTransactionError") ||
                    it.hasErrorLabel("UnknownTransactionCommitResult")
                )
    }

    private fun notFound() = ActivityCalendarApiException(HttpStatus.NOT_FOUND, "activity_calendar_suggestion_not_found", "建议不存在")

    private fun conflict(message: String) =
        ActivityCalendarApiException(HttpStatus.CONFLICT, "activity_calendar_suggestion_conflict", message)
}
