package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorMilestoneRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorMilestones
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class OperatorMilestoneServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val repository = mockk<OperatorMilestoneRepository>()
    private val transaction = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private val service =
        OperatorMilestoneService(
            accounts,
            catalog,
            repository,
            transaction,
            Clock.fixed(Instant.parse("2026-10-21T16:00:00Z"), ZoneOffset.UTC),
        )
    private var subject =
        OperatorCatalogEntity(
            operatorId = "op", name = "test", rarity = 5, prof = emptyList(), subProf = emptyList(),
            games = listOf(
                "如鸢",
            ),
            discs = emptyList(), starStones = emptyList(), catalogVersion = "1",
        )
    private var stored: OperatorMilestones? = null
    private fun body(dates: String, revision: Long = 0) = mapper.readTree("""{"expected_revision":$revision,"dates":$dates}""")

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            if (firstArg<String>() == "u" &&
                secondArg<String>() == "a"
            ) {
                SubAccount(userId = "u", accountId = "a", name = "test", game = "如鸢")
            } else {
                null
            }
        }
        every { accounts.fenceRecruitmentWrite("u", "a", "如鸢") } returns true
        every { catalog.getOperator("op") } answers { subject }
        every { repository.find("u", "a", "如鸢", "op") } answers { stored }
        every { repository.observedAt("u", "a", "如鸢", "op", any()) } returns Instant.parse("2026-10-01T00:00:00Z")
        every { repository.replace("u", "a", "如鸢", "op", any(), any()) } answers {
            if (arg<Long>(4) != (stored?.revision ?: 0L)) {
                null
            } else {
                OperatorMilestones("id", "u", "a", "如鸢", "op", arg(5), arg<Long>(4) + 1).also { stored = it }
            }
        }
    }

    @Test
    fun `read is pure and observed timestamps never become actual dates`() {
        repeat(2) {
            val result = service.get("u", "a", "如鸢", "op")
            assertEquals(6, result.milestones.size)
            result.milestones.forEach { assertNull(it.date) }
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
    }

    @Test
    fun `valid dates survive reload and explicit null clears without filling gaps`() {
        val result = service.put("u", "a", "如鸢", "op", body("""{"star_1":"2024-02-29","star_3":"2026-10-22"}"""))
        assertEquals(1L, result.revision)
        assertNull(result.milestones[1].date)
        assertEquals("2026-10-22", service.get("u", "a", "如鸢", "op").milestones[2].date)
        service.put("u", "a", "如鸢", "op", body("""{"star_1":null}""", 1))
        assertEquals(emptyMap<String, String>(), stored!!.dates)
    }

    @Test
    fun `invalid dates order future values keys and revisions are rejected before writes`() {
        for (dates in listOf(
            """{"star_1":"2025-02-29"}""",
            """{"star_1":"2026-10-23"}""",
            """{"star_1":"2026-1-1"}""",
            """{"star_1":1}""",
            """{"star_1":"2026-02-02","star_3":"2026-02-01"}""",
            """{"star_9":"2026-01-01"}""",
            "[]",
        )) {
            assertThrows(OperatorApiException::class.java) { service.put("u", "a", "如鸢", "op", body(dates)) }
        }
        assertThrows(OperatorApiException::class.java) { service.put("u", "a", "如鸢", "op", body("{}", -1)) }
        assertThrows(OperatorApiException::class.java) {
            service.put("u", "a", "如鸢", "op", mapper.readTree("""{"dates":{},"expected_revision":0.5}"""))
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `stale writes cannot replace dates`() {
        service.put("u", "a", "如鸢", "op", body("""{"star_1":"2026-01-01"}"""))
        assertEquals(
            "milestone_revision_conflict",
            assertThrows(OperatorApiException::class.java) {
                service.put("u", "a", "如鸢", "op", body("{}"))
            }.code,
        )
        assertEquals("2026-01-01", stored!!.dates["star_1"])
    }

    @Test
    fun `foreign owner account and wrong game never access records`() {
        for ((user, account, game) in listOf(Triple("v", "a", "如鸢"), Triple("u", "b", "如鸢"), Triple("u", "a", "代号鸢"))) {
            assertThrows(OperatorApiException::class.java) { service.get(user, account, game, "op") }
            assertThrows(OperatorApiException::class.java) { service.put(user, account, game, "op", body("{}")) }
        }
        verify(exactly = 0) { repository.find(any(), any(), any(), any()) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `rarity and SP capabilities determine milestones independently`() {
        subject = subject.copy(rarity = 3)
        assertEquals(listOf("star_1", "star_2", "star_3", "star_4"), service.get("u", "a", "如鸢", "op").milestones.map { it.key })
        assertThrows(OperatorApiException::class.java) { service.put("u", "a", "如鸢", "op", body("""{"awakening":"2026-01-01"}""")) }
        subject = subject.copy(rarity = 5, spOf = "base")
        assertEquals(5, service.get("u", "a", "如鸢", "op").milestones.size)
    }
}
