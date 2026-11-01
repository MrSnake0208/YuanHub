package com.lhs.share.testinfra

import com.github.dockerjava.api.model.ExposedPort
import com.github.dockerjava.api.model.PortBinding
import com.github.dockerjava.api.model.Ports
import com.mongodb.client.MongoClient
import com.mongodb.client.MongoClients
import org.springframework.data.redis.connection.RedisStandaloneConfiguration
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.MongoDBContainer
import org.testcontainers.utility.DockerImageName
import java.net.URI
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Only this fixture may create database clients for integration tests. No external URI input exists. */
object TestMongo {
    private val ownedUris = ConcurrentHashMap.newKeySet<String>()
    fun isOwnedUri(value: String): Boolean = value in ownedUris
    private val ownedDatabases = ConcurrentHashMap.newKeySet<String>()
    private val mongoResult: Result<MongoDBContainer> by lazy {
        runCatching {
            require(System.getenv("DOCKER_HOST")?.startsWith("unix://") != false) { "Testcontainers require a local Docker socket" }
            MongoDBContainer(DockerImageName.parse("mongo:7.0.28"))
                .withReuse(false)
                .withLabel("yuanhub.test", "true")
                .withLabel("yuanhub.test.kind", "mongo")
                .withStartupTimeout(Duration.ofMinutes(3))
                .withCreateContainerCmdModifier { command ->
                    command.hostConfig!!.withPortBindings(PortBinding(Ports.Binding.bindIp("127.0.0.1"), ExposedPort(27017)))
                }
                .also { container ->
                    System.getenv("AO_SESSION_ID")?.let { container.withLabel("ao.session", it) }
                    container.start() // Starts a replica set; missing Docker is deliberately a test failure.
                    Runtime.getRuntime().addShutdownHook(Thread({ container.stop() }, "yuanhub-test-mongo-cleanup"))
                }
        }
    }
    private val mongo: MongoDBContainer get() = mongoResult.getOrThrow()

    fun requireTestDatabase(name: String) {
        require(name.matches(Regex("yuanhub_test_[a-z0-9_]{1,48}"))) { "Refusing non-test Mongo database: $name" }
    }

    fun database(label: String): String {
        require(label.matches(Regex("[a-z0-9_]{1,12}"))) { "Test database label must be short lowercase ASCII" }
        val name = "yuanhub_test_${label}_${UUID.randomUUID().toString().replace("-", "")}"
        requireTestDatabase(name)
        ownedDatabases.add(name)
        return name
    }

    fun uri(database: String): String {
        requireTestDatabase(database)
        require(database in ownedDatabases) { "Database was not allocated by this test process" }
        val base = URI(mongo.replicaSetUrl)
        // Never discover localhost:27017 advertised inside a single-member container.
        // Transactions still use the replica set, but all traffic stays on its mapped port.
        val query = (
            (base.query?.split("&") ?: emptyList()).filterNot {
                it.startsWith("directConnection=")
            } + "directConnection=true"
            ).joinToString("&")
        return URI(base.scheme, base.userInfo, base.host, base.port, "/$database", query, null).toString().also { ownedUris.add(it) }
    }

    fun client(): MongoClient = MongoClients.create(uri(database("client")))

    fun dropDatabase(client: MongoClient, database: String) {
        requireTestDatabase(database)
        require(database in ownedDatabases) { "Refusing to drop a database not owned by this test process" }
        client.getDatabase(database).drop()
    }
}

private class RedisTestContainer : GenericContainer<RedisTestContainer>(DockerImageName.parse("redis:7.4.2-alpine"))

/** One ephemeral Redis per test JVM. Tests use unique keys, never FLUSHDB against a supplied server. */
object TestRedis {
    @Volatile private var allocatedUri: String? = null
    fun isOwnedUri(value: String): Boolean = allocatedUri != null && value == allocatedUri
    private val redisResult: Result<RedisTestContainer> by lazy {
        runCatching {
            require(System.getenv("DOCKER_HOST")?.startsWith("unix://") != false) { "Testcontainers require a local Docker socket" }
            RedisTestContainer().withExposedPorts(6379).withReuse(false)
                .withLabel("yuanhub.test", "true")
                .withLabel("yuanhub.test.kind", "redis")
                .withStartupTimeout(Duration.ofMinutes(2))
                .withCreateContainerCmdModifier { command ->
                    command.hostConfig!!.withPortBindings(PortBinding(Ports.Binding.bindIp("127.0.0.1"), ExposedPort(6379)))
                }
                .also { container ->
                    System.getenv("AO_SESSION_ID")?.let { container.withLabel("ao.session", it) }
                    container.start()
                    allocatedUri = "redis://${container.host}:${container.getMappedPort(6379)}"
                    Runtime.getRuntime().addShutdownHook(Thread({ container.stop() }, "yuanhub-test-redis-cleanup"))
                }
        }
    }
    private val redis: RedisTestContainer get() = redisResult.getOrThrow()
    val host: String get() = redis.host
    val port: Int get() = redis.getMappedPort(6379)
    val uri: String get() = "redis://$host:$port"

    fun connectionFactory(): LettuceConnectionFactory = LettuceConnectionFactory(RedisStandaloneConfiguration(host, port)).apply {
        afterPropertiesSet()
        start()
    }
}
