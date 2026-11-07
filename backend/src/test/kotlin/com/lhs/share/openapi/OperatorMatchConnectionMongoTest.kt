package com.lhs.share.openapi

import com.lhs.share.hub.repository.OperatorMatchConnectionRepository
import com.lhs.share.hub.repository.entity.OperatorMatchConnection
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class OperatorMatchConnectionMongoTest {
    private val database = TestMongo.database("opmatch")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = MongoRepositoryFactory(mongo).getRepository(OperatorMatchConnectionRepository::class.java)
    private val service = OperatorMatchConnectionService(repository, mockk<BetaService>(relaxed = true))

    @BeforeEach
    fun setup() {
        mongo.createCollection(OperatorMatchConnection::class.java)
        MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(OperatorMatchConnection::class.java).forEach {
            mongo.indexOps(OperatorMatchConnection::class.java).ensureIndex(it)
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `concurrent creation returns one persisted code per user`() {
        val executor = Executors.newFixedThreadPool(8)
        val barrier = CyclicBarrier(8)
        try {
            val futures = (1..8).map {
                executor.submit(
                    Callable {
                        barrier.await(10, TimeUnit.SECONDS)
                        service.create("owner")
                    },
                )
            }
            val results = futures.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, results.toSet().size)
            assertEquals(1L, repository.count())
            assertNotEquals(results.first().token, service.create("other").token)
            assertEquals(results.first(), service.create("owner"))
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `oldest legacy code survives and stopping it cannot reactivate duplicates`() {
        val oldest = OperatorMatchConnection("old", "owner", "ymatch_" + "a".repeat(32), Instant.EPOCH)
        val newer = oldest.copy(id = "new", token = "ymatch_" + "b".repeat(32), createdAt = Instant.EPOCH.plusSeconds(1))
        val foreign = oldest.copy(id = "foreign", userId = "other", token = "ymatch_" + "c".repeat(32))
        repository.insert(listOf(newer, foreign, oldest))
        assertEquals(listOf("old"), service.list("owner").map { it.connectionId })
        assertEquals(oldest.token, service.create("owner").token)
        assertEquals(oldest, service.authenticate("Bearer ${oldest.token}"))
        assertThrows(InventoryApiException::class.java) { service.authenticate("Bearer ${newer.token}") }
        assertThrows(InventoryApiException::class.java) { service.secret("owner", newer.id) }
        assertThrows(InventoryApiException::class.java) { service.revoke("other", oldest.id) }
        assertEquals(3L, repository.count())
        service.revoke("owner", oldest.id)
        assertEquals(1L, repository.count())
        assertEquals(foreign, service.authenticate("Bearer ${foreign.token}"))
        assertThrows(InventoryApiException::class.java) { service.authenticate("Bearer ${oldest.token}") }
        assertThrows(InventoryApiException::class.java) { service.authenticate("Bearer ${newer.token}") }
        assertNotEquals(oldest.token, service.create("owner").token)
        assertThrows(InventoryApiException::class.java) { service.authenticate("Bearer ${newer.token}") }
    }
}
