package com.lhs.share.hub.service.star

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.star.request.StarInventorySyncCounts
import com.lhs.share.hub.controller.star.request.StarInventorySyncEntry
import com.lhs.share.hub.controller.star.request.StarInventorySyncExperience
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutCurrentResponse
import com.lhs.share.hub.controller.star.response.StarRecoveryPointResponse
import com.lhs.share.hub.controller.star.response.StarStateCommandResponse
import com.lhs.share.hub.controller.star.response.StarStateCurrentResponse
import com.lhs.share.hub.repository.StarInventorySyncRepository
import com.lhs.share.hub.repository.StarPlanInheritancePendingRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.StarInventorySync
import com.lhs.share.hub.repository.entity.StarPlanInheritancePending
import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
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
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

/** Command-level checks only. Mongo atomicity/concurrency still require the isolated integration suite. */
class StarInventorySyncServiceTest {
    private val receipts = mockk<StarInventorySyncRepository>()
    private val pending = mockk<StarPlanInheritancePendingRepository>()
    private val points = mockk<StarRecoveryPointRepository>()
    private val accounts = mockk<SubAccountService>()
    private val accountRepo = mockk<SubAccountRepository>()
    private val states = mockk<StarStateService>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val tx = mockk<TransactionTemplate>()
    private val saved = mutableMapOf<String, StarInventorySync>()
    private val mapper = jacksonObjectMapper()
    private val snapshot = StarStateSnapshot(
        listOf(StarStateEntry("old", "main", "天府", "orange", 20)),
        listOf(StarStatePlanTarget("old", 60)),
        StarStateExperience(0, 0, 0),
        StarStateBag(1),
    )
    private val source = StarRecoveryPoint(
        "owner:a:point", "owner", "a", "point", "pre_ocr_rebuild", Instant.EPOCH, 4, snapshot, emptyList(),
    )
    private fun service() = StarInventorySyncService(receipts, pending, points, accounts, accountRepo, states, events, mapper, tx)
    private fun request() = StarInventorySyncRequest(
        "maayuan-star-inventory",
        1,
        UUID.randomUUID().toString(),
        true,
        StarInventorySyncCounts(2, 0),
        List(2) { StarInventorySyncEntry("main", "天府", "orange", 60) },
        StarInventorySyncExperience(0, 525, 91),
    )

    @BeforeEach fun setup() {
        every { accounts.requireAccount("owner", "a") } returns SubAccount(userId = "owner", accountId = "a", name = "test", game = "如鸢")
        every { accountRepo.fenceRecruitmentWrite("owner", "a", "如鸢") } returns true
        every { receipts.findByUserIdAndAccountIdAndScanId("owner", "a", any()) } answers { saved[thirdArg()] }
        every { receipts.insert(any<StarInventorySync>()) } answers { firstArg<StarInventorySync>().also { saved[it.scanId] = it } }
        every { pending.findByUserIdAndAccountId("owner", "a") } returns null
        every { pending.insert(any<StarPlanInheritancePending>()) } answers { firstArg() }
        every { points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", "point") } returns source
        every { points.save(any<StarRecoveryPoint>()) } answers { firstArg() }
        every { states.current("owner", "a") } returns StarStateCurrentResponse.empty("a").copy(generation = 4, revision = 9)
        every { states.rebuild("owner", "a", any()) } returns StarStateCommandResponse(
            StarStateCurrentResponse.empty("a").copy(generation = 5, revision = 10),
            StarLoadoutCurrentResponse.empty("a"),
            StarRecoveryPointResponse.of(source),
        )
        every { tx.execute(any<TransactionCallback<StarInventorySyncResponse>>()) } answers {
            firstArg<TransactionCallback<StarInventorySyncResponse>>().doInTransaction(mockk(relaxed = true))
        }
    }

    @Test fun `command assigns distinct UUIDs uses observed CAS and protects old source without inheriting`() {
        val result = service().sync("owner", "a", request())
        assertEquals(5, result.generation)
        assertTrue(result.inheritancePending)
        verify(exactly = 1) {
            states.rebuild(
                "owner",
                "a",
                match {
                    it.expectedGeneration == 4L && it.expectedRevision == 9L && it.reason == "pre_ocr_rebuild" &&
                        it.planTargets!!.isEmpty() && it.inventory!!.size == 2 &&
                        it.inventory.map { entry -> entry.instanceId }.toSet().size == 2 &&
                        it.inventory.all { entry -> UUID.fromString(entry.instanceId) != null && entry.name == "天府" } &&
                        it.experience!!.orange == 0
                },
            )
            points.save(source.copy(inheritanceProtected = true))
            pending.insert(
                match<StarPlanInheritancePending> {
                    it.targetGeneration == 5L && it.sourceRecoveryPointId == "point" &&
                        it.accountId == "a"
                },
            )
        }
        val item = StarPlanInheritancePending("owner:a", "owner", "a", "point", 5, result.scanId)
        every { pending.findByUserIdAndAccountId("owner", "a") } returns item
        assertEquals(snapshot, service().inheritanceSource("owner", "a")!!.sourceState)
    }

    @Test fun `durable receipt wins over newer state and pending while changed same batch is rejected`() {
        val req = request()
        val result = service().sync("owner", "a", req)
        every { pending.findByUserIdAndAccountId("owner", "a") } returns
            StarPlanInheritancePending("owner:a", "owner", "a", "point", 5, req.scanId)
        assertEquals(result, service().sync("owner", "a", req))
        assertEquals(result, service().status("owner", "a", req.scanId))
        assertEquals(
            "star_sync_scan_conflict",
            assertThrows(InventoryApiException::class.java) {
                service().sync("owner", "a", req.copy(experience = req.experience.copy(orange = 1)))
            }.code,
        )
        assertEquals(
            "star_plan_inheritance_pending",
            assertThrows(InventoryApiException::class.java) {
                service().sync("owner", "a", request())
            }.code,
        )
        verify(exactly = 1) { states.rebuild(any(), any(), any()) }
        verify(exactly = 1) { receipts.insert(any<StarInventorySync>()) }
    }
}
