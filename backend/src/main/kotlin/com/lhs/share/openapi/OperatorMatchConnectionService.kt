package com.lhs.share.openapi

import com.lhs.share.hub.repository.OperatorMatchConnectionRepository
import com.lhs.share.hub.repository.entity.OperatorMatchConnection
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

@Service
class OperatorMatchConnectionService(
    private val repository: OperatorMatchConnectionRepository,
    private val beta: BetaService,
) {
    fun create(userId: String): OperatorMatchSecret {
        beta.requireAccess(userId)
        val existing = repository.findFirstByUserIdOrderByCreatedAtAscIdAsc(userId)
        if (existing != null) return OperatorMatchSecret(existing.id, existing.token)
        // Stable per-user ID makes concurrent creation converge through MongoDB's unique _id.
        val connection = try {
            repository.insert(
                OperatorMatchConnection("operator-match:$userId", userId, "ymatch_" + UUID.randomUUID().toString().replace("-", "")),
            )
        } catch (error: DuplicateKeyException) {
            repository.findFirstByUserIdOrderByCreatedAtAscIdAsc(userId) ?: throw error
        }
        return OperatorMatchSecret(connection.id, connection.token)
    }

    fun list(userId: String): List<OperatorMatchConnectionInfo> =
        listOfNotNull(repository.findFirstByUserIdOrderByCreatedAtAscIdAsc(userId))
            .map { OperatorMatchConnectionInfo(it.id, it.createdAt) }

    fun secret(userId: String, id: String): OperatorMatchSecret = owned(userId, id).let { OperatorMatchSecret(it.id, it.token) }

    fun revoke(userId: String, id: String) {
        owned(userId, id)
        // Remove legacy duplicates too, so stopping the retained code cannot reactivate a newer code.
        repository.deleteAllByUserId(userId)
    }

    fun authenticate(authorization: String?): OperatorMatchConnection {
        val token = authorization?.takeIf { it.startsWith("Bearer ", ignoreCase = true) }?.substring(7)?.trim()
        if (token == null || !token.matches(Regex("ymatch_[a-f0-9]{32}"))) unauthorized()
        val connection = repository.findByToken(token) ?: unauthorized()
        if (repository.findFirstByUserIdOrderByCreatedAtAscIdAsc(connection.userId)?.id != connection.id) unauthorized()
        beta.requireAccess(connection.userId)
        return connection
    }

    private fun owned(userId: String, id: String) = repository.findFirstByUserIdOrderByCreatedAtAscIdAsc(userId)?.takeIf { it.id == id }
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "connection_not_found", "连接不存在")

    private fun unauthorized(): Nothing = throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "作业匹配连接码无效或已停止")
}

data class OperatorMatchConnectionInfo(val connectionId: String, val createdAt: Instant)
data class OperatorMatchSecret(val connectionId: String, val token: String)
