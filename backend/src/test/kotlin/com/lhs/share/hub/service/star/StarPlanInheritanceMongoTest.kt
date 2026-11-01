package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarInventorySyncCounts
import com.lhs.share.hub.controller.star.request.StarInventorySyncEntry
import com.lhs.share.hub.controller.star.request.StarInventorySyncExperience
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.controller.star.request.StarPlanInheritanceRequest
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarInventorySyncRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepositoryImpl
import com.lhs.share.hub.repository.StarPlanInheritancePendingRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarRecoveryPoint
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.http.HttpStatus
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Real repository/replica-set transactions, never developer or production databases. */
@Tag("integration")
class StarPlanInheritanceMongoTest {
    private val database = TestMongo.database("starsync")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val states = factory.getRepository(
        StarStateCurrentRepository::class.java,
        RepositoryFragments.just(StarStateCurrentRepositoryImpl(template)),
    )
    private val loadouts = factory.getRepository(
        StarLoadoutCurrentRepository::class.java,
        RepositoryFragments.just(StarLoadoutCurrentRepositoryImpl(template)),
    )
    private val accountsRepo = factory.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val points = factory.getRepository(StarRecoveryPointRepository::class.java)
    private val receipts = factory.getRepository(StarInventorySyncRepository::class.java)
    private val pending = factory.getRepository(StarPlanInheritancePendingRepository::class.java)
    private val accounts = mockk<SubAccountService>()
    private val operators = mockk<OperatorCurrentRepository>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val tx = TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory))
    private val stateService = StarStateService(states, points, loadouts, operators, accounts, tx)
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val account = SubAccount(userId = "owner", accountId = "a", name = "isolated", game = "如鸢")

    private fun service(records: StarInventorySyncRepository = receipts, state: StarStateService = stateService) = StarInventorySyncService(
        records, pending, points, accounts, accountsRepo, state, events, mapper, tx,
    )
    private fun request() = StarInventorySyncRequest(
        "maayuan-star-inventory",
        1,
        UUID.randomUUID().toString(),
        true,
        StarInventorySyncCounts(2, 1),
        listOf(
            StarInventorySyncEntry("main", "天府", "orange", 60),
            StarInventorySyncEntry("main", "天府", "orange", 60),
            StarInventorySyncEntry("support", "文曲", "purple", 20),
        ),
        StarInventorySyncExperience(0, 525, 91),
    )

    @BeforeEach fun setup() {
        listOf(
            "star_state_current",
            "star_loadout_current",
            "star_recovery_points",
            "star_inventory_syncs",
            "star_plan_inheritance_pending",
            "sub_accounts",
            "open_api_token",
        ).forEach {
            template.createCollection(it)
        }
        accountsRepo.insert(account)
        every { accounts.requireAccount(any(), any()) } answers {
            accountsRepo.findByUserIdAndAccountId(firstArg(), secondArg())
                ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        }
        every { operators.findByUserIdAndAccountIdOrderByUpdatedAtDesc(any(), any()) } returns emptyList()
    }

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun seed(plan: Boolean = true) {
        stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                0,
                0,
                listOf(StarInventoryEntryRequest("old", "main", "天府", "orange", 20)),
                if (plan) mapOf("old" to 60) else emptyMap(),
                StarWorkspaceExperienceRequest(7, 8, 9),
                StarWorkspaceBagRequest(1, 500),
            ),
        )
        // Preserve historical operator loadouts in the checkpoint, clear all in new state.
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
        loadouts.replaceForGeneration(
            "owner",
            "a",
            0,
            0,
            listOf(StarOperatorLoadout("op", StarLoadoutSlots(main1 = "old"))),
            java.time.Instant.now(),
        )
    }

    private fun preparePending(): StarPlanInheritanceRequest {
        seed()
        service().sync(
            "owner",
            "a",
            request().let {
                it.copy(
                    inventory = it.inventory.map { entry ->
                        if (entry.kind ==
                            "main"
                        ) {
                            entry.copy(level = 40)
                        } else {
                            entry
                        }
                    },
                )
            },
        )
        return command()
    }
    private fun command(): StarPlanInheritanceRequest {
        val current = stateService.current("owner", "a")
        val source = service().inheritanceSource("owner", "a")!!
        return StarPlanInheritanceRequest(
            UUID.randomUUID().toString(),
            source.sourceRecoveryPointId,
            current.generation,
            current.revision,
            mapOf(current.inventory.first { it.kind == "main" }.instanceId to 60),
        )
    }
    private fun editCurrent(orange: Int, plans: Map<String, Int> = emptyMap(), checkpoint: Boolean = false) {
        val current = stateService.current("owner", "a")
        stateService.patch(
            "owner",
            "a",
            StarStatePatchRequest(
                current.generation,
                current.revision,
                current.inventory.map { StarInventoryEntryRequest(it.instanceId, it.kind, it.name, it.quality, it.level) },
                plans,
                StarWorkspaceExperienceRequest(orange, 525, 91),
                StarWorkspaceBagRequest(3),
            ),
            recoveryReason = if (checkpoint) "import_data_safety" else null,
        )
    }

    @Test fun confirm_writes_only_plans_unlocks_unpins_and_replays_its_own_operation() {
        val request = preparePending()
        val before = stateService.current("owner", "a")
        val result = service().resolveInheritance("owner", "a", "confirm", request)
        val after = stateService.current("owner", "a")
        assertEquals(before.inventory, after.inventory)
        assertEquals(before.experience, after.experience)
        assertEquals(before.bag, after.bag)
        assertEquals(before.generation, after.generation)
        assertEquals(before.revision + 1, after.revision)
        assertEquals(request.planTargets, after.planTargets)
        assertEquals(null, service().inheritanceSource("owner", "a"))
        assertEquals(
            false,
            points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId)!!.inheritanceProtected,
        )
        assertEquals(result, service().resolveInheritance("owner", "a", "confirm", request))
        assertThrows(InventoryApiException::class.java) {
            service().resolveInheritance("owner", "a", "confirm", request.copy(planTargets = request.planTargets!!.mapValues { 50 }))
        }
        assertEquals(after, stateService.current("owner", "a"))
        assertThrows(InventoryApiException::class.java) {
            service().resolveInheritance("owner", "a", "confirm", request.copy(operationId = UUID.randomUUID().toString()))
        }
        val next = service().sync("owner", "a", this.request())
        assertEquals(after.generation + 1, next.generation)
        assertEquals(next.generation, service().inheritanceSource("owner", "a")!!.targetGeneration)
        assertThrows(InventoryApiException::class.java) { service().resolveInheritance("owner", "a", "confirm", request) }
    }

    @Test fun discard_preserves_backpack_plans_wear_and_revision_and_allows_next_scan() {
        preparePending()
        val id = stateService.current("owner", "a").inventory.first { it.kind == "main" }.instanceId
        editCurrent(10, mapOf(id to 50))
        val request = command().copy(planTargets = null)
        val before = stateService.current("owner", "a")
        val wear = loadouts.findByUserIdAndAccountId("owner", "a")
        val result = service().resolveInheritance("owner", "a", "discard", request)
        assertEquals(before, stateService.current("owner", "a"))
        assertEquals(wear, loadouts.findByUserIdAndAccountId("owner", "a"))
        assertEquals(before.revision, result.revision)
        assertEquals(null, service().inheritanceSource("owner", "a"))
        assertEquals(
            false,
            points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId)!!.inheritanceProtected,
        )
        assertEquals(before.generation + 1, service().sync("owner", "a", this.request()).generation)
    }

    @Test fun stale_revision_foreign_account_and_source_preserve_pending_and_protection() {
        val request = preparePending()
        editCurrent(2)
        val before = stateService.current("owner", "a")
        assertThrows(InventoryApiException::class.java) { service().resolveInheritance("owner", "a", "confirm", request) }
        val fresh = command()
        assertThrows(InventoryApiException::class.java) {
            service().resolveInheritance("owner", "a", "confirm", fresh.copy(sourceRecoveryPointId = "foreign"))
        }
        assertThrows(InventoryApiException::class.java) { service().inheritanceSource("other", "a") }
        accountsRepo.insert(SubAccount(userId = "other", accountId = "b", name = "other", game = "如鸢"))
        assertEquals(null, service().inheritanceSource("other", "b"))
        assertThrows(InventoryApiException::class.java) { service().resolveInheritance("other", "b", "confirm", fresh) }
        assertEquals(before, stateService.current("owner", "a"))
        assertEquals(null, pending.findByUserIdAndAccountId("owner", "a")!!.resolution)
        assertTrue(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId)!!.inheritanceProtected)
    }

    @Test fun changed_generation_cannot_confirm_or_discard_an_old_source() {
        val request = preparePending()
        val before = stateService.current("owner", "a")
        stateService.rebuild(
            "owner",
            "a",
            StarStateRebuildRequest(
                before.generation,
                before.revision,
                before.inventory.map { StarInventoryEntryRequest(it.instanceId, it.kind, it.name, it.quality, it.level) },
                emptyMap(),
                StarWorkspaceExperienceRequest(0, 525, 91),
                StarWorkspaceBagRequest(3),
                "import_data_safety",
            ),
        )
        val current = stateService.current("owner", "a")
        for (action in listOf("confirm", "discard")) {
            assertThrows(InventoryApiException::class.java) {
                service().resolveInheritance("owner", "a", action, if (action == "confirm") request else request.copy(planTargets = null))
            }
        }
        assertEquals(current, stateService.current("owner", "a"))
        assertEquals(null, pending.findByUserIdAndAccountId("owner", "a")!!.resolution)
        assertTrue(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId)!!.inheritanceProtected)
    }

    @Test fun failure_after_unpin_rolls_back_plans_resolution_and_protection_together() {
        val request = preparePending()
        val before = stateService.current("owner", "a")
        val failing = object : StarRecoveryPointRepository by points {
            override fun <S : StarRecoveryPoint> save(entity: S): S {
                val saved = points.save(entity)
                if (!entity.inheritanceProtected) throw IllegalStateException("injected unpin failure")
                return saved
            }
        }
        val broken = StarInventorySyncService(receipts, pending, failing, accounts, accountsRepo, stateService, events, mapper, tx)
        val error = assertThrows(IllegalStateException::class.java) { broken.resolveInheritance("owner", "a", "confirm", request) }
        assertEquals("injected unpin failure", error.message)
        assertEquals(before, stateService.current("owner", "a"))
        assertEquals(null, pending.findByUserIdAndAccountId("owner", "a")!!.resolution)
        assertTrue(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId)!!.inheritanceProtected)
    }

    @Test fun two_windows_have_exactly_one_successful_confirmation() {
        val request = preparePending()
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val jobs = (1..2).map {
                pool.submit(
                    Callable {
                        start.await()
                        runCatching {
                            service().resolveInheritance("owner", "a", "confirm", request.copy(operationId = UUID.randomUUID().toString()))
                        }
                    },
                )
            }
            start.countDown()
            val results = jobs.map { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.isSuccess })
            assertTrue(results.single { it.isFailure }.exceptionOrNull() is InventoryApiException)
            assertEquals(request.expectedRevision + 1, stateService.current("owner", "a").revision)
            assertEquals(request.planTargets, stateService.current("owner", "a").planTargets)
            assertEquals(null, service().inheritanceSource("owner", "a"))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun resolved_source_obeys_normal_retention_and_retry_survives_its_eviction() {
        preparePending()
        repeat(5) { editCurrent(it + 1, checkpoint = true) }
        assertEquals(4, points.count())
        val request = command().copy(planTargets = null)
        val result = service().resolveInheritance("owner", "a", "discard", request)
        assertEquals(3, points.count())
        assertEquals(null, points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", request.sourceRecoveryPointId))
        assertEquals(result, service().resolveInheritance("owner", "a", "discard", request))
        assertEquals(null, service().inheritanceSource("owner", "a"))
    }

    @Test fun invalid_instance_or_existing_current_plan_cannot_unlock_source() {
        val request = preparePending()
        assertThrows(InventoryApiException::class.java) {
            service().resolveInheritance("owner", "a", "confirm", request.copy(planTargets = mapOf("missing" to 60)))
        }
        val id = stateService.current("owner", "a").inventory.first { it.kind == "main" }.instanceId
        editCurrent(2, mapOf(id to 50))
        assertThrows(InventoryApiException::class.java) { service().resolveInheritance("owner", "a", "confirm", command()) }
        assertEquals(mapOf(id to 50), stateService.current("owner", "a").planTargets)
        assertEquals(null, pending.findByUserIdAndAccountId("owner", "a")!!.resolution)
    }

    @Test fun empty_confirmation_unlocks_without_incrementing_or_changing_current_state() {
        val request = preparePending().copy(planTargets = emptyMap())
        val before = stateService.current("owner", "a")
        val result = service().resolveInheritance("owner", "a", "confirm", request)
        assertEquals(before.revision, result.revision)
        assertEquals(before, stateService.current("owner", "a"))
        assertEquals(null, service().inheritanceSource("owner", "a"))
        assertEquals(before.generation + 1, service().sync("owner", "a", this.request()).generation)
        assertEquals(null, service().inheritanceSource("owner", "a"))
    }
}
