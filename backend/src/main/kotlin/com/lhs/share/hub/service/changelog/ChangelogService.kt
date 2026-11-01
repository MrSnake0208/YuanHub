package com.lhs.share.hub.service.changelog

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.hub.controller.changelog.request.ChangelogCreateRequest
import com.lhs.share.hub.controller.changelog.request.ChangelogDraftRequest
import com.lhs.share.hub.controller.changelog.response.ChangelogAdminResponse
import com.lhs.share.hub.controller.changelog.response.ChangelogPublicResponse
import com.lhs.share.hub.repository.ChangelogEntryRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.ChangelogEntry
import com.lhs.share.hub.repository.entity.ChangelogPublishedRevision
import com.lhs.share.hub.repository.entity.ChangelogRevisionState
import com.lhs.share.hub.repository.entity.ChangelogWorkingRevision
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Service
class ChangelogService(
    private val repository: ChangelogEntryRepository,
    private val validator: ChangelogContentValidator,
    private val authorizationService: AdminAuthorizationService,
    private val auditService: AdminAuditService,
) {
    fun publicEntries(page: Int, size: Int): PagedDTO<ChangelogPublicResponse> {
        validatePage(page, size)
        val result = repository.findByPublishedRevisionIsNotNullAndWithdrawnAtIsNull(
            PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "publishedRevision.publishedAt")),
        ).map(ChangelogPublicResponse::of)
        return PagedDTO(result.hasNext(), page, result.totalElements, result.content)
    }

    fun adminEntries(actorUserId: String, page: Int, size: Int): PagedDTO<ChangelogAdminResponse> {
        requireAny(actorUserId)
        validatePage(page, size)
        val result = repository.findAll(PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "updatedAt")))
            .map(ChangelogAdminResponse::of)
        return PagedDTO(result.hasNext(), page, result.totalElements, result.content)
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun create(actorUserId: String, request: ChangelogCreateRequest): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_WRITE)
        val content = content(request.body, actorUserId, emptySet())
        val now = Instant.now()
        val entry = ChangelogEntry(
            id = "chg_${UUID.randomUUID().toString().replace("-", "")}",
            createdBy = actorUserId,
            createdAt = now,
            updatedBy = actorUserId,
            updatedAt = now,
            workingRevision = ChangelogWorkingRevision(
                revision = 1,
                state = ChangelogRevisionState.DRAFT,
                title = normalize(request.title, "title", 120),
                versionLabel = normalize(request.versionLabel, "version_label", 40),
                body = content.body,
                mediaIds = content.mediaIds,
                authoredBy = actorUserId,
                updatedBy = actorUserId,
                updatedAt = now,
            ),
        )
        return ChangelogAdminResponse.of(save(entry))
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun saveDraft(actorUserId: String, id: String, request: ChangelogDraftRequest): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_WRITE)
        val entry = find(id)
        checkVersion(entry, request.expectedVersion)
        if (entry.workingRevision?.state == ChangelogRevisionState.IN_REVIEW) conflict("review_in_progress", "待审核内容不能编辑")
        val retained = entry.workingRevision?.mediaIds.orEmpty() + entry.publishedRevision?.mediaIds.orEmpty()
        val content = content(request.body, actorUserId, retained)
        val now = Instant.now()
        val previous = entry.workingRevision
        val working = ChangelogWorkingRevision(
            revision = previous?.revision ?: ((entry.publishedRevision?.revision ?: 0) + 1),
            state = ChangelogRevisionState.DRAFT,
            title = normalize(request.title, "title", 120),
            versionLabel = normalize(request.versionLabel, "version_label", 40),
            body = content.body,
            mediaIds = content.mediaIds,
            authoredBy = previous?.authoredBy ?: actorUserId,
            updatedBy = actorUserId,
            updatedAt = now,
            rejectionReason = previous?.rejectionReason,
            rejectedBy = previous?.rejectedBy,
            rejectedAt = previous?.rejectedAt,
        )
        return ChangelogAdminResponse.of(save(entry.copy(workingRevision = working, updatedBy = actorUserId, updatedAt = now)))
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun submit(actorUserId: String, id: String, expectedVersion: Long?): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_WRITE)
        val entry = find(id)
        checkVersion(entry, expectedVersion)
        val working = entry.workingRevision ?: conflict("draft_required", "没有可提交的草稿")
        if (working.state != ChangelogRevisionState.DRAFT) conflict("invalid_state", "当前内容已经在审核中")
        val now = Instant.now()
        return ChangelogAdminResponse.of(
            save(
                entry.copy(
                    workingRevision = working.copy(
                        state = ChangelogRevisionState.IN_REVIEW,
                        submittedBy = actorUserId,
                        submittedAt = now,
                    ),
                    updatedBy = actorUserId,
                    updatedAt = now,
                ),
            ),
        )
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun approve(actorUserId: String, id: String, expectedVersion: Long?): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_REVIEW)
        val entry = find(id)
        checkVersion(entry, expectedVersion)
        val working = reviewable(entry, actorUserId)
        val now = Instant.now()
        val saved = save(
            entry.copy(
                publishedRevision = ChangelogPublishedRevision(
                    working.revision,
                    working.title,
                    working.versionLabel,
                    working.body,
                    working.mediaIds,
                    working.authoredBy,
                    checkNotNull(working.submittedBy),
                    checkNotNull(working.submittedAt),
                    actorUserId,
                    now,
                ),
                workingRevision = null,
                withdrawnAt = null,
                withdrawnBy = null,
                updatedBy = actorUserId,
                updatedAt = now,
            ),
        )
        audit(actorUserId, AdminAuditAction.CHANGELOG_PUBLISHED, id)
        return ChangelogAdminResponse.of(saved)
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun reject(actorUserId: String, id: String, expectedVersion: Long?, reason: String): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_REVIEW)
        val entry = find(id)
        checkVersion(entry, expectedVersion)
        val working = reviewable(entry, actorUserId)
        val normalizedReason = normalize(reason, "reason", 500)
        val now = Instant.now()
        val saved = save(
            entry.copy(
                workingRevision = working.copy(
                    state = ChangelogRevisionState.DRAFT,
                    rejectionReason = normalizedReason,
                    rejectedBy = actorUserId,
                    rejectedAt = now,
                ),
                updatedBy = actorUserId,
                updatedAt = now,
            ),
        )
        audit(actorUserId, AdminAuditAction.CHANGELOG_REJECTED, id)
        return ChangelogAdminResponse.of(saved)
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun withdraw(actorUserId: String, id: String, expectedVersion: Long?): ChangelogAdminResponse {
        requirePermission(actorUserId, AdminPermission.CHANGELOG_REVIEW)
        val entry = find(id)
        checkVersion(entry, expectedVersion)
        if (entry.publishedRevision == null || entry.withdrawnAt != null) {
            conflict("not_published", "当前条目没有可撤回的公开版本")
        }
        val now = Instant.now()
        val saved = save(entry.copy(withdrawnAt = now, withdrawnBy = actorUserId, updatedBy = actorUserId, updatedAt = now))
        audit(actorUserId, AdminAuditAction.CHANGELOG_WITHDRAWN, id)
        return ChangelogAdminResponse.of(saved)
    }

    private fun reviewable(entry: ChangelogEntry, actorUserId: String): ChangelogWorkingRevision {
        val working = entry.workingRevision ?: conflict("review_required", "没有待审核内容")
        if (working.state != ChangelogRevisionState.IN_REVIEW) conflict("review_required", "没有待审核内容")
        if (working.authoredBy == actorUserId) {
            throw ChangelogApiException(HttpStatus.FORBIDDEN, "self_review_forbidden", "作者不能审核自己的内容")
        }
        return working
    }

    private fun content(body: JsonNode, actorUserId: String, retained: Set<String>) = validator.validate(body, actorUserId, retained)

    private fun find(id: String): ChangelogEntry = repository.findById(id).orElseThrow {
        ChangelogApiException(HttpStatus.NOT_FOUND, "changelog_not_found", "更新日志不存在")
    }

    private fun save(entry: ChangelogEntry): ChangelogEntry = try {
        repository.save(entry)
    } catch (_: OptimisticLockingFailureException) {
        conflict("version_conflict", "内容已被其他人修改，请刷新后重试")
    }

    private fun checkVersion(entry: ChangelogEntry, expectedVersion: Long?) {
        if (expectedVersion == null || expectedVersion < 0) invalid("expected_version", "expected_version 必须是非负整数")
        if (expectedVersion != (entry.version ?: 0)) conflict("version_conflict", "内容已被其他人修改，请刷新后重试")
    }

    private fun normalize(value: String, field: String, max: Int): String {
        val normalized = value.trim()
        if (normalized.isEmpty() || normalized.length > max) invalid(field, "$field 长度必须在 1..$max 之间")
        return normalized
    }

    private fun validatePage(page: Int, size: Int) {
        if (page < 1) invalid("page", "page 必须大于等于 1")
        if (size !in 1..100) invalid("size", "size 必须在 1..100 之间")
    }

    private fun requireAny(userId: String) {
        if (!authorizationService.hasPermission(userId, AdminPermission.CHANGELOG_WRITE) &&
            !authorizationService.hasPermission(userId, AdminPermission.CHANGELOG_REVIEW)
        ) {
            throw ChangelogApiException(HttpStatus.FORBIDDEN, "forbidden", "没有更新日志管理权限")
        }
    }

    private fun requirePermission(userId: String, permission: AdminPermission) {
        if (!authorizationService.hasPermission(userId, permission)) {
            throw ChangelogApiException(HttpStatus.FORBIDDEN, "forbidden", "没有更新日志管理权限")
        }
    }

    private fun audit(actorUserId: String, action: AdminAuditAction, id: String) {
        auditService.record(AdminAuditLog(actorUserId = actorUserId, action = action, targetResource = id))
    }

    private fun invalid(field: String, message: String): Nothing = throw ChangelogApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "schema_validation_failed",
        message,
        field,
    )

    private fun conflict(code: String, message: String): Nothing = throw ChangelogApiException(HttpStatus.CONFLICT, code, message)
}
