package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.OperatorMilestoneRepository
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorHuaji
import com.lhs.share.hub.repository.entity.OperatorMilestones
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class OperatorMilestoneMongoTest {
    private val database = TestMongo.database("milestones")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = OperatorMilestoneRepository(template)
    private val transaction = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))

    @BeforeEach
    fun setup() {
        template.createCollection(OperatorMilestones::class.java)
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `owner game operator isolation CAS and scoped deletion`() {
        for ((user, account, game, op) in listOf(
            listOf("u", "a", "如鸢", "op"),
            listOf("v", "a", "如鸢", "op"),
            listOf("u", "b", "如鸢", "op"),
            listOf("u", "a", "代号鸢", "op"),
            listOf("u", "a", "如鸢", "sp"),
        )) {
            repository.replace(user, account, game, op, 0, mapOf("star_1" to "2026-01-01"))
        }
        assertThrows(DuplicateKeyException::class.java) { repository.replace("u", "a", "如鸢", "op", 0, emptyMap()) }
        assertNull(repository.replace("u", "a", "如鸢", "op", 2, emptyMap()))
        assertEquals(2L, repository.replace("u", "a", "如鸢", "op", 1, emptyMap())!!.revision)
        assertEquals("2026-01-01", repository.find("u", "a", "如鸢", "sp")!!.dates["star_1"])
        repository.deleteAccount("u", "a")
        assertNull(repository.find("u", "a", "如鸢", "op"))
        assertNull(repository.find("u", "a", "代号鸢", "op"))
        assertEquals(1L, repository.find("v", "a", "如鸢", "op")!!.revision)
        assertEquals(1L, repository.find("u", "b", "如鸢", "op")!!.revision)
    }

    @Test
    fun `parallel CAS has one winner and transaction rolls back`() {
        repository.replace("u", "a", "如鸢", "op", 0, emptyMap())
        val executor = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val results = executor.invokeAll(
                (1..2).map {
                    Callable {
                        barrier.await()
                        repository.replace(
                            "u",
                            "a",
                            "如鸢",
                            "op",
                            1,
                            mapOf(
                                "star_1" to "2026-01-0$it",
                            ),
                        )
                    }
                },
            ).map { it.get() }
            assertEquals(1, results.count { it != null })
        } finally {
            executor.shutdownNow()
        }
        assertThrows(IllegalStateException::class.java) {
            transaction.executeWithoutResult {
                repository.replace("u", "a", "如鸢", "op", 2, emptyMap())
                error("rollback")
            }
        }
        assertEquals(2L, repository.find("u", "a", "如鸢", "op")!!.revision)
    }

    @Test
    fun `observations use exact stages and scoped earliest record without inferring skipped stars`() {
        fun record(user: String, game: String, stage: Int, date: String) = OperatorCorrectionRecord(
            userId = user,
            accountId = "a",
            game = game,
            operatorId = "op",
            reason = "manual_correction",
            fields = setOf("huaji"),
            huaji = OperatorHuaji(true, stage, false),
            createdAt = Instant.parse(date),
        )
        template.insert(record("u", "如鸢", 13, "2026-03-01T00:00:00Z"))
        template.insert(record("v", "如鸢", 7, "2026-01-01T00:00:00Z"))
        template.insert(record("u", "代号鸢", 7, "2026-01-01T00:00:00Z"))
        assertNull(repository.observedAt("u", "a", "如鸢", "op", "star_2"))
        assertNull(repository.observedAt("u", "a", "如鸢", "op", "awakening"))
        assertEquals(Instant.parse("2026-03-01T00:00:00Z"), repository.observedAt("u", "a", "如鸢", "op", "star_3"))
    }
}
