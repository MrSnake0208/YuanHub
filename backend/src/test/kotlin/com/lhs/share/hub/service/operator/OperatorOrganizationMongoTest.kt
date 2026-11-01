package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.OperatorOrganizationRepository
import com.lhs.share.hub.repository.OperatorOrganizationRepositoryImpl
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class OperatorOrganizationMongoTest {
    private val database = TestMongo.database("organization")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = MongoRepositoryFactory(template).getRepository(
        OperatorOrganizationRepository::class.java,
        RepositoryFragments.just(OperatorOrganizationRepositoryImpl(template)),
    )

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `concurrent creates and updates each have exactly one winner`() {
        template.createCollection("operator_organization")
        for (revision in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map { number ->
                        Callable {
                            barrier.await()
                            runCatching { repository.replace("owner", "a", revision, """{"winner":$number}""", Instant.now()) }.getOrNull()
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it != null })
                assertEquals(revision + 1, repository.findByUserIdAndAccountId("owner", "a")!!.revision)
                assertEquals(1L, repository.count())
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `reads and account deletion stay scoped to owner and account`() {
        repository.replace("owner", "a", 0, "{}", Instant.now())
        repository.replace("owner", "b", 0, "{}", Instant.now())
        repository.replace("other", "a", 0, "{}", Instant.now())
        assertNull(repository.findByUserIdAndAccountId("stranger", "a"))
        assertNull(repository.replace("stranger", "a", 1, "{}", Instant.now()))
        repository.deleteAllByUserIdAndAccountId("owner", "a")
        assertNull(repository.findByUserIdAndAccountId("owner", "a"))
        assertNotNull(repository.findByUserIdAndAccountId("owner", "b"))
        assertNotNull(repository.findByUserIdAndAccountId("other", "a"))
        assertEquals(2L, repository.count())
    }
}
