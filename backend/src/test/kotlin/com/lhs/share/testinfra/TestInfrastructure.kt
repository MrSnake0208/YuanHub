package com.lhs.share.testinfra

import com.lhs.share.config.agent.NamespacedRedisKeys
import com.mongodb.client.MongoClient
import com.mongodb.client.MongoClients
import org.bson.Document
import org.springframework.data.redis.connection.RedisStandaloneConfiguration
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory
import org.springframework.data.redis.core.StringRedisTemplate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Shared local service; only this JVM's randomly allocated databases may be used or dropped. */
object TestMongo {
    private const val BASE = "mongodb://127.0.0.1:27017/"
    private const val QUERY = "?directConnection=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=5000"
    private val ownedUris = ConcurrentHashMap.newKeySet<String>()
    private val ownedDatabases = ConcurrentHashMap.newKeySet<String>()
    fun isOwnedUri(value: String): Boolean = value in ownedUris

    private val service: MongoClient by lazy {
        val client = MongoClients.create(BASE + QUERY)
        try {
            val hello = client.getDatabase("admin").runCommand(Document("hello", 1))
            check(hello.getString("setName") != null && hello.getBoolean("isWritablePrimary", false)) {
                "Integration tests require a writable local MongoDB replica set on 127.0.0.1:27017"
            }
        } catch (error: Exception) {
            client.close()
            throw error
        }
        Runtime.getRuntime().addShutdownHook(
            Thread({
                try {
                    ownedDatabases.forEach { name ->
                        runCatching { dropDatabase(client, name) }.onFailure {
                            System.err.println("Could not clean owned test database: $name")
                        }
                    }
                } finally {
                    client.close()
                }
            }, "yuanhub-test-mongo-cleanup"),
        )
        client
    }

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
        service
        return (BASE + database + QUERY).also { ownedUris.add(it) }
    }

    fun client(): MongoClient = MongoClients.create(uri(database("client")))

    fun dropDatabase(client: MongoClient, database: String) {
        requireTestDatabase(database)
        require(database in ownedDatabases) { "Refusing to drop a database not owned by this test process" }
        client.getDatabase(database).drop()
    }
}

/** Every key, including Lua KEYS and wildcard cleanup patterns, belongs to this test JVM. */
object TestRedis {
    val host = "127.0.0.1"
    val port = 6379
    private const val URL = "redis://127.0.0.1:6379/15"
    private val prefix = "yuanhub_test:${UUID.randomUUID()}:"

    @Volatile private var allocated = false
    fun isOwnedUri(value: String): Boolean = allocated && value == URL

    val keySerializer = NamespacedRedisKeys(prefix)

    private val cleanupHook: Unit by lazy {
        Runtime.getRuntime().addShutdownHook(
            Thread({
                val factory = newConnectionFactory()
                try {
                    clearOwnedKeys(template(factory))
                } catch (error: Exception) {
                    System.err.println("Could not clean owned Redis test keys: ${error.javaClass.simpleName}")
                } finally {
                    factory.destroy()
                }
            }, "yuanhub-test-redis-cleanup"),
        )
    }

    val uri: String get() {
        cleanupHook
        allocated = true
        return URL
    }

    private fun newConnectionFactory(): LettuceConnectionFactory =
        LettuceConnectionFactory(RedisStandaloneConfiguration(host, port).apply { database = 15 }).apply {
            afterPropertiesSet()
            start()
        }

    fun connectionFactory(): LettuceConnectionFactory {
        uri
        return newConnectionFactory()
    }

    fun template(factory: LettuceConnectionFactory): StringRedisTemplate =
        StringRedisTemplate(factory).apply { keySerializer = TestRedis.keySerializer }

    fun clearOwnedKeys(template: StringRedisTemplate) {
        require(template.keySerializer === keySerializer) { "Redis cleanup requires the test namespace serializer" }
        val keys = template.keys("*")
        if (keys.isNotEmpty()) template.delete(keys)
    }
}
