package com.lhs.share.hub.service.admin

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.admin.response.AdminAuditLogResponse
import com.lhs.share.hub.repository.AdminAuditLogRepository
import com.lhs.share.hub.repository.entity.AdminAuditLog
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class AdminAuditService(
    private val repository: AdminAuditLogRepository,
    private val authorizationService: AdminAuthorizationService,
) {
    fun record(log: AdminAuditLog): AdminAuditLog = repository.save(log)

    fun list(actorUserId: String, page: Int, size: Int): PagedDTO<AdminAuditLogResponse> {
        authorizationService.requirePermission(actorUserId, AdminPermission.ADMIN_AUDIT_READ)
        if (page < 1) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "page 必须大于等于 1")
        if (size !in 1..100) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "size 必须在 1..100 之间")
        val result = repository.findAll(
            PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "occurredAt")),
        ).map(::AdminAuditLogResponse)
        return PagedDTO(
            hasNext = result.hasNext(),
            page = result.pageable.pageNumber + 1,
            total = result.totalElements,
            data = result.content,
        )
    }
}
