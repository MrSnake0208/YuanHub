package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarAdminItem
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarAdminResponse
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarItem
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarResponse
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSourceType
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.net.URI
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@Service
class ActivityCalendarService(
    private val repository: ActivityCalendarRepository,
    private val recruitment: RecruitmentCatalogRepository,
) {
    fun publicItems(game: String?, from: LocalDate?, to: LocalDate?, category: List<String>?): ActivityCalendarResponse =
        ActivityCalendarResponse(entries(game, from, to, category, true).map { it.item })

    fun adminItems(
        game: String?,
        from: LocalDate?,
        to: LocalDate?,
        category: List<String>?,
        enabled: Boolean?,
        search: String?,
    ): ActivityCalendarAdminResponse = ActivityCalendarAdminResponse(
        entries(game, from, to, category, enabled).filter {
            search.isNullOrBlank() ||
                it.item.title.contains(search.trim(), ignoreCase = true)
        },
    )

    private fun entries(
        game: String?,
        from: LocalDate?,
        to: LocalDate?,
        category: List<String>?,
        enabled: Boolean?,
    ): List<ActivityCalendarAdminItem> {
        game?.let(::requireGame)
        if (from != null && to != null && from > to) throw calendarInvalid("from不能晚于to")
        val categories = category.orEmpty().flatMap { it.split(',') }.map { value ->
            ActivityCalendarCategory.entries.find { it.name == value.trim() } ?: throw calendarInvalid("不支持的活动类别")
        }.toSet()
        val manual = repository.list(game, from, to, categories, enabled).map(::adminItem)
        val pools = if (categories.isEmpty() || ActivityCalendarCategory.RECRUITMENT in categories) {
            recruitment.all().mapNotNull { pool ->
                val start = pool.startDate ?: return@mapNotNull null
                val end = pool.endDate ?: return@mapNotNull null
                if (pool.hidden || !pool.enabled || start > end || enabled == false || (game != null && pool.game != game) ||
                    (from != null && end < from) || (to != null && start > to)
                ) {
                    return@mapNotNull null
                }
                ActivityCalendarAdminItem(
                    item = ActivityCalendarItem(
                        "recruitment:${pool.poolId}", ActivityCalendarSourceType.RECRUITMENT_POOL, pool.poolId,
                        pool.game, pool.name, ActivityCalendarCategory.RECRUITMENT, start, end, sourceUrl = pool.sourceUrl,
                        poolType = pool.poolType,
                        upAgentNames = if (pool.upStatus in setOf("verified", "partial")) {
                            pool.upAgents.filter { it.active && !it.operatorId.isNullOrBlank() }
                                .map { it.name.trim() }.filter { it.isNotEmpty() }.distinct()
                        } else {
                            emptyList()
                        },
                    ),
                    readOnly = true, enabled = true, version = null, sourceNote = pool.sourceNote,
                    createdBy = null, createdAt = null, updatedBy = pool.updatedBy, updatedAt = pool.updatedAt,
                )
            }
        } else {
            emptyList()
        }
        return (manual + pools).sortedWith(
            compareBy<ActivityCalendarAdminItem> { it.item.startDate }.thenBy { it.item.startTime }.thenBy { it.item.id },
        )
    }

    fun create(actor: String, request: ActivityCalendarWriteRequest): ActivityCalendarAdminItem {
        if (request.expectedVersion != null) throw calendarInvalid("新建活动不接受expected_version")
        return adminItem(save(event(actor, "evt_${UUID.randomUUID()}", request, null)))
    }

    fun update(actor: String, id: String, request: ActivityCalendarWriteRequest): ActivityCalendarAdminItem {
        if (id.startsWith("recruitment:")) throw calendarInvalid("招募派生项只读，请在招募卡池管理修改")
        val expected = request.expectedVersion ?: throw calendarInvalid("更新必须提供expected_version")
        if (expected < 0 || expected == Long.MAX_VALUE) throw calendarInvalid("expected_version不正确")
        val current =
            repository.find(id) ?: throw ActivityCalendarApiException(HttpStatus.NOT_FOUND, "activity_calendar_not_found", "活动不存在")
        if (current.version != expected) throw calendarConflict()
        return adminItem(save(event(actor, id, request, current)))
    }

    /** Shares normalization and validation with suggestions without writing a formal event. */
    fun validate(request: ActivityCalendarWriteRequest): ActivityCalendarWriteRequest {
        val validated = event("", "", request, null)
        return request.copy(title = validated.title, sourceUrl = validated.sourceUrl)
    }

    fun insertImported(actor: String, id: String, request: ActivityCalendarWriteRequest): ActivityCalendarEvent =
        repository.insert(event(actor, id, request, null))

    fun findAdminItem(id: String): ActivityCalendarAdminItem? = repository.find(id)?.let(::adminItem)

    private fun event(
        actor: String,
        id: String,
        request: ActivityCalendarWriteRequest,
        current: ActivityCalendarEvent?,
    ): ActivityCalendarEvent {
        requireGame(request.game)
        val title = request.title.trim().takeIf { it.length in 1..120 } ?: throw calendarInvalid("标题须为1至120字", "title")
        if (request.category == ActivityCalendarCategory.RECRUITMENT) throw calendarInvalid("招募活动由卡池目录派生", "category")
        if (request.subtype != null && request.category !in request.subtype.categories) {
            throw calendarInvalid("细分类别与活动类型不匹配", "subtype")
        }
        if (request.subtypeDetail != null && request.subtype != ActivityCalendarSubtype.FURNITURE) {
            throw calendarInvalid("神秘洞窟必须属于活动下的家具", "subtype_detail")
        }
        if (request.endDate != null && request.endDate < request.startDate) throw calendarInvalid("结束日期不能早于开始日期", "end_date")
        if (request.endDate == null && request.endTime != null) throw calendarInvalid("未填写结束日期时不能填写结束时间", "end_time")
        if (request.endDate != null && (request.startTime == null) != (request.endTime == null)) {
            throw calendarInvalid("开始和结束时间须成对填写", if (request.startTime == null) "start_time" else "end_time")
        }
        for ((field, time) in listOf("start_time" to request.startTime, "end_time" to request.endTime)) {
            if (time != null && !Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]").matches(time)) throw calendarInvalid("时间须为HH:mm", field)
        }
        if (request.startDate == request.endDate && request.startTime != null && request.endTime!! < request.startTime) {
            throw calendarInvalid("结束时间不能早于开始时间", "end_time")
        }
        try {
            ZoneId.of(request.timeZone)
        } catch (_: DateTimeException) {
            throw calendarInvalid("时区不正确", "time_zone")
        }
        for ((field, value) in listOf("description" to request.description, "source_note" to request.sourceNote)) {
            if ((value?.length ?: 0) > 1000) throw calendarInvalid("说明或来源备注不能超过1000字", field)
        }
        val sourceUrl = request.sourceUrl?.trim()?.takeIf { it.isNotEmpty() }
        if (sourceUrl != null) {
            val uri = try {
                URI(sourceUrl)
            } catch (_: java.net.URISyntaxException) {
                throw calendarInvalid("来源链接不正确", "source_url")
            }
            if (sourceUrl.length > 2048 || uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank()) {
                throw calendarInvalid("来源链接须为http/https地址", "source_url")
            }
        }
        val now = Instant.now()
        return ActivityCalendarEvent(
            id, request.game, title, request.category, request.startDate, request.endDate,
            request.startTime, request.endTime, request.timeZone, request.description, sourceUrl, request.sourceNote, request.enabled,
            current?.createdBy ?: actor, current?.createdAt ?: now, actor, now, current?.version,
            subtype = request.subtype, subtypeDetail = request.subtypeDetail,
        )
    }

    private fun save(event: ActivityCalendarEvent): ActivityCalendarEvent = try {
        repository.save(event)
    } catch (_: OptimisticLockingFailureException) {
        throw calendarConflict()
    }

    private fun requireGame(game: String) {
        if (game !in SubAccountService.SUPPORTED_GAMES) throw calendarInvalid("游戏只支持代号鸢或如鸢", "game")
    }

    fun adminItem(event: ActivityCalendarEvent) = ActivityCalendarAdminItem(
        ActivityCalendarItem(
            event.id, ActivityCalendarSourceType.MANUAL, null, event.game, event.title, event.category,
            event.startDate, event.endDate, event.startTime, event.endTime, event.timeZone, event.description, event.sourceUrl,
            subtype = event.subtype, subtypeDetail = event.subtypeDetail,
        ),
        false, event.enabled, event.version, event.sourceNote, event.createdBy, event.createdAt, event.updatedBy, event.updatedAt,
    )
}
