package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.mongodb.MongoException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class InventoryAgentFavoriteServiceTest {
    private val repository = mockk<InventoryAgentFavoriteRepository>()
    private val accountService = mockk<SubAccountService>()
    private val catalogService = mockk<EntityCatalogService>()
    private val rows = ConcurrentHashMap<Pair<String, String>, InventoryAgentFavorite>()
    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

            override fun commit(status: TransactionStatus) = Unit

            override fun rollback(status: TransactionStatus) = Unit
        },
    )
    private val service = InventoryAgentFavoriteService(repository, accountService, catalogService, transactionTemplate)

    @BeforeEach
    fun setUp() {
        rows.clear()
        every { accountService.requireAccount(any(), any()) } answers {
            SubAccount(userId = firstArg(), accountId = secondArg(), name = "账号")
        }
        every { catalogService.exists("agent", any()) } returns true
        every { repository.save(any()) } answers {
            val favorite = firstArg<InventoryAgentFavorite>()
            val key = favorite.accountId to favorite.agentId
            if (rows.putIfAbsent(key, favorite) != null) throw DuplicateKeyException("duplicate")
            favorite
        }
        every { repository.findAllByUserIdAndAccountIdOrderByAgentIdAsc(any(), any()) } answers {
            val userId = firstArg<String>()
            val accountId = secondArg<String>()
            rows.values.filter { it.userId == userId && it.accountId == accountId }.sortedBy { it.agentId }
        }
        every { repository.existsByUserIdAndAccountIdAndAgentId(any(), any(), any()) } answers {
            val favorite = rows[secondArg<String>() to thirdArg<String>()]
            favorite?.userId == firstArg<String>()
        }
        every { repository.deleteByUserIdAndAccountIdAndAgentId(any(), any(), any()) } answers {
            val removed = rows.remove(secondArg<String>() to thirdArg<String>())
            if (removed?.userId == firstArg<String>()) 1L else 0L
        }
    }

    @Test
    fun `repeated PUT is successful and stores one row`() {
        val first = service.add("u1", "acc_a", "char_102_jianyong")
        val second = service.add("u1", "acc_a", "char_102_jianyong")

        assertTrue(first.favorite)
        assertTrue(second.favorite)
        assertEquals(1, rows.size)
    }

    @Test
    fun `DELETE of a missing favorite is successful`() {
        val response = service.remove("u1", "acc_a", "char_102_jianyong")

        assertEquals(false, response.favorite)
        assertTrue(rows.isEmpty())
    }

    @Test
    fun `retired agent favorite can be removed without allowing a new favorite`() {
        service.add("u1", "acc_a", "char_130_zhoutai")
        every { catalogService.exists("agent", "char_130_zhoutai") } returns false
        assertEquals(false, service.remove("u1", "acc_a", "char_130_zhoutai").favorite)
        assertTrue(rows.isEmpty())
        assertThrows(InventoryApiException::class.java) { service.add("u1", "acc_a", "char_130_zhoutai") }
    }

    @Test
    fun `favorites are isolated between accounts of the same user`() {
        service.add("u1", "acc_a", "char_102_jianyong")
        service.add("u1", "acc_b", "char_038_luxun")

        assertEquals(listOf("char_102_jianyong"), service.list("u1", "acc_a").agentIds)
        assertEquals(listOf("char_038_luxun"), service.list("u1", "acc_b").agentIds)
    }

    @Test
    fun `GET removes duplicates and sorts agent ids`() {
        every { repository.findAllByUserIdAndAccountIdOrderByAgentIdAsc("u1", "acc_a") } returns listOf(
            InventoryAgentFavorite(userId = "u1", accountId = "acc_a", agentId = "char_102_jianyong"),
            InventoryAgentFavorite(userId = "u1", accountId = "acc_a", agentId = "char_038_luxun"),
            InventoryAgentFavorite(userId = "u1", accountId = "acc_a", agentId = "char_102_jianyong"),
        )

        assertEquals(
            listOf("char_038_luxun", "char_102_jianyong"),
            service.list("u1", "acc_a").agentIds,
        )
    }

    @Test
    fun `foreign account access is rejected before favorite access`() {
        every { accountService.requireAccount("u2", "acc_a") } throws
            InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

        val error = assertThrows(InventoryApiException::class.java) { service.list("u2", "acc_a") }

        assertEquals("account_not_found", error.code)
        verify(exactly = 0) { repository.findAllByUserIdAndAccountIdOrderByAgentIdAsc("u2", "acc_a") }
    }

    @Test
    fun `invalid and unknown agent ids are rejected`() {
        val invalid = assertThrows(InventoryApiException::class.java) {
            service.add("u1", "acc_a", "agent-102")
        }
        every { catalogService.exists("agent", "char_999_unknown") } returns false
        val unknown = assertThrows(InventoryApiException::class.java) {
            service.add("u1", "acc_a", "char_999_unknown")
        }

        assertEquals("invalid_agent_id", invalid.code)
        assertEquals("unknown_agent", unknown.code)
        assertTrue(rows.isEmpty())
    }

    @Test
    fun `concurrent PUT requests produce one row and no failures`() {
        val executor = Executors.newFixedThreadPool(8)
        try {
            val futures = (1..32).map {
                executor.submit<Boolean> {
                    service.add("u1", "acc_a", "char_102_jianyong").favorite
                }
            }

            assertTrue(futures.all { it.get() })
            assertEquals(1, rows.size)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `PUT retries a transient Mongo transaction write conflict`() {
        var attempts = 0
        every { repository.save(any()) } answers {
            attempts++
            if (attempts == 1) {
                throw DataIntegrityViolationException(
                    "write conflict",
                    MongoException(112, "WriteConflict"),
                )
            }
            val favorite = firstArg<InventoryAgentFavorite>()
            rows[favorite.accountId to favorite.agentId] = favorite
            favorite
        }

        val response = service.add("u1", "acc_a", "char_102_jianyong")

        assertTrue(response.favorite)
        assertEquals(2, attempts)
        assertEquals(1, rows.size)
    }
}
