package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepository
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.OperatorReserveWorkspace
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.mapping.MongoMappingContext
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class OperatorReserveWorkspaceMongoTest {
    private val database = TestMongo.database("reserve")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val repository = factory.getRepository(
        OperatorReserveWorkspaceRepository::class.java,
        RepositoryFragments.just(OperatorReserveWorkspaceRepositoryImpl(template)),
    )
    private val accountRepository = factory.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val transactions = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val accounts = OperatorReserveWorkspaceFixtures.accounts(accountRepository, repository, transactions)
    private val mapper = jacksonObjectMapper()
    private val service = OperatorReserveWorkspaceService(
        accounts,
        accountRepository,
        repository,
        OperatorReserveWorkspaceValidator(),
        mapper,
        mockk<AccountEventService>(relaxed = true),
        transactions,
    )
    private fun request(revision: Long = 0) = OperatorReserveWorkspaceFixtures.request(mapper, revision)

    @BeforeEach
    fun setup() {
        accountRepository.insert(SubAccount(userId = "owner", accountId = "a", name = "synthetic a", game = "如鸢"))
        accountRepository.insert(SubAccount(userId = "owner", accountId = "b", name = "synthetic b", game = "如鸢"))
        template.createCollection(OperatorReserveWorkspace::class.java)
        val resolver = MongoPersistentEntityIndexResolver(template.converter.mappingContext as MongoMappingContext)
        resolver.resolveIndexFor(OperatorReserveWorkspace::class.java).forEach {
            template.indexOps(OperatorReserveWorkspace::class.java).ensureIndex(it)
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `read purity unique owner index and exactly one concurrent CAS winner`() {
        service.workspace("owner", "a")
        assertEquals(0, repository.count())
        assertEquals(0, accountRepository.findByUserIdAndAccountId("owner", "a")!!.recruitmentFence)
        for (revision in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map {
                        Callable {
                            barrier.await()
                            runCatching { service.putWorkspace("owner", "a", request(revision)) }
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it.isSuccess })
                assertEquals(
                    "reserve_workspace_revision_conflict",
                    (
                        results.single {
                            it.isFailure
                        }.exceptionOrNull() as OperatorApiException
                        ).code,
                )
                assertEquals(revision + 1, repository.findByUserIdAndAccountId("owner", "a")!!.revision)
            } finally {
                executor.shutdownNow()
            }
        }
        assertEquals(1, repository.count())
        val document = repository.findByUserIdAndAccountId("owner", "a")!!
        assertThrows(DuplicateKeyException::class.java) { repository.insert(document.copy(id = "different-id")) }
    }

    @Test
    fun `account deletion cleans only owned reserve and game changes preserve old data`() {
        service.putWorkspace("owner", "a", request())
        service.putWorkspace("owner", "b", request())
        accounts.update("owner", "a", null, "代号鸢")
        assertTrue(service.workspace("owner", "a").path("read_only").asBoolean())
        assertThrows(OperatorApiException::class.java) { service.putWorkspace("owner", "a", request(1)) }
        assertNotNull(repository.findByUserIdAndAccountId("owner", "a"))
        accounts.delete("owner", "a")
        assertNull(repository.findByUserIdAndAccountId("owner", "a"))
        assertNull(accountRepository.findByUserIdAndAccountId("owner", "a"))
        assertNotNull(repository.findByUserIdAndAccountId("owner", "b"))
    }

    @Test
    fun `account delete rollback retains reserve on later failure`() {
        service.putWorkspace("owner", "a", request())
        assertThrows(IllegalStateException::class.java) {
            transactions.executeWithoutResult {
                accounts.delete("owner", "a")
                error("synthetic later failure")
            }
        }
        assertNotNull(repository.findByUserIdAndAccountId("owner", "a"))
        assertNotNull(accountRepository.findByUserIdAndAccountId("owner", "a"))
    }

    @Test
    fun `repository first upsert race is protected even without the account transaction fence`() {
        val barrier = CyclicBarrier(2)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = executor.invokeAll(
                (1..2).map {
                    Callable {
                        barrier.await()
                        runCatching { repository.replace("owner", "a", "如鸢", 0, "{}", Instant.now()) }
                    }
                },
            ).map { it.get() }
            assertEquals(1, results.count { it.isSuccess })
            assertTrue(results.single { it.isFailure }.exceptionOrNull() is DuplicateKeyException)
            assertEquals(1, repository.count())
        } finally {
            executor.shutdownNow()
        }
    }
}
