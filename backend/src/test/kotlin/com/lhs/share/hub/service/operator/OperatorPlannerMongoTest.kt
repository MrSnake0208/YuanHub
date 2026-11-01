package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepositoryImpl
import com.lhs.share.hub.repository.OperatorPlannerImportRepository
import com.lhs.share.hub.repository.OperatorStaminaScheduleRepository
import com.lhs.share.hub.repository.OperatorStaminaScheduleRepositoryImpl
import com.lhs.share.hub.repository.OperatorTrainingWorkspaceRepository
import com.lhs.share.hub.repository.OperatorTrainingWorkspaceRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.OperatorTrainingWorkspace
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
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
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

/** Uses a unique disposable database only; never connects a repository to the application's databases. */
@Tag("integration")
class OperatorPlannerMongoTest {
    private val database = TestMongo.database("operator")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val factory = MongoRepositoryFactory(template)
    private val accounts = factory.getRepository(
        SubAccountRepository::class.java,
        org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments.just(SubAccountRepositoryImpl(template)),
    )
    private val workspaces = factory.getRepository(
        OperatorTrainingWorkspaceRepository::class.java,
        RepositoryFragments.just(OperatorTrainingWorkspaceRepositoryImpl(template)),
    )
    private val schedules = factory.getRepository(
        OperatorStaminaScheduleRepository::class.java,
        RepositoryFragments.just(OperatorStaminaScheduleRepositoryImpl(template)),
    )
    private val imports = factory.getRepository(OperatorPlannerImportRepository::class.java)
    private val annotations = factory.getRepository(
        OperatorAnnotationRepository::class.java,
        RepositoryFragments.just(OperatorAnnotationRepositoryImpl(template)),
    )
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val validator = OperatorPlannerValidator(mockk<OperatorCatalogService>(), mockk<EntityCatalogService>(), mapper)
    private val service =
        OperatorPlannerService(
            accounts, workspaces, schedules, imports, annotations, mockk<OperatorSubjectiveService>(), validator,
            mapper, mockk<AccountEventService>(relaxed = true), TransactionTemplate(MongoTransactionManager(template.mongoDatabaseFactory)),
        )

    @BeforeEach
    fun setup() {
        accounts.insert(SubAccount(userId = "owner", accountId = "account", name = "isolated test"))
        // Create collections outside a transaction, as on application startup.
        listOf("operator_training_workspace", "operator_stamina_schedule", "operator_planner_import").forEach {
            template.createCollection(it)
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `custom template CAS has one winner on first insert and update with main account isolation`() {
        val repository = com.lhs.share.hub.repository.OperatorCustomSpendTemplatesRepository(template)
        assertNull(repository.find("owner"))
        for (revision in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map { value ->
                        Callable {
                            barrier.await()
                            repository.replace("owner", revision, "{\"value\":$value}", java.time.Instant.now())
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it != null })
                assertEquals(revision + 1, repository.find("owner")?.revision)
                assertNull(repository.find("main-b"))
            } finally {
                executor.shutdownNow()
            }
        }
        assertNotNull(repository.replace("main-b", 0, "{}", java.time.Instant.now()))
        accounts.delete(accounts.findByUserIdAndAccountId("owner", "account")!!)
        assertEquals(2, repository.find("owner")?.revision)
        assertEquals(1, repository.find("main-b")?.revision)
    }

    @Test
    fun `concurrent first creates and subsequent updates each have exactly one winner`() {
        for (revision in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map { amount ->
                        Callable {
                            barrier.await()
                            runCatching {
                                val request = validator.emptyWorkspace().put("expected_revision", revision)
                                request.set<ObjectNode>(
                                    "stamina_sources",
                                    mapper.readTree(
                                        """{"monthly_card":{"tier":"custom","daily_enabled":true,"shop_enabled":false,
                                            "daily_amount":$amount,"shop_amount":20,"start_date":"","end_date":""},
                                            "fixed_sources":[]}""",
                                    ) as ObjectNode,
                                )
                                service.putWorkspace("owner", "account", request)
                            }
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it.isSuccess })
                assertEquals(
                    OperatorPlannerService.WORKSPACE_CONFLICT,
                    (
                        results.single {
                            it.isFailure
                        }.exceptionOrNull() as OperatorApiException
                        ).code,
                )
                assertEquals(revision + 1, workspaces.findByUserIdAndAccountId("owner", "account")!!.revision)
                val winner = results.single { it.isSuccess }.getOrThrow().path("stamina_sources")
                assertEquals(winner, service.workspace("owner", "account").path("stamina_sources"))
                assertEquals(1, template.count(org.springframework.data.mongodb.core.query.Query(), OperatorTrainingWorkspace::class.java))
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `a schedule revision failure rolls back an inserted workspace in a real Mongo transaction`() {
        val request = mapper.createObjectNode().put("migration_id", "rollback")
        request.set<ObjectNode>("workspace", validator.emptyWorkspace().put("expected_revision", 0))
        request.set<ObjectNode>(
            "schedules",
            mapper.createObjectNode().set<ObjectNode>("favorites", validator.emptySchedule().put("expected_revision", 7)),
        )
        assertThrows(OperatorApiException::class.java) { service.importLocal("owner", "account", request) }
        assertNull(workspaces.findByUserIdAndAccountId("owner", "account"))
        assertNull(imports.findByUserIdAndAccountIdAndMigrationId("owner", "account", "rollback"))
        (request.path("schedules").path("favorites") as ObjectNode).put("expected_revision", 0)
        val imported = service.importLocal("owner", "account", request)
        assertEquals(imported.toString(), service.importLocal("owner", "account", request).toString())
        assertNotNull(workspaces.findByUserIdAndAccountId("owner", "account"))
        assertNotNull(schedules.findByUserIdAndAccountIdAndPlanId("owner", "account", "favorites"))
        assertNotNull(imports.findByUserIdAndAccountIdAndMigrationId("owner", "account", "rollback"))
    }
}
