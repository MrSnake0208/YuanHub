package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.OperatorDailyTasksRepository
import com.lhs.share.hub.repository.entity.OperatorDailyTasks
import com.lhs.share.hub.repository.entity.OperatorTrainingTask
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class OperatorDailyTasksMongoTest {
    private val database = TestMongo.database("training_tasks")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = OperatorDailyTasksRepository(template)
    private val transaction = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val row = OperatorTrainingTask("ds-10", "ds", 10, 1)
    private val now = Instant.parse("2026-10-16T00:00:00Z")

    @BeforeEach
    fun setup() {
        template.createCollection(OperatorDailyTasks::class.java)
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `concurrent create and completion CAS have exactly one winner`() {
        for (version in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map {
                        Callable {
                            barrier.await()
                            runCatching {
                                repository.replace(
                                    "u",
                                    "a",
                                    "p",
                                    "2026-10-16",
                                    version,
                                    listOf(row.copy(completedCount = version.toInt())),
                                    now,
                                )
                            }.getOrNull()
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it != null })
                assertEquals(version + 1, repository.find("u", "a", "p", "2026-10-16")!!.version)
                assertEquals(1, template.count(Query(), OperatorDailyTasks::class.java))
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `owner account plan and business day are isolated and account deletion is scoped`() {
        val owners =
            listOf(
                listOf("u", "a", "p", "2026-10-16"),
                listOf("v", "a", "p", "2026-10-16"),
                listOf("u", "b", "p", "2026-10-16"),
                listOf("u", "a", "q", "2026-10-16"),
                listOf("u", "a", "p", "2026-10-15"),
            )
        for ((user, account, plan, date) in owners) repository.replace(user, account, plan, date, 0, listOf(row), now)
        assertNull(repository.find("v", "b", "p", "2026-10-16"))
        repository.replace("u", "a", "p", "2026-10-16", 1, listOf(row.copy(completedCount = 1)), now)
        for ((user, account, plan, date) in owners.drop(
            1,
        )) {
            assertEquals(0, repository.find(user, account, plan, date)!!.tasks.single().completedCount)
        }
        repository.deleteAccount("u", "a")
        assertEquals(2, template.count(Query(), OperatorDailyTasks::class.java))
        assertNotNull(repository.find("v", "a", "p", "2026-10-16"))
        assertNotNull(repository.find("u", "b", "p", "2026-10-16"))
    }

    @Test
    fun `failed transactions roll back first adoption and completed state updates`() {
        assertThrows(IllegalStateException::class.java) {
            transaction.executeWithoutResult {
                repository.replace("u", "a", "p", "2026-10-16", 0, listOf(row), now)
                error("rollback")
            }
        }
        assertNull(repository.find("u", "a", "p", "2026-10-16"))
        repository.replace("u", "a", "p", "2026-10-16", 0, listOf(row), now)
        assertThrows(IllegalStateException::class.java) {
            transaction.executeWithoutResult {
                repository.replace("u", "a", "p", "2026-10-16", 1, listOf(row.copy(completedCount = 1)), now)
                repository.deleteAccount("u", "a")
                error("rollback")
            }
        }
        assertEquals(1L, repository.find("u", "a", "p", "2026-10-16")!!.version)
        assertEquals(0, repository.find("u", "a", "p", "2026-10-16")!!.tasks.single().completedCount)
    }
}
