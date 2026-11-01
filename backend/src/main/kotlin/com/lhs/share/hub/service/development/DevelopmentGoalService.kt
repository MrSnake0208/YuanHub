package com.lhs.share.hub.service.development

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.development.request.DevelopmentGoalRequest
import com.lhs.share.hub.controller.development.response.DevelopmentFeedbackLink
import com.lhs.share.hub.controller.development.response.DevelopmentGoalResponse
import com.lhs.share.hub.repository.DevelopmentGoalRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.DevelopmentGoal
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.report.FeedbackVisibility
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.UUID

@Service
class DevelopmentGoalService(
    private val repository: DevelopmentGoalRepository,
    private val feedbackRepository: FeedbackTicketRepository,
    private val authorization: AdminAuthorizationService,
) {
    private val stages = setOf("PLANNED", "IN_PROGRESS", "COMPLETED", "PAUSED")

    fun list(page: Int, size: Int, stage: String?, adminUserId: String? = null): PagedDTO<DevelopmentGoalResponse> {
        if (adminUserId != null) requireManage(adminUserId)
        if (page < 1 || size !in 1..50) invalid("页码或每页数量无效")
        val filter = stage?.takeIf { it.isNotBlank() }
        if (filter != null && filter !in stages) invalid("开发阶段无效")
        val pageable = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt", "id"))
        val result = if (filter == null) repository.findAll(pageable) else repository.findByStage(filter, pageable)
        val ids = result.content.flatMap { it.feedbackIds }.distinct()
        val links = publicLinks(ids)
        return PagedDTO(result.hasNext(), page, result.totalElements, result.content.map { response(it, links, adminUserId != null) })
    }

    fun create(userId: String, request: DevelopmentGoalRequest): DevelopmentGoalResponse {
        requireManage(userId)
        val now = Instant.now()
        val goal =
            validated(
                request,
                DevelopmentGoal("goal_${UUID.randomUUID()}", "", "", "PLANNED", emptyList(), createdAt = now, updatedAt = now),
            )
        val saved = repository.save(goal)
        return response(saved, publicLinks(saved.feedbackIds), true)
    }

    fun get(userId: String, id: String): DevelopmentGoalResponse {
        requireManage(userId)
        val goal = repository.findById(id).orElseThrow { ApiResultException(404, "开发目标不存在") }
        return response(goal, publicLinks(goal.feedbackIds), true)
    }

    fun update(userId: String, id: String, request: DevelopmentGoalRequest): DevelopmentGoalResponse {
        requireManage(userId)
        val existing = repository.findById(id).orElseThrow { ApiResultException(404, "开发目标不存在") }
        if (request.expectedVersion == null || request.expectedVersion != existing.version) conflict()
        val goal = validated(request, existing)
        val saved = try {
            repository.save(goal)
        } catch (_: OptimisticLockingFailureException) {
            conflict()
        }
        return response(saved, publicLinks(saved.feedbackIds), true)
    }

    private fun validated(request: DevelopmentGoalRequest, existing: DevelopmentGoal): DevelopmentGoal {
        val title = request.title.trim()
        val description = request.description.trim()
        if (title.isEmpty() || title.length > 120 || description.isEmpty() || description.length > 3000) invalid("请填写有效的目标标题和说明")
        if (request.stage !in stages) invalid("开发阶段无效")
        if (request.criteria.size !in 1..20) invalid("请填写 1–20 项验收标准")
        val criteria = request.criteria.map { it.copy(title = it.title.trim()) }
        if (criteria.any { it.title.isEmpty() || it.title.length > 200 }) invalid("验收标准不能为空或超过 200 字")
        if (request.stage == "COMPLETED" && criteria.any { !it.completed }) invalid("全部验收标准通过后才能标记完成")
        if (request.feedbackIds.size > 20) invalid("最多关联 20 条反馈")
        val feedbackIds = request.feedbackIds.map { it.trim() }.distinct()
        if (feedbackIds.any { it.isEmpty() || it.length > 80 }) invalid("关联反馈编号无效")
        // Existing links may have been unpublished since the goal was saved; reads always filter them.
        val newIds = feedbackIds.filter { it !in existing.feedbackIds }
        if (publicLinks(newIds).size != newIds.size) invalid("只能关联仍然公开的反馈")
        val targetVersion = request.targetVersion?.trim()?.takeIf { it.isNotEmpty() }
        if (targetVersion != null && targetVersion.length > 80) invalid("目标版本不能超过 80 字")
        val targetDate = request.targetDate?.trim()?.takeIf { it.isNotEmpty() }
        if (targetDate != null) {
            try {
                LocalDate.parse(targetDate)
            } catch (_: DateTimeParseException) {
                invalid("目标日期格式应为 YYYY-MM-DD")
            }
        }
        return existing.copy(
            title = title,
            description = description,
            stage = request.stage,
            criteria = criteria,
            feedbackIds = feedbackIds,
            targetVersion = targetVersion,
            targetDate = targetDate,
            updatedAt = Instant.now(),
        )
    }

    private fun publicLinks(ids: List<String>): Map<String, DevelopmentFeedbackLink> {
        if (ids.isEmpty()) return emptyMap()
        return feedbackRepository.findAllById(ids)
            .filter { FeedbackVisibility.isPublic(it.visibility) }
            .associate { checkNotNull(it.id) to DevelopmentFeedbackLink(checkNotNull(it.id), it.publicTitle ?: "未命名反馈") }
    }

    private fun response(goal: DevelopmentGoal, links: Map<String, DevelopmentFeedbackLink>, admin: Boolean): DevelopmentGoalResponse =
        DevelopmentGoalResponse(
            goal.id, goal.title, goal.description, goal.stage, goal.criteria,
            goal.feedbackIds.mapNotNull {
                links[it]
            },
            goal.targetVersion, goal.targetDate, goal.updatedAt,
            goal.version ?: 0, if (admin) goal.feedbackIds else null,
        )

    private fun requireManage(userId: String) = authorization.requirePermission(userId, AdminPermission.DEVELOPMENT_GOAL_MANAGE)
    private fun invalid(message: String): Nothing = throw ApiResultException(400, message)
    private fun conflict(): Nothing = throw ApiResultException(409, "目标已被其他管理员修改，请保留当前内容并重新加载后合并修改")
}
