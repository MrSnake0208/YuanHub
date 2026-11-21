package com.lhs.share.openapi

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class OpenApiTokenServiceTest {
    private val tokenRepository = mockk<OpenApiTokenRepository> { every { findByToken(any()) } returns null }
    private val accountRepository = mockk<SubAccountRepository>()
    private val cipher = OpenApiTokenCipher(java.util.Base64.getEncoder().encodeToString(ByteArray(32) { it.toByte() }))
    private val service = OpenApiTokenService(tokenRepository, accountRepository, cipher, mockk(relaxed = true))

    private fun lookup(secret: String) = listOf(OpenApiTokenCipher.digest(secret), secret)

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
        every { tokenRepository.findFirstByTokenIn(lookup(secret)) } returns entity(token = secret)
        assertEquals("token-id", service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u1", "main")))
        assertThrows(InventoryApiException::class.java) {
            service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u2", "main"))
        }
        assertThrows(InventoryApiException::class.java) {
            service.connectionIdForAuthorization("Bearer $secret", OpenApiPrincipal("u1", "alt"))
        }
        every { tokenRepository.findFirstByTokenIn(lookup(secret)) } returns null
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
        assertEquals(OpenApiTokenCipher.digest(response.token), saved.captured.token)
        every { tokenRepository.findByIdAndUserId(response.tokenId, "u1") } returns saved.captured
        assertEquals(response.token, service.secret("u1", response.tokenId))
        every { tokenRepository.findByToken(saved.captured.token) } returns saved.captured
        assertEquals("u1", service.authenticateAuthorization("Bearer ${response.token}").userId)
        verify(exactly = 0) { tokenRepository.findFirstByTokenIn(any()) }
        assertThrows(InventoryApiException::class.java) { service.authenticateAuthorization("Bearer " + saved.captured.token) }
        assertThrows(javax.crypto.AEADBadTagException::class.java) {
            cipher.decrypt(checkNotNull(saved.captured.encryptedSecret), response.tokenId, "another-owner")
        }
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
        every { tokenRepository.findFirstByTokenIn(lookup("tok123")) } returns entity(scope = listOf(10002))

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

        every { tokenRepository.findFirstByTokenIn(lookup("invalid")) } returns null
        assertEquals(
            401,
            assertThrows(InventoryApiException::class.java) {
                service.validateAuthorization("Bearer invalid", OpenApiPermission.INVENTORY_WRITE)
            }.status.value(),
        )

        every { tokenRepository.findFirstByTokenIn(lookup("read-only")) } returns entity(scope = listOf(10001))
        val forbidden = assertThrows(InventoryApiException::class.java) {
            service.validateAuthorization("Bearer read-only", OpenApiPermission.INVENTORY_WRITE)
        }
        assertEquals(403, forbidden.status.value())
        assertEquals("forbidden", forbidden.code)
    }

    @Test
    fun `daily tasks write scope cannot reach operator or inventory writes`() {
        every { tokenRepository.findFirstByTokenIn(lookup("daily")) } returns
            entity(scope = listOf(OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.code))

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
            OpenApiPermission.STAR_SYNC_WRITE,
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
    fun `legacy Mongo row validates token`() {
        every { tokenRepository.findFirstByTokenIn(lookup("tok123")) } returns entity(userId = "u2", scope = listOf(10003))

        assertEquals(OpenApiPrincipal("u2", "main"), service.validateAuthorization("Bearer tok123", OpenApiPermission.INVENTORY_EXPORT))
    }

    @Test
    fun `revocation uses token id and removes the persistent credential`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returns entity()
        every { tokenRepository.deleteById("token-id") } just runs

        service.delete("u1", "token-id")

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
        every { tokenRepository.updateOwnedScopes("token-id", "u1", listOf(20004, 10002, 10001)) } returns 1L

        val response = service.updateScopes(
            "u1",
            "token-id",
            listOf("operator:scan:write", "inventory:write", "inventory:read"),
        )

        verify { tokenRepository.updateOwnedScopes("token-id", "u1", listOf(20004, 10002, 10001)) }
        assertEquals("token-id", response.tokenId)
        assertEquals("main", response.accountId)
        assertEquals("大号", response.accountName)
        assertEquals("note", response.remark)
        assertEquals(
            listOf("operator:scan:write", "inventory:write", "inventory:read"),
            response.scopes,
        )
        assertEquals(Instant.parse("2023-11-14T22:13:20Z"), response.createdAt)
    }

    @Test
    fun `revocation during a scope update cannot recreate the token`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u1") } returnsMany listOf(entity(), null)
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        every { tokenRepository.updateOwnedScopes("token-id", "u1", listOf(10002)) } returns 0L
        assertEquals(
            404,
            assertThrows(ApiResultException::class.java) {
                service.updateScopes("u1", "token-id", listOf("inventory:write"))
            }.statusCode,
        )
        verify(exactly = 0) { tokenRepository.save(any()) }
    }

    @Test
    fun `scope update cannot modify another user's token`() {
        every { tokenRepository.findByIdAndUserId("token-id", "u2") } returns null

        val error = assertThrows(ApiResultException::class.java) {
            service.updateScopes("u2", "token-id", listOf("inventory:read"))
        }

        assertEquals(404, error.statusCode)
        verify(exactly = 0) { tokenRepository.save(any()) }
        verify(exactly = 0) { tokenRepository.updateOwnedScopes(any(), any(), any()) }
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
        every { tokenRepository.updateOwnedScopes("token-id", "u1", listOf(10002, 20004)) } returns 1L

        val response = service.updateScopes(
            "u1",
            "token-id",
            listOf("inventory:write", "operator:scan:write"),
        )

        verify { tokenRepository.updateOwnedScopes("token-id", "u1", listOf(10002, 20004)) }
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
        verify(exactly = 0) { tokenRepository.updateOwnedScopes(any(), any(), any()) }
    }

    @Test
    fun `account revocation clears every bound token regardless of legacy kind`() {
        every { tokenRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        service.revokeByAccount("u1", "main")
        verify { tokenRepository.deleteAllByUserIdAndAccountId("u1", "main") }
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
        every { tokenRepository.findFirstByTokenIn(lookup("daily-only")) } returns
            entity(scope = listOf(OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE.code))
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
        every { tokenRepository.findFirstByTokenIn(lookup("read-only")) } returns
            entity(scope = listOf(OpenApiPermission.OPERATOR_READ.code))
        assertEquals(
            OpenApiPrincipal("u1", "main"),
            service.validateAnyAuthorization(
                "Bearer read-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            ),
        )

        // 两个都没有（例如只有活动日历）：403
        every { tokenRepository.findFirstByTokenIn(lookup("calendar-only")) } returns
            entity(scope = listOf(OpenApiPermission.CALENDAR_READ.code))
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
