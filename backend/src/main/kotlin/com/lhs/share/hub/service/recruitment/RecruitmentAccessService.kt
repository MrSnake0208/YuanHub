package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessGrantResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessMeResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentAccessUserCandidateResponse
import com.lhs.share.hub.repository.RecruitmentAccessConfigRepository
import com.lhs.share.hub.repository.RecruitmentAccessGrantRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminAuditSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentAccessConfig
import com.lhs.share.hub.repository.entity.RecruitmentAccessGrant
import com.lhs.share.hub.repository.entity.RecruitmentAccessMode
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.service.UserService
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.regex.Pattern

@Service
class RecruitmentAccessService(
    private val configRepository: RecruitmentAccessConfigRepository,
    private val grantRepository: RecruitmentAccessGrantRepository,
    private val users: UserService,
    private val authorization: AdminAuthorizationService,
    private val audit: AdminAuditService,
) {
    private fun config(): RecruitmentAccessConfig = configRepository.findById(CONFIG_ID).orElse(RecruitmentAccessConfig())

    fun me(userId: String): RecruitmentAccessMeResponse {
        requireActiveUser(userId)
        val current = config()
        val granted = grantRepository.existsById(userId)
        return RecruitmentAccessMeResponse(
            accessMode = current.accessMode,
            granted = granted,
            canAccess = current.accessMode == RecruitmentAccessMode.PUBLIC || granted,
        )
    }

    fun canAccess(userId: String): Boolean {
        if (users.get(userId)?.activated != true) return false
        val current = config()
        return current.accessMode == RecruitmentAccessMode.PUBLIC || grantRepository.existsById(userId)
    }

    fun requireAccess(userId: String) {
        requireActiveUser(userId)
        if (!canAccess(userId)) {
            throw RecruitmentApiException(
                HttpStatus.FORBIDDEN,
                "recruitment_access_required",
                "招募档案当前为有限访问，仅对已授权测试账号开放。",
            )
        }
    }

    fun admin(actor: String): RecruitmentAccessAdminResponse {
        requireManage(actor)
        return adminResponse(config())
    }

    fun setMode(actor: String, mode: RecruitmentAccessMode, expectedVersion: Long): RecruitmentAccessAdminResponse {
        requireManage(actor)
        if (expectedVersion < 0) invalid("expected_version 必须是非负整数")
        val before = configRepository.findById(CONFIG_ID).orElse(null)
        val currentVersion = before?.version?.plus(1) ?: 0L
        if (expectedVersion != currentVersion) conflict()
        val now = Instant.now()
        val next = (before ?: RecruitmentAccessConfig()).copy(accessMode = mode, updatedBy = actor, updatedAt = now)
        val saved = try {
            configRepository.save(next)
        } catch (_: OptimisticLockingFailureException) {
            conflict()
        } catch (_: DuplicateKeyException) {
            conflict()
        }
        audit.record(
            AdminAuditLog(
                actorUserId = actor,
                action = AdminAuditAction.RECRUITMENT_ACCESS_MODE_UPDATED,
                targetResource = "recruitment_access_config/$CONFIG_ID",
                before = AdminAuditSnapshot(
                    recruitmentAccess = mapOf(
                        "access_mode" to (before?.accessMode ?: RecruitmentAccessMode.LIMITED).name,
                    ),
                ),
                after = AdminAuditSnapshot(recruitmentAccess = mapOf("access_mode" to saved.accessMode.name)),
                occurredAt = now,
            ),
        )
        return adminResponse(saved)
    }

    fun searchCandidates(actor: String, query: String, page: Int, size: Int): List<RecruitmentAccessUserCandidateResponse> {
        requireManage(actor)
        val normalized = query.trim()
        if (normalized.isEmpty()) invalid("搜索关键词不能为空")
        if (page < 1) invalid("page 必须大于等于 1")
        if (size !in 1..10) invalid("size 必须在 1..10 之间")
        if (page == 1 && normalized.contains('@')) {
            users.findFeedbackAccessUserByEmail(normalized)?.let { return listOf(RecruitmentAccessUserCandidateResponse(it)) }
        }
        return users.searchFeedbackAccessUsers(Pattern.quote(normalized), PageRequest.of(page - 1, size))
            .content
            .map(::RecruitmentAccessUserCandidateResponse)
    }

    fun grant(actor: String, userId: String): RecruitmentAccessGrantResponse {
        requireManage(actor)
        val user = users.get(userId) ?: throw RecruitmentApiException(HttpStatus.NOT_FOUND, "recruitment_user_not_found", "用户不存在")
        if (!user.activated) invalid("只能为已激活用户开放招募档案")
        val existing = grantRepository.findById(userId).orElse(null)
        if (existing != null) return grantResponse(existing)
        val now = Instant.now()
        val saved = try {
            grantRepository.save(RecruitmentAccessGrant(userId = userId, grantedBy = actor, grantedAt = now))
        } catch (_: DuplicateKeyException) {
            grantRepository.findById(userId).orElseThrow { conflict() }
        }
        audit.record(
            AdminAuditLog(
                actorUserId = actor,
                action = AdminAuditAction.RECRUITMENT_ACCESS_GRANTED,
                targetUserId = userId,
                targetResource = "recruitment_access_grants/$userId",
                after = AdminAuditSnapshot(recruitmentAccess = mapOf("granted" to "true")),
                occurredAt = now,
            ),
        )
        return grantResponse(saved)
    }

    fun revoke(actor: String, userId: String) {
        requireManage(actor)
        if (!grantRepository.existsById(userId)) return
        grantRepository.deleteById(userId)
        audit.record(
            AdminAuditLog(
                actorUserId = actor,
                action = AdminAuditAction.RECRUITMENT_ACCESS_REVOKED,
                targetUserId = userId,
                targetResource = "recruitment_access_grants/$userId",
                before = AdminAuditSnapshot(recruitmentAccess = mapOf("granted" to "true")),
                after = AdminAuditSnapshot(recruitmentAccess = mapOf("granted" to "false")),
            ),
        )
    }

    private fun adminResponse(config: RecruitmentAccessConfig): RecruitmentAccessAdminResponse = RecruitmentAccessAdminResponse(
        accessMode = config.accessMode,
        version = config.version?.plus(1) ?: 0L,
        grants = grantRepository.findAll()
            .map(::grantResponse)
            .sortedWith(compareBy({ it.userName }, { it.userId })),
    )

    private fun grantResponse(grant: RecruitmentAccessGrant): RecruitmentAccessGrantResponse {
        val user = users.get(grant.userId)
        return RecruitmentAccessGrantResponse(
            userId = grant.userId,
            userName = user?.userName ?: "未知用户",
            activated = user?.activated == true,
            grantedBy = grant.grantedBy,
            grantedAt = grant.grantedAt,
        )
    }

    private fun requireActiveUser(userId: String) {
        if (users.get(userId)?.activated != true) {
            throw RecruitmentApiException(HttpStatus.UNAUTHORIZED, "recruitment_account_unavailable", "账号不可用，请重新登录或联系管理员。")
        }
    }

    private fun requireManage(actor: String) {
        if (!authorization.hasPermission(actor, AdminPermission.RECRUITMENT_ACCESS_MANAGE)) {
            throw RecruitmentApiException(HttpStatus.FORBIDDEN, "forbidden", "需要招募档案访问管理权限")
        }
    }

    private fun invalid(message: String): Nothing =
        throw RecruitmentApiException(HttpStatus.BAD_REQUEST, "recruitment_access_invalid", message)

    private fun conflict(): Nothing =
        throw RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_access_conflict", "招募档案访问配置已变化，请刷新后重试")

    private companion object {
        const val CONFIG_ID = "recruitment"
    }
}
