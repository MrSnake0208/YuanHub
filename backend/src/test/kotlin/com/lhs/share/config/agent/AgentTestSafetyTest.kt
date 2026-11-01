package com.lhs.share.config.agent

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions

class AgentTestSafetyTest {
    @TempDir
    lateinit var directory: Path

    @Test
    fun `ordinary application has no bootstrap and unsafe enabled profile fails before dependencies initialize`() {
        val context = ApplicationContextRunner().withUserConfiguration(AgentTestSafety::class.java, AgentTestBootstrap::class.java)
        context.run {
            assertEquals(0, it.getBeansOfType(AgentTestBootstrap::class.java).size)
            assertEquals(0, it.getBeansOfType(AgentTestSafety::class.java).size)
        }
        context.withPropertyValues("share.agent-test.enabled=true").withInitializer {
            it.environment.setActiveProfiles("prod")
        }.run {
            assertEquals("Agent sandbox requires ONLY local,agent-test profiles", it.startupFailure?.message)
        }
    }

    internal fun safeEnvironment(): MockEnvironment {
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"))
        val instance = "a".repeat(32)
        val properties = linkedMapOf(
            "server.address" to "127.0.0.1", "server.port" to "8080", "management.server.port" to "8080",
            "server.forward-headers-strategy" to "none",
            "spring.data.mongodb.uri" to "mongodb://127.0.0.1:32001/yuanhub_agent_${instance}_maa?replicaSet=rs0&directConnection=true",
            "share.mongo.hub-uri" to "mongodb://127.0.0.1:32001/yuanhub_agent_${instance}_hub?replicaSet=rs0&directConnection=true",
            "spring.data.redis.url" to "redis://127.0.0.1:32002/0", "debug.email.no-send" to "true",
            "share.jwt.secret" to "unit-only-".repeat(6), "share.jwt.expire" to "10", "share.beta.local-test-mode" to "true",
            "share.beta.campaign-id" to "yuanhub-beta-local-agent-$instance", "share.info.product-version" to "agent-$instance",
        )
        for (key in listOf(
            "share.avatar.dir",
            "share.media.dir",
            "share.media.private-dir",
            "share.star-capture.dir",
            "logging.file.name",
        )) {
            properties[key] = directory.resolve(key).toString()
        }
        val users = listOf("user", "admin").associateWith { role ->
            mapOf(
                "email" to "agent-$role-fixture@example.test",
                "name" to "agent-$role-fixture",
                "password" to "unit-only-synthetic-password",
            )
        }
        val manifest = directory.resolve("manifest.json")
        jacksonObjectMapper().writeValue(manifest.toFile(), mapOf("instance" to instance, "properties" to properties, "users" to users))
        Files.setPosixFilePermissions(manifest, PosixFilePermissions.fromString("rw-------"))
        return MockEnvironment().apply {
            setActiveProfiles("local", "agent-test")
            setProperty("share.agent-test.manifest", manifest.toString())
            properties.forEach { (key, value) -> setProperty(key, value) }
        }
    }

    @Test
    fun `explicit isolated config is accepted and production mixed profiles are rejected`() {
        assertDoesNotThrow { AgentTestSafety.verify(safeEnvironment()) }
        for (profiles in listOf(arrayOf("prod"), arrayOf("local"), arrayOf("local", "agent-test", "prod"), arrayOf("test"))) {
            val environment = safeEnvironment().apply { setActiveProfiles(*profiles) }
            assertThrows(IllegalArgumentException::class.java) { AgentTestSafety.verify(environment) }
        }
    }

    @Test
    fun `actual config overrides cannot substitute live databases Redis mail or storage`() {
        for ((key, value) in mapOf(
            "spring.data.mongodb.uri" to "mongodb://127.0.0.1:27017/MaaBackend",
            "share.mongo.hub-uri" to "mongodb://remote.example/HubBackend",
            "spring.data.redis.url" to "redis://127.0.0.1:6379/0",
            "debug.email.no-send" to "false", "server.address" to "0.0.0.0",
            "share.media.dir" to "/tmp/shared", "share.beta.local-test-mode" to "false",
            "share.beta.campaign-id" to "yuanhub-beta-production", "share.jwt.secret" to "public-secret",
        )) {
            val environment = safeEnvironment().withProperty(key, value)
            assertThrows(IllegalArgumentException::class.java) { AgentTestSafety.verify(environment) }
        }
    }

    @Test
    fun `matching but unsafe manifest cannot authorize ordinary local database names`() {
        val environment = safeEnvironment()
        val path = directory.resolve("manifest.json")
        val mapper = jacksonObjectMapper()
        val tree = mapper.readTree(path.toFile())
        (tree["properties"] as com.fasterxml.jackson.databind.node.ObjectNode)
            .put("share.mongo.hub-uri", "mongodb://127.0.0.1:32001/HubBackend?replicaSet=rs0&directConnection=true")
        mapper.writeValue(path.toFile(), tree)
        environment.setProperty("share.mongo.hub-uri", tree["properties"]["share.mongo.hub-uri"].asText())
        assertThrows(IllegalArgumentException::class.java) { AgentTestSafety.verify(environment) }
    }

    @Test
    fun `world readable credentials refuse startup`() {
        val environment = safeEnvironment()
        Files.setPosixFilePermissions(directory.resolve("manifest.json"), PosixFilePermissions.fromString("rw-r--r--"))
        assertThrows(IllegalArgumentException::class.java) { AgentTestSafety.verify(environment) }
    }

    @Test
    fun `malformed manifest does not include credential content in exception`() {
        val environment = safeEnvironment()
        Files.writeString(directory.resolve("manifest.json"), "{\"password\":\"unit-private-content\"")
        val error = assertThrows(IllegalArgumentException::class.java) { AgentTestSafety.verify(environment) }
        assertEquals("Invalid protected Agent manifest JSON", error.message)
        assertEquals(null, error.cause)
    }

    @Test
    fun `local request accepted but tunnel host origin and forwarded headers refused`() {
        val filter = AgentTestSafety().localAgentRequestsOnly()
        for (kind in listOf("local", "host", "origin", "forwarded", "remote")) {
            val request = MockHttpServletRequest().apply {
                remoteAddr = if (kind == "remote") "192.0.2.1" else "127.0.0.1"
                serverName = if (kind == "host") "preview.example.test" else "127.0.0.1"
                if (kind == "origin") addHeader("Origin", "https://preview.example.test")
                if (kind == "forwarded") addHeader("X-Forwarded-Host", "preview.example.test")
            }
            val response = MockHttpServletResponse()
            var reached = false
            filter.doFilter(request, response) { _, _ -> reached = true }
            assertEquals(kind == "local", reached)
            assertEquals(if (kind == "local") 200 else 403, response.status)
        }
    }
}
