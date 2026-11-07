package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarStateRestoreRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarPlanInheritancePendingRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarPlanInheritancePending
import com.lhs.share.hub.repository.entity.StarPlanInheritanceResolution
import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

/** Service dispatch and rollback signalling only; real atomicity belongs to TestMongo tests. */
class StarOcrRebuildTest {
    private val states = mockk<StarStateCurrentRepository>()
    private val pending = mockk<StarPlanInheritancePendingRepository>()
    private val points = mockk<StarRecoveryPointRepository>()
    private val loadouts = mockk<StarLoadoutCurrentRepository>()
    private val operators = mockk<OperatorCurrentRepository>()
    private val accounts = mockk<SubAccountService>()
    private var commits = 0
    private var rollbacks = 0
    private val tx = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) {
            commits++
        }
        override fun rollback(status: TransactionStatus) {
            rollbacks++
        }
    })
    private val service = StarStateService(states, points, pending, loadouts, operators, accounts, tx)
    private val old = StarStateCurrent(
        userId = "owner", accountId = "a", generation = 4, revision = 9,
        inventory = listOf(StarStateEntry("old1", "main", "天府", "orange", 40), StarStateEntry("old2", "main", "天府", "orange", 40)),
        planTargets = emptyList(), experience = StarStateExperience(), bag = StarStateBag(), updatedAt = Instant.EPOCH,
    )
    private val oldWear = StarLoadoutCurrent(
        userId = "owner",
        accountId = "a",
        generation = 4,
        revision = 3,
        loadouts = listOf(StarOperatorLoadout("op", StarLoadoutSlots(main1 = "old1", main2 = "old2"))),
    )
    private fun request(reason: String = "pre_ocr_rebuild") = StarStateRebuildRequest(
        4,
        9,
        listOf(
            StarInventoryEntryRequest("z-first", "main", " 天府 ", "orange", 40),
            StarInventoryEntryRequest("a-second", "main", "天府", "orange", 40),
        ),
        emptyMap(),
        StarWorkspaceExperienceRequest(),
        StarWorkspaceBagRequest(),
        reason,
    )

    @BeforeEach fun setup() {
        every { pending.findByUserIdAndAccountId(any(), any()) } returns null
        every { accounts.requireAccount("owner", "a") } returns SubAccount(userId = "owner", accountId = "a", name = "test", game = "如鸢")
        every { states.findByUserIdAndAccountId("owner", "a") } returns old
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns oldWear
        every { operators.findByUserIdAndAccountIdOrderByUpdatedAtDesc("owner", "a") } returns listOf(
            OperatorCurrent(
                userId = "owner",
                accountId = "a",
                game = "如鸢",
                entries = mapOf(
                    "op" to OperatorEntry(elite = 0, starLevel = 0, level = 1),
                ),
            ),
        )
        every { points.findTop3ByUserIdAndAccountIdOrderByCreatedAtDescIdDesc("owner", "a") } returns emptyList()
        every { points.findByUserIdAndAccountIdOrderByCreatedAtDescIdDesc("owner", "a") } returns emptyList()
        every { points.insert(any<StarRecoveryPoint>()) } answers { firstArg() }
        every { states.replace("owner", "a", 4, 9, 5, any(), any()) } answers {
            val snapshot = arg<StarStateSnapshot>(5)
            old.copy(generation = 5, revision = 10, inventory = snapshot.inventory, planTargets = snapshot.planTargets)
        }
        every { loadouts.replaceForGeneration("owner", "a", 3, 5, any(), any()) } answers {
            oldWear.copy(generation = 5, revision = 4, loadouts = arg(4))
        }
    }

    @Test fun `unresolved inheritance prevents every rebuild reason and restore inside the transaction`() {
        every { pending.findByUserIdAndAccountId("owner", "a") } answers {
            assertEquals(0, commits)
            StarPlanInheritancePending("owner:a", "owner", "a", "source", 4, "scan")
        }
        for (reason in listOf("pre_ocr_rebuild", "import_data_safety", "restore_local")) {
            val error = assertThrows(InventoryApiException::class.java) { service.rebuild("owner", "a", request(reason)) }
            assertEquals("star_plan_inheritance_pending", error.code)
        }
        val error = assertThrows(InventoryApiException::class.java) {
            service.restore("owner", "a", "source", StarStateRestoreRequest(4, 9))
        }
        assertEquals("star_plan_inheritance_pending", error.code)
        assertEquals(0, commits)
        assertEquals(4, rollbacks)
        verify(exactly = 0) { states.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { points.insert(any<StarRecoveryPoint>()) }
        verify(exactly = 0) { loadouts.replaceForGeneration(any(), any(), any(), any(), any(), any()) }
    }

    @Test fun `resolved pending does not block the next generation`() {
        for (action in listOf("confirm", "discard")) {
            every { pending.findByUserIdAndAccountId("owner", "a") } returns StarPlanInheritancePending(
                "owner:a",
                "owner",
                "a",
                "source",
                4,
                "scan",
                resolution = StarPlanInheritanceResolution("operation", action, "{}", 9),
            )
            assertEquals(5, service.rebuild("owner", "a", request()).state.generation)
        }
        assertEquals(2, commits)
        assertEquals(0, rollbacks)
    }

    @Test fun `OCR dispatch uses normalized attributes submitted order and one generation write keeping historical IDs`() {
        val result = service.rebuild("owner", "a", request())
        assertEquals("z-first", result.loadout.loadouts["op"]?.get("main1"))
        assertEquals("a-second", result.loadout.loadouts["op"]?.get("main2"))
        assertEquals(5, result.loadout.generation)
        verify(exactly = 1) { states.replace("owner", "a", 4, 9, 5, any(), any()) }
        verify(exactly = 1) { loadouts.replaceForGeneration("owner", "a", 3, 5, any(), any()) }
        verify {
            points.insert(
                match<StarRecoveryPoint> {
                    it.sourceGeneration == 4L && it.loadouts == oldWear.loadouts &&
                        it.state.inventory == old.inventory
                },
            )
        }
        assertEquals(1, commits)
    }

    @Test fun `stale loadout generation cannot seed OCR inheritance`() {
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns oldWear.copy(generation = 3)
        assertTrue(service.rebuild("owner", "a", request()).loadout.loadouts.isEmpty())
    }

    @Test fun `JSON replacement keeps clearing wear and local restore keeps ID based semantics`() {
        assertTrue(service.rebuild("owner", "a", request("import_data_safety")).loadout.loadouts.isEmpty())
        assertTrue(
            service.rebuild("owner", "a", request("restore_local")).loadout.loadouts.values.all { slots ->
                slots.values.all {
                    it ==
                        null
                }
            },
        )
        val sameIds = request("restore_local").copy(
            inventory = old.inventory.map {
                StarInventoryEntryRequest(it.instanceId, it.kind, it.name, it.quality, it.level)
            },
        )
        assertEquals("old1", service.rebuild("owner", "a", sameIds).loadout.loadouts["op"]?.get("main1"))
    }

    @Test fun `OCR cannot reuse old generation instance IDs`() {
        val reused = request().copy(inventory = listOf(StarInventoryEntryRequest("old1", "main", "天府", "orange", 40)))
        assertEquals(
            "star_state_invalid_snapshot",
            assertThrows(InventoryApiException::class.java) {
                service.rebuild("owner", "a", reused)
            }.code,
        )
        verify(exactly = 0) { states.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { points.insert(any<StarRecoveryPoint>()) }
    }

    @Test fun `necessary loadout read failure aborts rather than treating it as zero matches`() {
        every { loadouts.findByUserIdAndAccountId("owner", "a") } throws IllegalStateException("read failed")
        assertThrows(IllegalStateException::class.java) { service.rebuild("owner", "a", request()) }
        assertEquals(1, rollbacks)
        assertEquals(0, commits)
        verify(exactly = 0) { states.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test fun `loadout CAS failure signals rollback instead of returning a partial success`() {
        every { loadouts.replaceForGeneration("owner", "a", 3, 5, any(), any()) } returns null
        assertEquals(
            "star_loadout_revision_conflict",
            assertThrows(InventoryApiException::class.java) {
                service.rebuild("owner", "a", request())
            }.code,
        )
        assertEquals(1, rollbacks)
        assertEquals(0, commits)
    }

    @Test fun `stale state version rejects before checkpoint or wear write`() {
        assertEquals(
            "star_state_revision_conflict",
            assertThrows(InventoryApiException::class.java) {
                service.rebuild("owner", "a", request().copy(expectedRevision = 8))
            }.code,
        )
        verify(exactly = 0) { points.insert(any<StarRecoveryPoint>()) }
        verify(exactly = 0) { loadouts.replaceForGeneration(any(), any(), any(), any(), any(), any()) }
        assertEquals(1, rollbacks)
    }

    @Test fun `state CAS failure rolls back without attempting inherited wear write`() {
        every { states.replace("owner", "a", 4, 9, 5, any(), any()) } returns null
        assertEquals(
            "star_state_revision_conflict",
            assertThrows(InventoryApiException::class.java) {
                service.rebuild("owner", "a", request())
            }.code,
        )
        verify(exactly = 0) { loadouts.replaceForGeneration(any(), any(), any(), any(), any(), any()) }
        assertEquals(1, rollbacks)
        assertEquals(0, commits)
    }
}
