package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.star.StarStateController
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarInventorySyncCounts
import com.lhs.share.hub.controller.star.request.StarInventorySyncEntry
import com.lhs.share.hub.controller.star.request.StarInventorySyncExperience
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarStateRestoreRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.repository.OpenApiTokenRepository
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
import com.lhs.share.hub.repository.entity.OpenApiToken
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.StarInventorySync
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiPermission
import com.lhs.share.openapi.OpenApiStarInventorySyncController
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.openapi.TokenCacheData
import com.lhs.share.repository.RedisCache
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory
import org.springframework.context.annotation.Configuration
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.http.HttpStatus
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext
import org.springframework.web.servlet.DispatcherServlet
import org.springframework.web.servlet.config.annotation.EnableWebMvc
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.net.InetAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Real repository/replica-set transactions, never developer or production databases. */
@Tag("integration")
class StarInventorySyncMongoTest {
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
    private val stateService = StarStateService(states, points, pending, loadouts, operators, accounts, tx)
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
        // Preserve historical operator loadouts in the checkpoint; only exact attributes may inherit.
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

    @Test fun `unknown experience replaces old counts and round trips through BSON current API and retry`() {
        seed(plan = false)
        val syncs = service()
        val helper = mockk<AuthenticationHelper>()
        every { helper.requireUserId() } returns "owner"
        val controller = StarStateController(stateService, helper)
        val cases = listOf(
            StarInventorySyncExperience(0, null, 91),
            StarInventorySyncExperience(null, null, null),
        )
        for (experience in cases) {
            val expected = mapper.readTree(mapper.writeValueAsString(experience))
            val request = request().copy(experience = experience, bag = StarWorkspaceBagRequest(3, 270))
            val parsed = StarInventorySyncRequest.fromWire(mapper.readTree(mapper.writeValueAsString(request)))
            val receipt = syncs.sync("owner", "a", parsed)
            val stored = template.getCollection("star_state_current")
                .find(Document("_id", "owner:a")).first()!!
                .get("experience", Document::class.java)
            assertEquals(expected, mapper.readTree(stored.toJson()))
            val current = stateService.current("owner", "a")
            val api = mapper.readTree(mapper.writeValueAsString(controller.current("a")))
            assertEquals(expected, api["data"]["experience"])
            assertEquals(3, current.inventory.size)
            assertEquals(270, current.bag.capacity)
            val saved = receipts.findByUserIdAndAccountIdAndScanId("owner", "a", request.scanId)!!
            assertEquals(expected, mapper.readTree(saved.payload)["experience"])
            assertEquals(receipt, syncs.sync("owner", "a", parsed))
            assertEquals(receipt.generation, stateService.current("owner", "a").generation)
        }
    }

    @Test fun `optional bag capacity persists while legacy scans keep capacity unknown`() {
        val syncs = service()
        val req = request().copy(bag = StarWorkspaceBagRequest(3, 270))
        val first = syncs.sync("owner", "a", req)
        assertEquals(270, stateService.current("owner", "a").bag.capacity)
        assertEquals(3, stateService.current("owner", "a").bag.currentCount)
        assertEquals(first, syncs.sync("owner", "a", req))
        val legacy = syncs.sync("owner", "a", request())
        assertEquals(first.generation + 1, legacy.generation)
        assertEquals(null, stateService.current("owner", "a").bag.capacity)
        assertEquals(3, stateService.current("owner", "a").bag.currentCount)
        assertEquals(270, points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", legacy.recoveryPointId!!)!!.state.bag.capacity)
    }

    @Test fun `sync rebuilds distinct instances clears level mismatches and preserves a readable pinned plan source`() {
        seed()
        val syncs = service()
        val req = request()
        val result = syncs.sync("owner", "a", req)
        val state = stateService.current("owner", "a")
        assertEquals(1, state.generation)
        assertEquals(3, state.inventory.size)
        assertEquals(3, state.inventory.map { it.instanceId }.toSet().size)
        assertTrue(state.inventory.none { it.instanceId == "old" })
        assertEquals(2, state.inventory.count { it.name == "天府" && it.level == 60 })
        assertTrue(state.planTargets.isEmpty())
        assertEquals(0, state.experience.orange)
        assertEquals(525, state.experience.purple)
        assertEquals(91, state.experience.white)
        assertTrue(loadouts.findByUserIdAndAccountId("owner", "a")!!.loadouts.isEmpty())
        assertEquals(1, loadouts.findByUserIdAndAccountId("owner", "a")!!.generation)
        val source = syncs.inheritanceSource("owner", "a")!!
        assertEquals(result.recoveryPointId, source.sourceRecoveryPointId)
        assertEquals(listOf(StarStatePlanTarget("old", 60)), source.sourceState.planTargets)
        assertEquals(1, source.targetGeneration)
        val point = points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", source.sourceRecoveryPointId)!!
        assertTrue(point.inheritanceProtected)
        assertEquals("old", point.loadouts!!.single().slots.main1)
        assertEquals(result, syncs.sync("owner", "a", req))
        assertEquals(result, syncs.status("owner", "a", req.scanId))
        assertEquals(
            "star_sync_scan_conflict",
            assertThrows(InventoryApiException::class.java) {
                syncs.sync("owner", "a", req.copy(experience = req.experience.copy(orange = 9)))
            }.code,
        )
        assertEquals(
            "star_plan_inheritance_pending",
            assertThrows(InventoryApiException::class.java) {
                syncs.sync("owner", "a", request())
            }.code,
        )
        // Ordinary edits and more safety checkpoints cannot evict the pending source.
        repeat(4) {
            val current = stateService.current("owner", "a")
            stateService.patch(
                "owner",
                "a",
                StarStatePatchRequest(
                    current.generation,
                    current.revision,
                    current.inventory.map { StarInventoryEntryRequest(it.instanceId, it.kind, it.name, it.quality, it.level) },
                    emptyMap(),
                    StarWorkspaceExperienceRequest(it + 1, 525, 91),
                    StarWorkspaceBagRequest(3),
                ),
                recoveryReason = "import_data_safety",
            )
        }
        assertNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId("owner", "a", source.sourceRecoveryPointId))
        assertEquals(source, service().inheritanceSource("owner", "a"))
        assertEquals(result, service().sync("owner", "a", req)) // durable, not in-memory, even after edits
        assertEquals(4, points.count()) // three ordinary checkpoints plus the pinned source
    }

    @Test fun `web OCR and MaaYuan use the same wear inheritance while historical restore retains old IDs`() {
        seed()
        val req = request().let { it.copy(inventory = it.inventory.map { entry -> entry.copy(level = 20) }) }
        val web = stateService.rebuild(
            "owner",
            "a",
            StarStateRebuildRequest(
                0,
                1,
                req.inventory.mapIndexed { i, entry ->
                    StarInventoryEntryRequest("web-$i", entry.kind, entry.name, entry.quality, entry.level)
                },
                emptyMap(),
                StarWorkspaceExperienceRequest(0, 525, 91),
                StarWorkspaceBagRequest(3),
                "pre_ocr_rebuild",
            ),
        )
        assertEquals("web-0", web.loadout.loadouts["op"]?.get("main1"))
        assertEquals(1, web.state.generation)
        val restored = stateService.restore("owner", "a", web.recoveryPoint!!.recoveryPointId, StarStateRestoreRequest(1, 2))
        assertEquals("old", restored.loadout.loadouts["op"]?.get("main1"))
        val result = service().sync("owner", "a", req)
        val state = stateService.current("owner", "a")
        val wear = loadouts.findByUserIdAndAccountId("owner", "a")!!
        val assigned = wear.loadouts.single().slots.main1!!
        assertEquals(3, state.generation)
        assertEquals(state.generation, wear.generation)
        assertTrue(assigned != "old" && !assigned.startsWith("web-"))
        assertEquals(20, state.inventory.single { it.instanceId == assigned }.level)
        assertEquals(3, state.inventory.map { it.instanceId }.toSet().size)
        assertTrue(result.inheritancePending)
        assertEquals(listOf(StarStatePlanTarget("old", 60)), service().inheritanceSource("owner", "a")!!.sourceState.planTargets)
        assertEquals(result, service().sync("owner", "a", req))
        assertEquals(3, stateService.current("owner", "a").generation)
        verify(exactly = 1) { events.publishChange("owner", "a", "star_inventory_synced", any()) }
    }

    @Test fun `failure at receipt insert rolls back state pending inherited wear and checkpoint eviction`() {
        seed()
        repeat(3) {
            val current = stateService.current("owner", "a")
            stateService.patch(
                "owner",
                "a",
                StarStatePatchRequest(
                    current.generation,
                    current.revision,
                    listOf(StarInventoryEntryRequest("old", "main", "天府", "orange", 20)),
                    mapOf("old" to 60),
                    StarWorkspaceExperienceRequest(it, 0, 0),
                    StarWorkspaceBagRequest(1),
                ),
                recoveryReason = "import_data_safety",
            )
        }
        val old = states.findByUserIdAndAccountId("owner", "a")
        val oldPoints = points.findAll().map { it.id }.toSet()
        val oldWear = loadouts.findByUserIdAndAccountId("owner", "a")
        val broken = object : StarInventorySyncRepository by receipts {
            override fun <S : StarInventorySync> insert(entity: S): S = throw IllegalStateException("injected write failure")
        }
        val matching = request().let { it.copy(inventory = it.inventory.map { entry -> entry.copy(level = 20) }) }
        val failure = assertThrows(IllegalStateException::class.java) { service(broken).sync("owner", "a", matching) }
        assertEquals("injected write failure", failure.message)
        assertEquals(old, states.findByUserIdAndAccountId("owner", "a"))
        assertEquals(oldWear, loadouts.findByUserIdAndAccountId("owner", "a"))
        assertEquals(oldPoints, points.findAll().map { it.id }.toSet())
        assertEquals(0, pending.count())
        assertEquals(0, receipts.count())
    }

    @Test fun `concurrent duplicate requests commit one generation and are safely retryable`() {
        seed(plan = false)
        val req = request()
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val jobs = (1..2).map {
                pool.submit(
                    Callable {
                        start.await()
                        runCatching { service().sync("owner", "a", req) }
                    },
                )
            }
            start.countDown()
            val results = jobs.map { it.get(30, TimeUnit.SECONDS) }
            assertTrue(results.any { it.isSuccess })
            results.mapNotNull { it.exceptionOrNull() }.forEach { assertTrue(it is InventoryApiException) }
            val retry = service().sync("owner", "a", req)
            assertEquals(1, retry.generation)
            assertEquals(1, receipts.count())
            assertEquals(1, points.count())
            assertEquals(0, pending.count())
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `revision changed after observation rejects instead of silently overwriting`() {
        seed(plan = false)
        val observed = spyk(stateService)
        every { observed.current("owner", "a") } answers {
            val current = stateService.current("owner", "a")
            stateService.patch(
                "owner",
                "a",
                StarStatePatchRequest(
                    current.generation,
                    current.revision,
                    listOf(StarInventoryEntryRequest("old", "main", "天府", "orange", 21)),
                    emptyMap(),
                    StarWorkspaceExperienceRequest(0, 0, 0),
                    StarWorkspaceBagRequest(1),
                ),
            )
            current
        }
        assertThrows(InventoryApiException::class.java) { service(state = observed).sync("owner", "a", request()) }
        assertEquals(21, stateService.current("owner", "a").inventory.single().level)
        assertEquals(0, stateService.current("owner", "a").generation)
        assertEquals(0, receipts.count())
        assertEquals(0, points.count())
    }

    @Test fun `account isolation rejects wrong owner and scopes idempotency to bound account`() {
        val req = request()
        service().sync("owner", "a", req)
        accountsRepo.insert(SubAccount(userId = "other", accountId = "b", name = "other", game = "代号鸢"))
        assertThrows(InventoryApiException::class.java) { service().sync("other", "a", req) }
        assertThrows(InventoryApiException::class.java) { service().status("other", "b", req.scanId) }
        service().sync("other", "b", req)
        assertEquals(2, receipts.count())
        assertEquals(1, stateService.current("owner", "a").generation)
        assertEquals(1, stateService.current("other", "b").generation)
        assertTrue(
            stateService.current("owner", "a").inventory.map { it.instanceId }.toSet()
                .intersect(stateService.current("other", "b").inventory.map { it.instanceId }.toSet()).isEmpty(),
        )
    }

    @Test fun `HTTP server accepts actual sender payload and enforces real token scope and account`() {
        seed()
        val tokenRepo = factory.getRepository(OpenApiTokenRepository::class.java)
        tokenRepo.insert(
            OpenApiToken(
                id = "sync-fixture",
                userId = "owner",
                accountId = "a",
                token = "isolated-sync-token",
                scope = listOf(OpenApiPermission.STAR_SYNC_WRITE.code),
                remark = null,
            ),
        )
        tokenRepo.insert(
            OpenApiToken(
                id = "old-fixture",
                userId = "owner",
                accountId = "a",
                token = "isolated-old-token",
                // Retired legacy scope must remain rejected.
                scope = listOf(30002),
                remark = null,
            ),
        )
        val redis = mockk<RedisCache>()
        every { redis.getCache(any(), TokenCacheData::class.java) } returns null
        val tokens = OpenApiTokenService(tokenRepo, accountsRepo, redis, mockk<BetaService>(relaxed = true))
        val controller = OpenApiStarInventorySyncController(tokens, service())
        val factory = TomcatServletWebServerFactory(0).apply {
            address = InetAddress.getByName("127.0.0.1")
            setBaseDirectory(Files.createTempDirectory(Path.of("build"), "star-sync-tomcat-").toFile())
        }
        val app = AnnotationConfigWebApplicationContext().apply {
            addBeanFactoryPostProcessor {
                it.registerSingleton("syncController", controller)
                it.registerSingleton("inventoryAdvice", InventoryExceptionHandler())
                it.registerSingleton("syncObjectMapper", mapper)
            }
            register(SyncWebConfig::class.java)
        }
        val server = factory.getWebServer({ context ->
            context.addServlet("dispatcher", DispatcherServlet(app)).apply {
                addMapping("/")
                setLoadOnStartup(1)
            }
        })
        try {
            server.start()
            val base = "http://127.0.0.1:${server.port}"
            val http = HttpClient.newHttpClient()
            fun post(token: String, json: String) = http.send(
                HttpRequest.newBuilder(URI.create("$base/open-api/star/inventory-sync"))
                    .header("Authorization", "Bearer $token").header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json)).build(),
                HttpResponse.BodyHandlers.ofString(),
            )
            val json = mapper.writeValueAsString(request())
            assertEquals(403, post("isolated-old-token", json).statusCode())
            assertEquals(401, post("invalid-token", json).statusCode())
            val senderRoot = System.getenv("MAAYUAN_SYNC_TEST_ROOT")
            if (senderRoot != null) {
                // Opt-in cross-project client; without it this remains a standalone HTTP integration check.
                val root = Path.of(senderRoot).toAbsolutePath()
                val senderTemp = Files.createDirectories(root.resolve("debug/star-sync-review/tmp"))
                val builder = ProcessBuilder(
                    root.resolve(".venv/Scripts/python.exe").toString(),
                    "-B",
                    root.resolve("agent/tests/star_inventory_sync_e2e_client.py").toString(),
                    base,
                ).directory(root.toFile()).redirectErrorStream(true)
                builder.environment()["TEMP"] = senderTemp.toString()
                builder.environment()["TMP"] = senderTemp.toString()
                val process = builder.start()
                assertTrue(process.waitFor(45, TimeUnit.SECONDS), "MaaYuan HTTP client timeout")
                val output = process.inputStream.bufferedReader(Charsets.UTF_8).readText()
                assertEquals(0, process.exitValue(), output)
                assertTrue(output.contains("MAAYUAN_SYNC_E2E_OK"), output)
                val current = stateService.current("owner", "a")
                val fixture = Path.of(
                    System.getenv("MAAYUAN_SYNC_FIXTURE")
                        ?: root.resolve(".ux/audits/star-experience-ui-integration-20261031/gui-run/inventory.json").toString(),
                )
                val expected = mapper.readTree(Files.readString(fixture, Charsets.UTF_8))
                val qualities = mapOf("橙" to "orange", "紫" to "purple", "蓝" to "blue", "绿" to "green", "白" to "white")
                val expectedInstances = listOf("main", "support").flatMap { kind ->
                    expected["sections"][kind]["items"].map { item ->
                        listOf(kind, item["name"].asText(), qualities.getValue(item["quality"].asText()), item["level"].asText())
                    }
                }.groupingBy { it }.eachCount()
                val storedInstances = current.inventory.map { listOf(it.kind, it.name, it.quality, it.level.toString()) }
                    .groupingBy { it }.eachCount()
                assertEquals(expectedInstances, storedInstances)
                assertEquals(174, current.inventory.size)
                assertEquals(174, current.inventory.map { it.instanceId }.toSet().size)
                assertEquals(expected["experience"]["orangeCount"].asInt(), current.experience.orange)
                assertEquals(expected["experience"]["purpleCount"].asInt(), current.experience.purple)
                assertEquals(expected["experience"]["whiteCount"].asInt(), current.experience.white)
                println("MAAYUAN_SYNC_E2E_OK instances=174 main=69 support=105 exp=1/525/91 generation=1 same_batch_retry=ok")
            } else {
                val first = post("isolated-sync-token", json)
                assertEquals(200, first.statusCode(), first.body())
                assertEquals(first.body(), post("isolated-sync-token", json).body())
            }
            assertEquals(1, receipts.count())
            assertEquals(1, stateService.current("owner", "a").generation)
            assertTrue(loadouts.findByUserIdAndAccountId("owner", "a")!!.loadouts.isEmpty())
            assertNotNull(service().inheritanceSource("owner", "a"))
        } finally {
            server.stop()
            app.close()
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    class SyncWebConfig(private val mapper: ObjectMapper) : WebMvcConfigurer {
        override fun configureMessageConverters(converters: MutableList<HttpMessageConverter<*>>) {
            converters.add(MappingJackson2HttpMessageConverter(mapper))
        }
    }

    @Test fun `manual compact import commits once with preview scope and enforces account ownership`() {
        seed()
        val syncs = service()
        val req = request().copy(bag = StarWorkspaceBagRequest(3, 270))
        val preview = syncs.previewImport("owner", "a", req, StarInventoryImportScope("如鸢"))
        val scope = StarInventoryImportScope("如鸢", preview.generation, preview.revision)
        val receipt = syncs.importInventory("owner", "a", req, scope)
        val saved = stateService.current("owner", "a")
        assertEquals(3, saved.inventory.size)
        assertEquals(3, saved.inventory.map { it.instanceId }.toSet().size)
        assertEquals(270, saved.bag.capacity)
        assertEquals(525, saved.experience.purple)
        assertEquals(receipt, syncs.importInventory("owner", "a", req, scope))
        assertEquals(saved, stateService.current("owner", "a"))
        assertEquals(1, receipts.count())
        assertThrows(InventoryApiException::class.java) { syncs.importInventory("foreign", "a", req, scope) }
        assertThrows(InventoryApiException::class.java) { syncs.importInventory("owner", "foreign", req, scope) }
        assertEquals(saved, stateService.current("owner", "a"))
    }

    @Test fun `manual import receipt failure rolls back backpack wear pending source and checkpoint`() {
        seed()
        val old = states.findByUserIdAndAccountId("owner", "a")
        val oldWear = loadouts.findByUserIdAndAccountId("owner", "a")
        val oldPoints = points.findAll().map { it.id }.toSet()
        val req = request()
        val before = stateService.current("owner", "a")
        val broken = object : StarInventorySyncRepository by receipts {
            override fun <S : StarInventorySync> insert(entity: S): S = throw IllegalStateException("manual receipt failure")
        }
        assertThrows(IllegalStateException::class.java) {
            service(broken).importInventory("owner", "a", req, StarInventoryImportScope("如鸢", before.generation, before.revision))
        }
        assertEquals(old, states.findByUserIdAndAccountId("owner", "a"))
        assertEquals(oldWear, loadouts.findByUserIdAndAccountId("owner", "a"))
        assertEquals(oldPoints, points.findAll().map { it.id }.toSet())
        assertEquals(0, receipts.count())
        assertEquals(0, pending.count())
    }

    @Test fun `manual raw supplementation uses durable automatic receipt and preserves pinned plan and wear`() {
        seed()
        val req = request().copy(bag = StarWorkspaceBagRequest(3, 270))
        val automatic = service().sync("owner", "a", req)
        val before = stateService.current("owner", "a")
        val wear = loadouts.findByUserIdAndAccountId("owner", "a")
        val manual = req.copy(scanId = "22222222-2222-5222-8222-222222222222")
        val preview = service().previewImport("owner", "a", manual, StarInventoryImportScope("如鸢", raw = true))
        assertTrue(preview.alreadySynced)
        assertEquals(automatic, service().importInventory("owner", "a", manual, StarInventoryImportScope("如鸢", 0, 0, true)))
        assertEquals(before, stateService.current("owner", "a"))
        assertEquals(wear, loadouts.findByUserIdAndAccountId("owner", "a"))
        assertEquals(1, receipts.count())
        assertNotNull(service().inheritanceSource("owner", "a"))
        assertThrows(InventoryApiException::class.java) {
            service().importInventory(
                "owner",
                "a",
                manual.copy(experience = manual.experience.copy(orange = 4)),
                StarInventoryImportScope("如鸢", before.generation, before.revision, true),
            )
        }
        assertEquals(before, stateService.current("owner", "a"))
    }
}
