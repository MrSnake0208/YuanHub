package com.lhs.share.config.agent

import com.lhs.share.controller.response.user.MaaLoginRsp
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.repository.RedisCache
import com.lhs.share.repository.UserRepository
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.UserService
import com.mongodb.client.FindIterable
import com.mongodb.client.MongoCollection
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.bson.Document
import org.bson.conversions.Bson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import java.nio.file.Path
import java.time.Instant
import java.util.Optional

class AgentTestBootstrapTest {
    @TempDir
    lateinit var directory: Path

    private val users = mockk<UserService>()
    private val repository = mockk<UserRepository>()
    private val codes = mockk<RedisCache>(relaxed = true)
    private val redis = mockk<StringRedisTemplate>()
    private val mongo = mockk<MongoTemplate>()
    private val hub = mockk<MongoTemplate>()
    private val roles = mockk<AdminRoleBindingRepository>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val bindings = mutableMapOf<String, AdminRoleBinding>()
    private val present = mutableSetOf<String>()

    private fun runner(marker: Boolean = true, redisMarker: Boolean = true): AgentTestBootstrap {
        val environment = AgentTestSafetyTest().apply { directory = this@AgentTestBootstrapTest.directory }.safeEnvironment()
        val collection = mockk<MongoCollection<Document>>()
        val records = mockk<FindIterable<Document>>()
        every { mongo.getCollection("agent_test_ownership") } returns collection
        every { hub.getCollection("agent_test_ownership") } returns collection
        every { collection.find(any<Bson>()) } returns records
        every { records.first() } returns if (marker) Document("_id", "a".repeat(32)) else null
        val values = mockk<ValueOperations<String, String>>()
        every { redis.opsForValue() } returns values
        every { values.get("agent-test:ownership") } returns if (redisMarker) "a".repeat(32) else null
        every { repository.findByEmail(any()) } answers {
            if (firstArg<String>() in present) mockk<MaaUser>() else null
        }
        every { users.register(any()) } answers {
            val request = firstArg<com.lhs.share.controller.request.user.RegisterDTO>()
            present += request.email
            MaaUserInfo(request.email, request.userName, true)
        }
        every { users.login(any()) } answers {
            val email = firstArg<com.lhs.share.controller.request.user.LoginDTO>().email
            val now = Instant.EPOCH
            MaaLoginRsp("unit", now, now, "unit-refresh", now, now, MaaUserInfo(email, "unit-user", true))
        }
        every { roles.findById(any()) } answers { Optional.ofNullable(bindings[firstArg<String>()]) }
        every { roles.save(any()) } answers { firstArg<AdminRoleBinding>().also { bindings[it.userId] = it } }
        every { authorization.rolesFor(any()) } answers { bindings[firstArg<String>()]?.roles.orEmpty() }
        every { authorization.hasAnyAdminCapability(any()) } returns false
        return AgentTestBootstrap(environment, users, repository, codes, redis, mongo, hub, roles, authorization)
    }

    @Test
    fun `repeat bootstrap creates two real identities once and grants only calendar editor`() {
        val runner = runner()
        repeat(2) { runner.run(DefaultApplicationArguments()) }
        verify(exactly = 2) { users.register(any()) }
        verify(exactly = 4) { users.login(any()) }
        verify(exactly = 2) { codes.setCache(any(), any<String>(), 60L) }
        verify(exactly = 1) { roles.save(any()) }
        assertEquals(setOf(AdminRole.ACTIVITY_CALENDAR_EDITOR), bindings.values.single().roles)
    }

    @Test
    fun `missing actual ownership marker refuses before account registration or role writes`() {
        val runner = runner(marker = false)
        assertThrows(IllegalStateException::class.java) { runner.run(DefaultApplicationArguments()) }
        verify(exactly = 0) { users.register(any()) }
        verify(exactly = 0) { codes.setCache(any(), any<String>(), any<Long>()) }
        verify(exactly = 0) { roles.save(any()) }
    }

    @Test
    fun `missing Redis ownership refuses before any identity mutation`() {
        val runner = runner(redisMarker = false)
        assertThrows(IllegalStateException::class.java) { runner.run(DefaultApplicationArguments()) }
        verify(exactly = 0) { users.register(any()) }
        verify(exactly = 0) { codes.setCache(any(), any<String>(), any<Long>()) }
        verify(exactly = 0) { roles.save(any()) }
    }

    @Test
    fun `unexpected elevated role refuses without replacing an existing binding`() {
        val runner = runner()
        val email = "agent-user-fixture@example.test"
        val now = Instant.EPOCH
        bindings[email] = AdminRoleBinding(email, setOf(AdminRole.SUPER_ADMIN), "unit", now, "unit", now)
        assertThrows(IllegalStateException::class.java) { runner.run(DefaultApplicationArguments()) }
        verify(exactly = 0) { roles.save(any()) }
        assertEquals(setOf(AdminRole.SUPER_ADMIN), bindings[email]?.roles)
    }
}
