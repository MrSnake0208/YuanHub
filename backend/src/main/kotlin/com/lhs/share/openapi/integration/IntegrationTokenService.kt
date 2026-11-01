package com.lhs.share.openapi.integration

import com.lhs.share.hub.repository.IntegrationTokenRepository
import com.lhs.share.hub.repository.entity.IntegrationToken
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.report.FeedbackCategoryService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID

@Service
class IntegrationTokenService(
    private val repository: IntegrationTokenRepository,
    private val authorization: AdminAuthorizationService,
    private val feedbackCategories: FeedbackCategoryService,
) {
    private val secureRandom = SecureRandom()

    fun create(
        ownerUserId: String,
        name: String,
        scopes: List<String>,
        feedbackAreas: Set<String>?,
        expiresAt: Instant?,
    ): IntegrationTokenCreatedResponse {
        requireAdminCapability(ownerUserId)
        val normalizedName = name.trim().takeIf { it.isNotEmpty() }
            ?: throw badRequest("invalid_name", "name 不能为空")
        if (normalizedName.length > MAX_NAME_LENGTH) {
            throw badRequest("invalid_name", "name 最长 $MAX_NAME_LENGTH 个字符")
        }
        val parsedScopes = parseScopes(scopes)
        val normalizedAreas = normalizeAreas(feedbackAreas)
        val now = Instant.now()
        if (expiresAt != null && !expiresAt.isAfter(now)) {
            throw badRequest("invalid_expiry", "expires_at 必须晚于当前时间")
        }

        val secret = generateSecret()
        val entity = IntegrationToken(
            id = "int_${UUID.randomUUID().toString().replace("-", "")}",
            ownerUserId = ownerUserId,
            name = normalizedName,
            tokenHash = digest(secret),
            scopes = parsedScopes.mapTo(linkedSetOf()) { it.key },
            feedbackAreas = normalizedAreas,
            enabled = true,
            createdAt = now,
            expiresAt = expiresAt,
        )
        val saved = repository.save(entity)
        return saved.toCreatedResponse(secret)
    }

    fun list(ownerUserId: String): List<IntegrationTokenListItemResponse> {
        return repository.findByOwnerUserIdOrderByCreatedAtDesc(ownerUserId).map { it.toListItemResponse() }
    }

    fun revoke(ownerUserId: String, tokenId: String): IntegrationTokenListItemResponse {
        val current = repository.findByIdAndOwnerUserId(tokenId, ownerUserId)
            ?: throw IntegrationApiException(HttpStatus.NOT_FOUND, "integration_token_not_found", "integration token 不存在")
        if (current.revokedAt != null || !current.enabled) return current.toListItemResponse()
        val revoked = repository.save(current.copy(enabled = false, revokedAt = Instant.now()))
        return revoked.toListItemResponse()
    }

    fun validateAuthorization(authorizationHeader: String?, requiredScope: IntegrationScope): IntegrationPrincipal {
        val secret = authorizationHeader
            ?.takeIf { it.startsWith(BEARER_PREFIX) }
            ?.removePrefix(BEARER_PREFIX)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: throw unauthorized("integration_token_missing", "Integration token is missing")

        val entity = repository.findByTokenHash(digest(secret))
            ?: throw unauthorized("integration_token_invalid", "Integration token is invalid")
        val now = Instant.now()
        if (!entity.enabled || entity.revokedAt != null) {
            throw unauthorized("integration_token_revoked", "Integration token has been revoked")
        }
        if (entity.expiresAt?.let { !it.isAfter(now) } == true) {
            throw unauthorized("integration_token_expired", "Integration token has expired")
        }
        if (requiredScope.key !in entity.scopes) {
            throw IntegrationApiException(
                HttpStatus.FORBIDDEN,
                "integration_scope_missing",
                "Integration token lacks ${requiredScope.key}",
            )
        }
        if (!authorization.hasAnyAdminCapability(entity.ownerUserId)) {
            throw IntegrationApiException(
                HttpStatus.FORBIDDEN,
                "integration_owner_forbidden",
                "Integration token owner no longer has admin capability",
            )
        }
        runCatching { repository.touchLastUsedAt(entity.id, now) }
        return IntegrationPrincipal(
            tokenId = entity.id,
            ownerUserId = entity.ownerUserId,
            name = entity.name,
            scopes = entity.scopes,
            feedbackAreas = entity.feedbackAreas,
        )
    }

    private fun requireAdminCapability(userId: String) {
        if (!authorization.hasAnyAdminCapability(userId)) {
            throw IntegrationApiException(
                HttpStatus.FORBIDDEN,
                "integration_admin_required",
                "当前账号没有可用于集成的后台权限",
            )
        }
    }

    private fun parseScopes(scopes: List<String>): List<IntegrationScope> {
        if (scopes.isEmpty()) throw badRequest("invalid_scopes", "scopes 不能为空")
        if (scopes.size != scopes.toSet().size) throw badRequest("invalid_scopes", "scopes 不得重复")
        return scopes.map { key ->
            IntegrationScope.byKey(key)
                ?: throw badRequest("invalid_scope", "未知 scope: $key")
        }
    }

    private fun normalizeAreas(feedbackAreas: Set<String>?): Set<String>? {
        if (feedbackAreas == null) return null
        if (feedbackAreas.isEmpty()) throw badRequest("invalid_feedback_areas", "feedback_areas 为空时请省略该字段")
        val normalized = feedbackAreas.mapTo(linkedSetOf()) { it.trim().uppercase() }
        val known = feedbackCategories.keys()
        val unknown = normalized.firstOrNull { it !in known }
        if (unknown != null) throw badRequest("invalid_feedback_area", "未知反馈板块: $unknown")
        return normalized
    }

    private fun generateSecret(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return SECRET_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun digest(secret: String): String = MessageDigest.getInstance("SHA-256")
        .digest(secret.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun IntegrationToken.toCreatedResponse(secret: String) = IntegrationTokenCreatedResponse(
        tokenId = id,
        token = secret,
        name = name,
        scopes = scopes.toSortedSet(),
        feedbackAreas = feedbackAreas,
        createdAt = createdAt,
        expiresAt = expiresAt,
    )

    private fun IntegrationToken.toListItemResponse() = IntegrationTokenListItemResponse(
        tokenId = id,
        name = name,
        scopes = scopes.toSortedSet(),
        feedbackAreas = feedbackAreas,
        enabled = enabled && revokedAt == null,
        createdAt = createdAt,
        expiresAt = expiresAt,
        lastUsedAt = lastUsedAt,
        revokedAt = revokedAt,
    )

    private fun unauthorized(code: String, message: String) = IntegrationApiException(HttpStatus.UNAUTHORIZED, code, message)

    private fun badRequest(code: String, message: String) = IntegrationApiException(HttpStatus.BAD_REQUEST, code, message)

    companion object {
        private const val BEARER_PREFIX = "Bearer "
        private const val SECRET_PREFIX = "yhi_"
        private const val MAX_NAME_LENGTH = 80
    }
}

data class IntegrationPrincipal(
    val tokenId: String,
    val ownerUserId: String,
    val name: String,
    val scopes: Set<String>,
    val feedbackAreas: Set<String>?,
)

data class IntegrationTokenCreatedResponse(
    val tokenId: String,
    val token: String,
    val name: String,
    val scopes: Set<String>,
    val feedbackAreas: Set<String>?,
    val createdAt: Instant,
    val expiresAt: Instant?,
)

data class IntegrationTokenListItemResponse(
    val tokenId: String,
    val name: String,
    val scopes: Set<String>,
    val feedbackAreas: Set<String>?,
    val enabled: Boolean,
    val createdAt: Instant,
    val expiresAt: Instant?,
    val lastUsedAt: Instant?,
    val revokedAt: Instant?,
)
