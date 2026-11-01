package com.lhs.share.openapi

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.repository.RedisCache
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/**
 * 第三方 API Token 服务
 *
 * token 热数据存 Redis(不设过期,token 永不过期),持久化落库
 * HubBackend.open_api_token。Redis 丢失时回退 Mongo 校验,保证可用性。
 */
@Service
class OpenApiTokenService(
    private val tokenRepository: OpenApiTokenRepository,
    private val accountRepository: SubAccountRepository,
    private val redisCache: RedisCache,
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

        // 写 Redis(不设过期,token 永不过期)
        redisCache.setCache(
            redisKey(token),
            TokenCacheData(userId = userId, accountId = accountId, scope = scopeCodes, createTime = now.toEpochMilli()),
            0,
        )

        // 落库
        tokenRepository.save(
            OpenApiToken(
                id = tokenId,
                userId = userId,
                accountId = accountId,
                token = token,
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
     * token 空 → 401;Redis 无则回退 Mongo,仍无 → 401;scope 不含任何必需权限 → 403。
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
        val cached = redisCache.getCache(redisKey(token), TokenCacheData::class.java)
        if (cached != null) {
            if (requiredCodes.isNotEmpty() && requiredCodes.none { cached.scope.contains(it) }) {
                throw InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")
            }
            beta.requireAccess(cached.userId)
            return OpenApiPrincipal(cached.userId, cached.accountId)
        }

        // 回退 Mongo(防 Redis 丢失)
        val entity = tokenRepository.findByToken(token)
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
        val entity = tokenRepository.findByIdAndUserId(tokenId, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")
        redisCache.delete(redisKey(entity.token))
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

        // 鉴权优先读无过期 Redis 缓存，因此必须先删除旧权限，再更新持久化权威来源并回填新权限。
        redisCache.delete(redisKey(entity.token))
        tokenRepository.save(updated)
        redisCache.setCache(
            redisKey(entity.token),
            TokenCacheData(
                userId = updated.userId,
                accountId = updated.accountId,
                scope = updated.scope,
                createTime = updated.createTime.toEpochMilli(),
            ),
            0,
        )

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
        val entity = secret?.let(tokenRepository::findByToken)
        if (entity == null || entity.userId != principal.userId || entity.accountId != principal.accountId) {
            throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is invalid")
        }
        return checkNotNull(entity.id)
    }

    fun secret(userId: String, tokenId: String): String = tokenRepository.findByIdAndUserId(tokenId, userId)?.token
        ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "token 不存在")

    fun revokeByAccount(userId: String, accountId: String) {
        tokenRepository.findAllByUserIdAndAccountId(userId, accountId).forEach {
            redisCache.delete(redisKey(it.token))
            tokenRepository.delete(it)
        }
    }

    private fun redisKey(token: String): String = REDIS_KEY_PREFIX + token

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
        private const val REDIS_KEY_PREFIX = "open-api-token:"
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

/**
 * Redis 中缓存的 token 数据
 */
data class TokenCacheData(
    val userId: String,
    val accountId: String,
    val scope: List<Int>,
    val createTime: Long,
)

data class OpenApiPrincipal(
    val userId: String,
    val accountId: String,
)
