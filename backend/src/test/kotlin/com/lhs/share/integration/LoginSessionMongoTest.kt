package com.lhs.share.integration

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.hub.repository.OpenApiTokenRepository
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.openapi.OpenApiPermission
import com.lhs.share.openapi.OpenApiTokenCipher
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.repository.UserRepository
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.jwt.JwtInvalidException
import com.lhs.share.service.jwt.JwtService
import com.lhs.share.service.jwt.LoginSessions
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.Executors

@Tag("integration")
class LoginSessionMongoTest {
    private val database = TestMongo.database("auth")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)
    private val jwt = JwtService(ShareProperties().apply { jwt.secret = "isolated-test-signing-key-1234567890" })
    private val user = MaaUser("u", "player", "u@example.invalid", "unused", 1, Instant.EPOCH)
    private val users = mockk<UserRepository> { every { findByUserId("u") } returns user }
    private val sessions = LoginSessions(mongo, users, jwt)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `a lost rotation response survives a network outage while a retired generation cannot refresh`() {
        val start = Instant.now()
        val initial = sessions.start("u", start)
        val successor = sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(360))
        assertNotEquals(initial.value, successor.value)
        assertEquals(successor.value, sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(900)).value)
        val current = sessions.refresh(successor, Instant.EPOCH, start.plusSeconds(901))
        assertThrows(JwtInvalidException::class.java) { sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(902)) }
        assertEquals(current.value, sessions.refresh(current, Instant.EPOCH, start.plusSeconds(903)).value)
    }

    @Test
    fun `using the new access token retires the preceding refresh after the retry window`() {
        val start = Instant.now()
        val initial = sessions.start("u", start)
        val next = sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(360))
        val access = jwt.issueAuthToken("u", next.jwtId, emptyList(), next.issuedAt)
        sessions.requireAccess(jwt.verifyAndParseAuthToken(access.value))
        assertEquals(next.value, sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(361)).value)
        assertThrows(JwtInvalidException::class.java) { sessions.refresh(initial, Instant.EPOCH, start.plusSeconds(661)) }
    }

    @Test
    fun `password and name updates preserve disabled status and do not overwrite newer credentials`() {
        val repository = MongoRepositoryFactory(mongo).getRepository(UserRepository::class.java)
        repository.insert(user.copy(status = 0))
        val changedAt = Instant.ofEpochMilli(System.currentTimeMillis())
        assertEquals(1L, repository.changePassword("u", "unused", "updated", changedAt))
        assertEquals(0L, repository.changePassword("u", "unused", "stale", changedAt))
        assertEquals(1L, repository.changeUserName("u", "renamed"))
        val result = repository.findById("u").orElseThrow()
        assertEquals("updated", result.password)
        assertEquals(changedAt, result.pwdUpdateTime)
        assertEquals(0, result.status)
    }

    @Test
    fun `legacy refresh is adopted once across concurrent retries and cannot resurrect a logged out device`() {
        val legacy = jwt.issueRefreshToken("u", null, Instant.now().minusSeconds(3600))
        val oldAccess = jwt.issueAuthToken("u", null, emptyList())
        sessions.requireAccess(oldAccess)
        val next = Executors.newFixedThreadPool(4).use { pool ->
            val replies = pool.invokeAll(List(12) { Callable { sessions.refresh(legacy, Instant.EPOCH).value } })
            replies.map { it.get() }.distinct().single()
        }
        val migrated = jwt.verifyAndParseRefreshToken(next)
        val other = sessions.start("u", Instant.now())
        sessions.logout(migrated, oldAccess)
        assertThrows(JwtInvalidException::class.java) { sessions.refresh(legacy, Instant.EPOCH) }
        assertThrows(JwtInvalidException::class.java) { sessions.refresh(migrated, Instant.EPOCH) }
        assertThrows(JwtInvalidException::class.java) { sessions.requireAccess(oldAccess) }
        sessions.requireAccess(jwt.issueAuthToken("u", other.jwtId, emptyList()))
        user.pwdUpdateTime = Instant.now().plusSeconds(1)
        assertThrows(JwtInvalidException::class.java) { sessions.requireAccess(jwt.issueAuthToken("u", other.jwtId, emptyList())) }
        assertThrows(JwtInvalidException::class.java) { sessions.refresh(other, user.pwdUpdateTime) }
    }

    @Test
    fun `legacy and encrypted codes can authenticate and copy and scope edits preserve ciphertext`() {
        val repository = MongoRepositoryFactory(mongo).getRepository(OpenApiTokenRepository::class.java)
        val cipher = OpenApiTokenCipher(java.util.Base64.getEncoder().encodeToString(ByteArray(32) { 42 }))
        val row = OpenApiToken(id = "abc", userId = "u", accountId = "a", token = "old-code", scope = listOf(10001), remark = null)
        repository.insert(row)
        val tokens = OpenApiTokenService(repository, mockk(), cipher, mockk(relaxed = true))
        assertEquals("u", tokens.validateAuthorization("Bearer old-code", OpenApiPermission.INVENTORY_READ).userId)
        repository.save(row.copy(token = OpenApiTokenCipher.digest(row.token), encryptedSecret = cipher.encrypt(row.token, "abc", "u")))
        assertEquals("old-code", tokens.secret("u", "abc"))
        assertEquals("u", tokens.validateAuthorization("Bearer old-code", OpenApiPermission.INVENTORY_READ).userId)
        assertEquals(1L, repository.updateOwnedScopes("abc", "u", listOf(10002)))
        assertEquals(0L, repository.updateOwnedScopes("abc", "other", emptyList()))
        assertNotEquals("old-code", repository.findById("abc").get().token)
        assertEquals("old-code", tokens.secret("u", "abc"))
        assertThrows(com.lhs.share.hub.service.inventory.InventoryApiException::class.java) {
            tokens.validateAuthorization("Bearer old-code", OpenApiPermission.INVENTORY_READ)
        }
    }
}
