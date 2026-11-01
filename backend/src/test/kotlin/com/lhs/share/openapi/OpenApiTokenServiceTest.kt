package com.lhs.share.openapi

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.repository.RedisCache
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.slot
import io.mockk.verify
import io.mockk.verifyOrder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class OpenApiTokenServiceTest {
    private val tokenRepository = mockk<OpenApiTokenRepository>()
    private val accountRepository = mockk<SubAccountRepository>()
    private val redisCache = mockk<RedisCache>(relaxed = true)
    private val service = OpenApiTokenService(tokenRepository, accountRepository, redisCache, mockk(relaxed = true))

    private fun entity(
        id: String = "token-id",
        userId: String = "u1",
        accountId: String = "main",
        token: String = "tok123",
        scope: List<Int> = listOf(10001),
        remark: String? = "note",
    ) = OpenApiToken(
        id = id,
        userId = userId,
        accountId = accountId,
        token = token,
        scope = scope,
        remark = remark,
        createTime = Instant.parse("2023-11-14T22:13:20Z"),
    )

    @Test
    fun `connection provenance comes from owned persistent token and never from cached principal alone`() {
        val secret = java.util.UUID.randomUUID().toString()
        every { tokenRepository.findByToken(secret) } returns entity(token = secret)
        assertEquals("token-id", service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u1", "main")))
        assertThrows(InventoryApiException::class.java) {
            service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u2", "main"))
        }
        assertThrows(InventoryApiException::class.java) {
            service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u1", "alt"))
        }
        every { tokenRepository.findByToken(secret) } returns null
        assertThrows(InventoryApiException::class.java) {
            service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u1", "main"))
        }
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { tokenRepository.findByIdAndUserId("token-id", "u2") } returns null
        assertEquals("main", service.accountIdForToken("u1", "token-id"))
        assertEquals(404, assertThrows(ApiResultException::class.java) { service.accountIdForToken("u2", "token-id") }.statusCode)
    }

    @Test
    fun `generation maps public scopes and returns the full token once`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.countByUserIdAndAccountId("u1", "main") } returns 0
        val saved = slot<OpenApiToken>()
        every { tokenRepository.save(capture(saved)) } answers { saved.captured }

        val response = service.generate("u1", "main", listOf("inventory:read", "inventory:write"), "script")

        assertEquals(32, response.token.length)
        assertEquals(listOf("inventory:read", "inventory:write"), response.scopes)
        assertEquals(listOf(10001, 10002), saved.captured.scope)
        assertEquals("main", saved.captured.accountId)
        assertEquals("大号", response.accountName)
        assertEquals(response.tokenId, saved.captured.id)
        assertEquals(null, saved.captured.kind)
        verify { redisCache.setCache("open-api-token:${response.token}", any<TokenCacheData>(), 0) }
    }

    @Test
    fun `generation allows mixed inventory and operator scopes on one token`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.countByUserIdAndAccountId("u1", "main") } returns 0
        val saved = slot<OpenApiToken>()
        every { tokenRepository.save(capture(saved)) } answers { saved.captured }

        val response = service.generate(
            "u1",
            "main",
            listOf("inventory:read", "inventory:write", "operator:read", "operator:export"),
            "mixed",
        )

        assertEquals(
            listOf("inventory:read", "inventory:write", "operator:read", "operator:export"),
            response.scopes,
        )
        assertEquals(listOf(10001, 10002, 20001, 20003), saved.captured.scope)
        assertEquals("main", saved.captured.accountId)
    }

    @Test
    fun `unknown public scope is rejected`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.countByUserIdAndAccountId("u1", "main") } returns 0
        val error = assertThrows(ApiResultException::class.java) {
            service.generate("u1", "main", listOf("inventory:admin"), null)
        }
        assertEquals(400, error.statusCode)
    }

    @Test
    fun `duplicate scopes are rejected`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.countByUserIdAndAccountId("u1", "main") } returns 0
        val error = assertThrows(ApiResultException::class.java) {
            service.generate("u1", "main", listOf("inventory:read", "inventory:read"), null)
        }
        assertEquals(400, error.statusCode)
    }

    @Test
    fun `token limit is enforced`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.countByUserIdAndAccountId("u1", "main") } returns 5
        val error = assertThrows(ApiResultException::class.java) {
            service.generate("u1", "main", listOf("inventory:read"), null)
        }
        assertEquals(429, error.statusCode)
    }

    @Test
    fun `generation rejects a missing account`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "nope") } returns null
        every { tokenRepository.countByUserIdAndAccountId("u1", "nope") } returns 0
        val error = assertThrows(ApiResultException::class.java) {
            service.generate("u1", "nope", listOf("inventory:read"), null)
        }
        assertEquals(404, error.statusCode)
    }

    @Test
    fun `valid bearer token with required scope returns owner`() {
        every { redisCache.getCache("open-api-token:tok123", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(10002), 0)

        assertEquals(OpenApiPrincipal("u1", "main"), service.validateAuthorization("Bearer tok123", OpenApiPermission.INVENTORY_WRITE))
    }

    @Test
    fun `missing malformed invalid and under-scoped bearer tokens are rejected`() {
        listOf(null, "", "tok123", "Basic tok123", "Bearer ").forEach { authorization ->
            val error = assertThrows(InventoryApiException::class.java) {
                service.validateAuthorization(authorization, OpenApiPermission.INVENTORY_WRITE)
            }
            assertEquals(401, error.status.value())
            assertEquals("unauthorized", error.code)
        }

        every { redisCache.getCache("open-api-token:invalid", TokenCacheData::class.java) } returns null
        every { tokenRepository.findByToken("invalid") } returns null
        assertEquals(
            401,
            assertThrows(InventoryApiException::class.java) {
                service.validateAuthorization("Bearer invalid", OpenApiPermission.INVENTORY_WRITE)
            }.status.value(),
        )

        every { redisCache.getCache("open-api-token:read-only", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(10001), 0)
        val forbidden = assertThrows(InventoryApiException::class.java) {
            service.validateAuthorization("Bearer read-only", OpenApiPermission.INVENTORY_WRITE)
        }
        assertEquals(403, forbidden.status.value())
        assertEquals("forbidden", forbidden.code)
    }

    @Test
    fun `daily tasks write scope cannot reach operator or inventory writes`() {
        every { redisCache.getCache("open-api-token:daily", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.code), 0)

        // 只有它自己的最小权限可通过
        assertEquals(
            OpenApiPrincipal("u1", "main"),
            service.validateAuthorization("Bearer daily", OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE),
        )

        // 密探写入/读取/导出/自动采集、库存读写、星石上传、活动日历：全部必须 403
        listOf(
            OpenApiPermission.OPERATOR_WRITE,
            OpenApiPermission.OPERATOR_READ,
            OpenApiPermission.OPERATOR_EXPORT,
            OpenApiPermission.OPERATOR_SCAN_WRITE,
            OpenApiPermission.INVENTORY_WRITE,
            OpenApiPermission.INVENTORY_READ,
            OpenApiPermission.STAR_CAPTURE_WRITE,
            OpenApiPermission.CALENDAR_READ,
        ).forEach { permission ->
            val error = assertThrows(InventoryApiException::class.java) {
                service.validateAuthorization("Bearer daily", permission)
            }
            assertEquals(403, error.status.value(), "scope " + permission.key + " must stay unreachable")
            assertEquals("forbidden", error.code)
        }
    }

    @Test
    fun `Mongo fallback validates token`() {
        every { redisCache.getCache("open-api-token:tok123", TokenCacheData::class.java) } returns null
        every { tokenRepository.findByToken("tok123") } returns entity(userId = "u2", scope = listOf(10003))

        assertEquals(OpenApiPrincipal("u2", "main"), service.validateAuthorization("Bearer tok123", OpenApiPermission.INVENTORY_EXPORT))
    }

    @Test
    fun `revocation uses token id and clears cached secret`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { tokenRepository.deleteById("token-id") } just runs

        service.delete("u1", "token-id")

        verify { redisCache.delete("open-api-token:tok123") }
        verify { tokenRepository.deleteById("token-id") }
    }

    @Test
    fun `secret is returned only for an owned active token without writes`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { tokenRepository.findByIdAndUserId("token-id", "u2") } returns null
        every { tokenRepository.findByIdAndUserId("missing", "u1") } returns null

        assertEquals("tok123", service.secret("u1", "token-id"))
        assertEquals(
            404,
            assertThrows(ApiResultException::class.java) { service.secret("u2", "token-id") }.statusCode,
        )
        assertEquals(
            404,
            assertThrows(ApiResultException::class.java) { service.secret("u1", "missing") }.statusCode,
        )
        verify(exactly = 0) { tokenRepository.save(any()) }
        verify(exactly = 0) { tokenRepository.delete(any()) }
    }

    @Test
    fun `scope update adds permission while preserving token and all other fields`() {
        val original = entity(scope = listOf(20004, 10002)).copy(
            kind = "OPERATOR",
            lastUsedAt = Instant.parse("2026-08-24T07:00:00Z"),
        )
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns original
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        val saved = slot<OpenApiToken>()
        every { tokenRepository.save(capture(saved)) } answers { saved.captured }
        val cached = slot<TokenCacheData>()
        every { redisCache.setCache("open-api-token:tok123", capture(cached), 0) } just runs

        val response = service.updateScopes(
            "u1",
            "token-id",
            listOf("operator:scan:write", "inventory:write", "inventory:read"),
        )

        assertEquals(original.copy(scope = listOf(20004, 10002, 10001)), saved.captured)
        assertEquals("tok123", saved.captured.token)
        assertEquals("token-id", response.tokenId)
        assertEquals("main", response.accountId)
        assertEquals("大号", response.accountName)
        assertEquals("note", response.remark)
        assertEquals(
            listOf("operator:scan:write", "inventory:write", "inventory:read"),
            response.scopes,
        )
        assertEquals(Instant.parse("2023-11-14T22:13:20Z"), response.createdAt)
        assertEquals(
            TokenCacheData(
                userId = "u1",
                accountId = "main",
                scope = listOf(20004, 10002, 10001),
                createTime = original.createTime.toEpochMilli(),
            ),
            cached.captured,
        )
        verifyOrder {
            redisCache.delete("open-api-token:tok123")
            tokenRepository.save(any())
            redisCache.setCache("open-api-token:tok123", any<TokenCacheData>(), 0)
        }
    }

    @Test
    fun `scope update removes permission from Mongo and Redis`() {
        val original = entity(scope = listOf(20004, 10002, 10001))
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns original
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        val saved = slot<OpenApiToken>()
        every { tokenRepository.save(capture(saved)) } answers { saved.captured }
        val cached = slot<TokenCacheData>()
        every { redisCache.setCache("open-api-token:tok123", capture(cached), 0) } just runs

        val response = service.updateScopes(
            "u1",
            "token-id",
            listOf("operator:scan:write", "inventory:write"),
        )

        assertEquals(listOf(20004, 10002), saved.captured.scope)
        assertEquals(listOf(20004, 10002), cached.captured.scope)
        assertEquals(listOf("operator:scan:write", "inventory:write"), response.scopes)
        assertFalse(saved.captured.scope.contains(10001))
        assertFalse(cached.captured.scope.contains(10001))
    }

    @Test
    fun `scope update cache write failure cannot restore the old cached permissions`() {
        val original = entity(scope = listOf(10001))
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns original
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.save(any()) } answers { firstArg() }
        every { redisCache.setCache("open-api-token:tok123", any<TokenCacheData>(), 0) } throws
            IllegalStateException("Redis unavailable")

        assertThrows(IllegalStateException::class.java) {
            service.updateScopes("u1", "token-id", listOf("inventory:write"))
        }

        verifyOrder {
            redisCache.delete("open-api-token:tok123")
            tokenRepository.save(original.copy(scope = listOf(10002)))
            redisCache.setCache("open-api-token:tok123", any<TokenCacheData>(), 0)
        }
    }

    @Test
    fun `scope update cannot modify another user's token`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u2") } returns null

        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u2", "token-id", listOf("inventory:read"))
        }

        assertEquals(404, error.statusCode)
        verify(exactly = 0) { tokenRepository.save(any()) }
        verify(exactly = 0) { redisCache.delete(any()) }
        verify(exactly = 0) { redisCache.setCache(any(), any<Any>(), any()) }
    }

    @Test
    fun `scope update returns 404 when token does not exist`() {
        every { tokenRepository.findByIdAndUserId("missing", "u1") } returns null

        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u1", "missing", listOf("inventory:read"))
        }

        assertEquals(404, error.statusCode)
    }

    @Test
    fun `scope update rejects empty scopes`() {
        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u1", "token-id", emptyList())
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `scope update rejects duplicate scopes`() {
        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u1", "token-id", listOf("inventory:read", "inventory:read"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `scope update rejects unknown scopes`() {
        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u1", "token-id", listOf("inventory:admin"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `scope update allows mixed inventory and operator permissions`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        val saved = slot<OpenApiToken>()
        every { tokenRepository.save(capture(saved)) } answers { saved.captured }

        val response = service.updateScopes(
            "u1",
            "token-id",
            listOf("inventory:write", "operator:scan:write"),
        )

        assertEquals(listOf(10002, 20004), saved.captured.scope)
        assertEquals(listOf("inventory:write", "operator:scan:write"), response.scopes)
    }

    @Test
    fun `scope update returns not found when token account was deleted`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns null

        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u1", "token-id", listOf("inventory:write"))
        }

        assertEquals(404, error.statusCode)
        assertEquals("子账号不存在", error.message)
        verify(exactly = 0) { tokenRepository.save(any()) }
        verify(exactly = 0) { redisCache.delete(any()) }
        verify(exactly = 0) { redisCache.setCache(any(), any<Any>(), any()) }
    }

    @Test
    fun `account revocation clears every bound token regardless of legacy kind`() {
        every { tokenRepository.findAllByUserIdAndAccountId("u1", "main") } returns
            listOf(
                entity(id = "one", token = "tok1").copy(kind = "OPERATOR"),
                entity(id = "two", token = "tok2").copy(kind = "INVENTORY"),
            )
        every { tokenRepository.delete(any()) } just runs

        service.revokeByAccount("u1", "main")

        verify { redisCache.delete("open-api-token:tok1") }
        verify { redisCache.delete("open-api-token:tok2") }
        verify(exactly = 2) { tokenRepository.delete(any()) }
    }

    @Test
    fun `token list tolerates a missing account with a placeholder name`() {
        every { tokenRepository.findByUserIdOrderByCreateTimeDesc("u1") } returns listOf(
            entity(accountId = "gone"),
            entity(id = "alive", token = "tok456", accountId = "main"),
        )
        every { accountRepository.findByUserIdAndAccountId("u1", "gone") } returns null
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")

        val items = service.list("u1")

        assertEquals(2, items.size)
        assertEquals("gone", items[0].accountId)
        assertEquals("已删除账号", items[0].accountName)
        assertEquals("大号", items[1].accountName)
    }

    @Test
    fun `token list uses DTO and never exposes secret or integer scopes`() {
        every { tokenRepository.findByUserIdOrderByCreateTimeDesc("u1") } returns listOf(
            entity(scope = listOf(10001, 10002, 10003)),
        )
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")

        val item = service.list("u1").single()

        assertEquals("token-id", item.tokenId)
        assertEquals("main", item.accountId)
        assertEquals("大号", item.accountName)
        assertEquals(listOf("inventory:read", "inventory:write", "inventory:export"), item.scopes)
        assertFalse(item.toString().contains("tok123"))
        assertEquals(Instant.parse("2023-11-14T22:13:20Z"), item.createdAt)
    }

    @Test
    fun `any-of validation accepts either scope and rejects when neither is present`() {
        // 只有今日历练完成记录权限：读取今日待办（operator:read 或 operator:daily-tasks:write）应当放行
        every { redisCache.getCache("open-api-token:daily-only", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.code), 0)
        assertEquals(
            OpenApiPrincipal("u1", "main"),
            service.validateAnyAuthorization(
                "Bearer daily-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            ),
        )
        // 单权限校验仍然拒绝：读接口并没有放宽成「随便什么 scope 都能读」
        assertEquals(
            403,
            assertThrows(InventoryApiException::class.java) {
                service.validateAuthorization("Bearer daily-only", OpenApiPermission.OPERATOR_READ)
            }.status.value(),
        )

        // 只有密探读取权限：同样放行
        every { redisCache.getCache("open-api-token:read-only", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(OpenApiPermission.OPERATOR_READ.code), 0)
        assertEquals(
            OpenApiPrincipal("u1", "main"),
            service.validateAnyAuthorization(
                "Bearer read-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            ),
        )

        // 两个都没有（例如只有活动日历）：403
        every { redisCache.getCache("open-api-token:calendar-only", TokenCacheData::class.java) } returns
            TokenCacheData("u1", "main", listOf(OpenApiPermission.CALENDAR_READ.code), 0)
        val forbidden = assertThrows(InventoryApiException::class.java) {
            service.validateAnyAuthorization(
                "Bearer calendar-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        }
        assertEquals(403, forbidden.status.value())
        assertEquals("forbidden", forbidden.code)

        // 空权限列表等价于「只要 Token 有效」，与 authenticateAuthorization 一致
        assertEquals(
            OpenApiPrincipal("u1", "main"),
            service.validateAnyAuthorization("Bearer calendar-only"),
        )
    }
}
