package com.lhs.share.config.agent

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.controller.request.user.LoginDTO
import com.lhs.share.controller.request.user.RegisterDTO
import com.lhs.share.hub.repository.AdminRoleBindingRepository
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.repository.RedisCache
import com.lhs.share.repository.UserRepository
import com.lhs.share.service.UserService
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.env.Environment
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import java.time.Instant
import java.util.UUID

/** No HTTP bootstrap path. Business writes use the same services as ordinary users. */
@Component
@ConditionalOnProperty(name = ["share.agent-test.enabled"], havingValue = "true")
class AgentTestBootstrap(
    private val environment: Environment,
    private val users: UserService,
    private val userRepository: UserRepository,
    private val codes: RedisCache,
    private val redis: StringRedisTemplate,
    private val mongo: MongoTemplate,
    @param:Qualifier("hubMongoTemplate") private val hub: MongoTemplate,
    private val roles: AdminRoleBindingRepository,
    private val authorization: AdminAuthorizationService,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        AgentTestSafety.verify(environment)
        val data = AgentTestSafety.manifest(environment)
        val instance = data["instance"].asText()
        // Check actual connected databases, not just their names or a localhost URI.
        for (template in listOf(mongo, hub)) {
            check(template.getCollection("agent_test_ownership").find(Document("_id", instance)).first() != null) {
                "Agent Mongo ownership marker missing; refusing seed writes"
            }
        }
        check(redis.opsForValue().get("agent-test:ownership") == instance) { "Agent Redis ownership marker missing" }

        val identities = linkedMapOf<String, String>()
        for (role in listOf("user", "admin")) {
            val identity = data["users"][role]
            val email = identity["email"].asText()
            val name = identity["name"].asText()
            val password = identity["password"].asText()
            require(Regex("agent-$role-[a-z0-9-]{1,10}@example\\.test").matches(email)) { "Agent email must match its synthetic role" }
            require(password.length in 24..32 && name.length in 4..24) { "Invalid Agent credentials" }
            if (userRepository.findByEmail(email) == null) {
                val code = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
                // Seed only this owned sandbox's single-use code; never send or log it.
                codes.setCache("vCodeEmail:$email", code, 60L)
                users.register(RegisterDTO(email, name, password, code))
            }
            val userId = users.login(LoginDTO(email, password)).userInfo.id
            identities[role] = userId
            val expectedRoles = if (role == "admin") setOf(AdminRole.ACTIVITY_CALENDAR_EDITOR) else emptySet()
            val binding = roles.findById(userId).orElse(null)
            if (binding == null && expectedRoles.isNotEmpty()) {
                val now = Instant.now()
                roles.save(AdminRoleBinding(userId, expectedRoles, "agent-bootstrap", now, "agent-bootstrap", now))
            }
            check(authorization.rolesFor(userId) == expectedRoles) { "Agent roles changed; refusing to overwrite permissions" }
            if (role == "user") {
                check(!authorization.hasAnyAdminCapability(userId)) { "Agent user has unexpected feedback/admin grants" }
            }
        }

        val ready = Path.of(environment.getProperty("share.agent-test.manifest")!!).parent.resolve("ready.json")
        val content = jacksonObjectMapper().writeValueAsBytes(mapOf("instance" to instance, "users" to identities))
        Files.write(ready, content)
        Files.setPosixFilePermissions(ready, PosixFilePermissions.fromString("rw-------"))
    }
}
