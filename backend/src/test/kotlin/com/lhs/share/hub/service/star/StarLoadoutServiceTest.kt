package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarLoadoutCurrentRequest
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class StarLoadoutServiceTest {
    private val repository = mockk<StarLoadoutCurrentRepository>()
    private val states = mockk<StarStateCurrentRepository>()
    private val accountService = mockk<SubAccountService>()
    private val stateService = mockk<StarStateService>()
    private val transactions = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private val service = StarLoadoutService(repository, states, accountService, stateService, transactions)
    private var generation = 4L
    private var current: StarLoadoutCurrent? = null

    @BeforeEach fun setUp() {
        generation = 4
        current = null
        every { accountService.requireAccount("u1", "acc_a") } returns SubAccount(userId = "u1", accountId = "acc_a", name = "主号", game = "如鸢")
        every { stateService.operatorIds("u1", "acc_a", "如鸢") } returns setOf("operator.a")
        every { states.findByUserIdAndAccountId("u1", "acc_a") } answers {
            StarStateCurrent(id = "u1:acc_a", userId = "u1", accountId = "acc_a", generation = generation,
                revision = 2, inventory = listOf(
                    StarStateEntry("main.1", "main", "天府", "orange", 20),
                    StarStateEntry("support.1", "support", "文曲", "white", 1),
                ), planTargets = emptyList(), experience = com.lhs.share.hub.repository.entity.StarStateExperience(),
                bag = com.lhs.share.hub.repository.entity.StarStateBag(), updatedAt = Instant.now())
        }
        every { states.fenceLoadoutWrite("u1", "acc_a", any(), any()) } returns true
        every { repository.findByUserIdAndAccountId("u1", "acc_a") } answers { current }
        every { repository.replaceForGeneration("u1", "acc_a", any(), any(), any(), any()) } answers {
            val expected = args[2] as Long
            if ((current?.revision ?: 0) != expected) null
            else StarLoadoutCurrent(id = "u1:acc_a", userId = "u1", accountId = "acc_a",
                revision = expected + 1, generation = args[3] as Long,
                loadouts = args[4] as List<com.lhs.share.hub.repository.entity.StarOperatorLoadout>,
                updatedAt = args[5] as Instant).also { current = it }
        }
    }

    @Test fun `valid account scoped save preserves dotted IDs and generation`() {
        val saved = service.putCurrent("u1", "acc_a", request(4, 0, slots(main1 = "main.1", support1 = "support.1")))
        assertEquals(4, saved.generation)
        assertEquals(1, saved.revision)
        assertEquals("main.1", saved.loadouts["operator.a"]?.get("main1"))
        verify(exactly = 1) { states.fenceLoadoutWrite("u1", "acc_a", 4, 2) }
    }

    @Test fun `stale loadout revision rejects without replacing current generation data`() {
        service.putCurrent("u1", "acc_a", request(4, 0, slots(main1 = "main.1")))
        val error = assertThrows(InventoryApiException::class.java) {
            service.putCurrent("u1", "acc_a", request(4, 0, slots(support1 = "support.1")))
        }
        assertEquals("star_loadout_revision_conflict", error.code)
        assertEquals("main.1", current!!.loadouts.single().slots.main1)
    }

    @Test fun `stale generation rejects before persistence`() {
        generation = 5
        val error = assertThrows(InventoryApiException::class.java) {
            service.putCurrent("u1", "acc_a", request(4, 0, slots(main1 = "main.1")))
        }
        assertEquals("star_generation_changed", error.code)
        assertEquals(null, current)
    }

    @Test fun `missing operator wrong kind and dangling ID reject`() {
        val cases = listOf(
            "star_loadout_invalid_operator" to StarLoadoutCurrentRequest(0, mapOf("missing" to slots(main1 = "main.1")), 4),
            "star_loadout_slot_kind_mismatch" to request(4, 0, slots(main1 = "support.1")),
            "star_loadout_invalid_reference" to request(4, 0, slots(main1 = "old.1")),
            "star_loadout_instance_occupied" to request(4, 0, slots(main1 = "main.1", main2 = "main.1")),
        )
        cases.forEach { (code, request) ->
            assertEquals(code, assertThrows(InventoryApiException::class.java) {
                service.putCurrent("u1", "acc_a", request)
            }.code)
        }
    }

    private fun request(gen: Long, rev: Long, slots: Map<String, String?>) =
        StarLoadoutCurrentRequest(rev, mapOf("operator.a" to slots), gen)

    private fun slots(main1: String? = null, main2: String? = null, support1: String? = null) = mapOf(
        "main1" to main1, "main2" to main2, "main3" to null,
        "support1" to support1, "support2" to null, "support3" to null,
    )
}
