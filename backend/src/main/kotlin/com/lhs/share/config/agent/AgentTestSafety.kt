package com.lhs.share.config.agent

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.config.BeanFactoryPostProcessor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.core.env.Environment
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions

/** Opt-in sandbox only; the guard runs before datasource/index beans can initialize. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["share.agent-test.enabled"], havingValue = "true")
class AgentTestSafety {
    companion object {
        @Bean
        @JvmStatic
        fun refuseUnsafeAgentConnections(environment: Environment): BeanFactoryPostProcessor = BeanFactoryPostProcessor {
            verify(environment)
        }

        fun manifest(environment: Environment): JsonNode {
            val path = Path.of(requireNotNull(environment.getProperty("share.agent-test.manifest")))
            require(Files.getPosixFilePermissions(path) == PosixFilePermissions.fromString("rw-------")) {
                "Agent manifest must have mode 0600"
            }
            require(Files.getPosixFilePermissions(path.parent) == PosixFilePermissions.fromString("rwx------")) {
                "Agent manifest directory must have mode 0700"
            }
            return try {
                jacksonObjectMapper().readTree(path.toFile())
            } catch (_: Exception) {
                throw IllegalArgumentException("Invalid protected Agent manifest JSON")
            }
        }

        fun verify(environment: Environment) {
            require(environment.activeProfiles.toSet() == setOf("local", "agent-test")) {
                "Agent sandbox requires ONLY local,agent-test profiles"
            }
            val data = manifest(environment)
            val instance = data.path("instance").asText()
            require(Regex("[a-f0-9]{32}").matches(instance)) { "Invalid Agent sandbox instance" }
            val keys = listOf(
                "server.address", "server.port", "server.forward-headers-strategy", "management.server.port",
                "spring.data.mongodb.uri", "share.mongo.hub-uri", "spring.data.redis.url",
                "debug.email.no-send", "share.jwt.secret", "share.jwt.expire", "share.beta.local-test-mode", "share.beta.campaign-id",
                "share.info.product-version", "share.avatar.dir", "share.media.dir", "share.media.private-dir",
                "share.star-capture.dir", "logging.file.name",
            )
            for (key in keys) {
                val expected = data.path("properties").path(key).asText()
                require(expected.isNotBlank() && environment.getProperty(key) == expected) {
                    "Agent sandbox configuration mismatch: $key"
                }
            }
            for ((key, suffix) in listOf("spring.data.mongodb.uri" to "maa", "share.mongo.hub-uri" to "hub")) {
                val uri = URI(environment.getProperty(key)!!)
                require(uri.scheme == "mongodb" && uri.host == "127.0.0.1" && uri.port > 1024 && uri.userInfo == null) {
                    "Agent Mongo must use an owned loopback container"
                }
                require(uri.path == "/yuanhub_agent_${instance}_$suffix" && uri.query == "replicaSet=rs0&directConnection=true") {
                    "Agent Mongo database/replica set mismatch"
                }
            }
            val redis = URI(environment.getProperty("spring.data.redis.url")!!)
            require(redis.scheme == "redis" && redis.host == "127.0.0.1" && redis.port > 1024 && redis.path == "/0") {
                "Agent Redis must use an owned loopback container"
            }
            require(environment.getProperty("server.address") == "127.0.0.1") { "Agent HTTP must bind loopback" }
            require(environment.getProperty("server.forward-headers-strategy") == "none") { "Agent proxy headers forbidden" }
            require(environment.getProperty("server.port") == "8080" && environment.getProperty("management.server.port") == "8080") {
                "Agent server must use the local development port"
            }
            require(environment.getProperty("debug.email.no-send") == "true") { "Agent mail must be disabled" }
            require(environment.getProperty("share.beta.local-test-mode") == "true") { "Agent beta must be local" }
            require(environment.getProperty("share.beta.campaign-id") == "yuanhub-beta-local-agent-$instance") { "Agent beta mismatch" }
            require(environment.getProperty("share.info.product-version") == "agent-$instance") { "Agent version mismatch" }
            require(environment.getProperty("share.jwt.secret")!!.length >= 48) { "Agent JWT secret must be random" }
            require(environment.getProperty("share.jwt.expire") == "10") { "Agent expiry verification requires 10 second access tokens" }
            val base = Path.of(environment.getProperty("share.agent-test.manifest")!!).parent.toAbsolutePath().normalize()
            for (key in listOf(
                "share.avatar.dir",
                "share.media.dir",
                "share.media.private-dir",
                "share.star-capture.dir",
                "logging.file.name",
            )) {
                require(Path.of(environment.getProperty(key)!!).toAbsolutePath().normalize().startsWith(base)) {
                    "Agent storage must stay inside its protected directory: $key"
                }
            }
        }
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    fun localAgentRequestsOnly(): OncePerRequestFilter = object : OncePerRequestFilter() {
        override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
            val local = setOf("127.0.0.1", "localhost", "::1", "0:0:0:0:0:0:0:1")
            val forwarded = request.headerNames.toList().any { it.equals("Forwarded", true) || it.startsWith("X-Forwarded-", true) }
            val origin = request.getHeader("Origin")
            val originLocal = origin == null || runCatching { URI(origin).host in local }.getOrDefault(false)
            if (request.remoteAddr !in local || request.serverName !in local || forwarded || !originLocal) {
                response.sendError(403, "Agent sandbox accepts local requests only")
                return
            }
            chain.doFilter(request, response)
        }
    }
}
