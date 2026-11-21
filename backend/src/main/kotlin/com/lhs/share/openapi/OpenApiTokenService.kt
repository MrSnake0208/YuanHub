package com.lhs.share.openapi

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/**
 * 第三方 API Token 服务
 *
 * 连接凭证按摘要查询 Mongo，每次鉴权读取当前权限和归属。
 */
@Service
class OpenApiTokenService(
    private val tokenRepository: OpenApiTokenRepository,
    private val accountRepository: SubAccountRepository,
    private val cipher: OpenApiTokenCipher,
    private val beta: BetaService,
) {
    /**
     * 生成绑定统一子账号的第三方 API Token(每账号上限 [MAX_TOKENS_PER_ACCOUNT] 个)。
     * 子账号由库存、密探共用;可访问的域完全由 scopes 决定(可混合 inventory:* 与 operator:*)。
     */
    fun generate(userId: String, accountId: String, scopes: List<String>, remark: String?): OpenApiTokenCreatedResponse {
        val permissions = parseScopes(scopes)
        beta.requireAccess(userId)
        val accountName = accountRepository.findByUserIdAndAccountId(userId, accountId)?.name
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "子账号不存在")
        if (tokenRepository.countByUserIdAndAccountId(userId, accountId) >= MAX_TOKENS_PER_ACCOUNT) {
            throw ApiResultException(
                HttpStatus.TOO_MANY_REQUESTS.value(),
                "该子账号的第三方API Token已达上限（最多${MAX_TOKENS_PER_ACCOUNT}个）",
            )
        }

        val scopeCodes = permissions.map { it.code }
        val publicScopes = permissions.map { it.key }
        val tokenId = UUID.randomUUID().toString()
        val token = UUID.randomUUID().toString().replace("-", "")
        val now = Instant.now()

        tokenRepository.save(
            OpenApiToken(
                id = tokenId,
                userId = userId,
                accountId = accountId,
                token = OpenApiTokenCipher.digest(token),
                encryptedSecret = cipher.encrypt(token, tokenId, userId),
                scope = scopeCodes,
                remark = remark,
                createTime = now,
            ),
        )

        return OpenApiTokenCreatedResponse(
            tokenId = tokenId,
            token = token,
            accountId = accountId,
            accountName = accountName,
            remark = remark,
            scopes = publicScopes,
            createdAt = now,
        )
    }

    /**
     * 校验 token 与权限,返回归属 userId 和 accountId。
     * token 空 → 401;Mongo 无对应凭据 → 401;scope 不含任何必需权限 → 403。
     * 需要多个权限之一时用 [validateAnyAuthorization](如今日待办读取:operator:read 或 operator:daily-tasks:write)。
     */
    fun validateAuthorization(authorization: String?, permission: OpenApiPermission): OpenApiPrincipal =
        validate(bearerToken(authorization), setOf(permission.code))

    /**
     * 校验 token 是否具备 [permissions] 中的**任意一个**权限。
     *
     * 用于「同一份数据允许两种最小权限之一访问」的场景:今日待办读取既接受
     * operator:read,也接受 operator:daily-tasks:write —— 只想在手机小组件上
     * 看今日历练的用户,不必为此额外授予能读取全部密探数据的 operator:read。
     */
    fun validateAnyAuthorization(authorization: String?, vararg permissions: OpenApiPermission): OpenApiPrincipal =
        validate(bearerToken(authorization), permissions.map { it.code }.toSet())

    fun authenticateAuthorization(authorization: String?): OpenApiPrincipal = validate(bearerToken(authorization), emptySet())

    private fun bearerToken(authorization: String?): String? = authorization
        ?.takeIf { it.startsWith(BEARER_PREFIX) }
        ?.removePrefix(BEARER_PREFIX)
        ?.trim()

    private fun validate(token: String?, requiredCodes: Set<Int>): OpenApiPrincipal {
        if (token.isNullOrBlank()) {
            throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")
        }
        val entity = findCredential(token)
            ?: throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is invalid")
        if (requiredCodes.isNotEmpty() && requiredCodes.none { entity.scope.contains(it) }) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")
        }
        beta.requireAccess(entity.userId)
        return OpenApiPrincipal(entity.userId, entity.accountId)
    }

    /**
     * 删除 token(校验归属,越权抛 403)
     */
    fun delete(userId: String, tokenId: String) {
        tokenRepository.findByIdAndUserId(tokenId, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")
        tokenRepository.deleteById(tokenId)
    }

    /**
     * 完整替换 token 权限。Token 明文及除 scope 外的持久化字段保持不变。
     */
    fun updateScopes(userId: String, tokenId: String, scopes: List<String>): OpenApiTokenListItemDto {
        beta.requireAccess(userId)
        val permissions = parseScopes(scopes)
        val entity = tokenRepository.findByIdAndUserId(tokenId, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")
        val accountName = accountRepository.findByUserIdAndAccountId(userId, entity.accountId)?.name
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "子账号不存在")
        val updated = entity.copy(scope = permissions.map { it.code })

        // A scope edit must never resurrect a revoked token or overwrite concurrently migrated ciphertext.
        if (tokenRepository.updateOwnedScopes(tokenId, userId, updated.scope) == 0L &&
            tokenRepository.findByIdAndUserId(tokenId, userId) == null
        ) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")
        }

        return updated.toListItemDto(accountName)
    }

    /**
     * 列出当前用户的 token(按创建时间倒序)
     */
    fun list(userId: String): List<OpenApiTokenListItemDto> = tokenRepository.findByUserIdOrderByCreateTimeDesc(userId).map { token ->
        // 历史脏数据可能残留指向已不存在子账号的 token(如旧版按 kind 撤销的遗漏、统一子账号迁移
        // 未校验 token 引用)。这类 token 无法解析账号名,但保留在列表里让用户仍可看到并删除,
        // 而不是让一条脏数据把整个用户的列表打成 500。
        val accountName = accountRepository.findByUserIdAndAccountId(userId, token.accountId)?.name ?: DELETED_ACCOUNT_NAME
        OpenApiTokenListItemDto(
            tokenId = checkNotNull(token.id) { "Token document has no id" },
            accountId = token.accountId,
            accountName = accountName,
            remark = token.remark,
            scopes = token.scope
                .mapNotNull { code -> OpenApiPermission.entries.firstOrNull { permission -> permission.code == code } }
                .map { permission -> permission.key },
            createdAt = token.createTime,
        )
    }

    fun accountIdForToken(userId: String, tokenId: String): String = tokenRepository.findByIdAndUserId(tokenId, userId)?.accountId
        ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")

    /** Called only after the existing scope validation; cache is not provenance. */
    fun connectionIdForAuthorization(authorization: String?, principal: OpenApiPrincipal): String {
        val secret = authorization?.removePrefix(BEARER_PREFIX)?.trim()
        val entity = secret?.let(::findCredential)
        if (entity == null || entity.userId != principal.userId || entity.accountId != principal.accountId) {
            throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is invalid")
        }
        return checkNotNull(entity.id)
    }

    fun secret(userId: String, tokenId: String): String {
        val entity = tokenRepository.findByIdAndUserId(tokenId, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")
        if (!entity.token.startsWith("sha256:")) return entity.token
        val secret = cipher.decrypt(checkNotNull(entity.encryptedSecret), tokenId, userId)
        check(OpenApiTokenCipher.digest(secret) == entity.token) { "Connection code digest mismatch" }
        return secret
    }

    fun revokeByAccount(userId: String, accountId: String) = tokenRepository.deleteAllByUserIdAndAccountId(userId, accountId)

    private fun findCredential(secret: String): OpenApiToken? {
        if (secret.startsWith("sha256:")) return null
        val hash = OpenApiTokenCipher.digest(secret)
        // Migrated tokens send only the digest to Mongo. Recheck both forms on a miss during backfill.
        return tokenRepository.findByToken(hash) ?: tokenRepository.findFirstByTokenIn(listOf(hash, secret))
    }

    private fun parseScopes(scopes: List<String>): List<OpenApiPermission> {
        if (scopes.isEmpty()) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "scopes 不能为空")
        val permissions = scopes.map { scope ->
            OpenApiPermission.byKey(scope) ?: throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "未知 scope: $scope")
        }
        if (permissions.distinct().size != permissions.size) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "scopes 不得重复")
        }
        return permissions
    }

    private fun OpenApiToken.toListItemDto(accountName: String) = OpenApiTokenListItemDto(
        tokenId = checkNotNull(id) { "Token document has no id" },
        accountId = accountId,
        accountName = accountName,
        remark = remark,
        scopes = scope
            .mapNotNull { code -> OpenApiPermission.entries.firstOrNull { permission -> permission.code == code } }
            .map { permission -> permission.key },
        createdAt = createTime,
    )

    companion object {
        private const val BEARER_PREFIX = "Bearer "
        private const val MAX_TOKENS_PER_ACCOUNT = 5
        private const val DELETED_ACCOUNT_NAME = "已删除账号"
    }
}

data class OpenApiTokenCreatedResponse(
    val tokenId: String,
    val token: String,
    val accountId: String,
    val accountName: String,
    val remark: String?,
    val scopes: List<String>,
    val createdAt: Instant,
)

data class OpenApiTokenListItemDto(
    val tokenId: String,
    val accountId: String,
    val accountName: String,
    val remark: String?,
    val scopes: List<String>,
    val createdAt: Instant,
)

data class OpenApiPrincipal(
    val userId: String,
    val accountId: String,
)
