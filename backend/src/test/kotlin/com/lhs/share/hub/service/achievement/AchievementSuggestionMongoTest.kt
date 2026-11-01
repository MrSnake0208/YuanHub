package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionAcceptRequest
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionRejectRequest
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionSubmitRequest
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.AchievementSuggestionRepository
import com.lhs.share.hub.repository.entity.AchievementCandidate
import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.AchievementSuggestion
import com.lhs.share.hub.repository.entity.AchievementSuggestionStatus
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class AchievementSuggestionMongoTest {
    private val database = TestMongo.database("ach_suggest")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val repo = AchievementSuggestionRepository(mongo)
    private val catalogs = AchievementCatalogRepository(mongo)
    private val mapper = achievementMapper()
    private val catalogService = AchievementCatalogService(mapper, catalogs)
    private val admin = AchievementCatalogAdminService(catalogService, catalogs, mapper)
    private val auth = mockk<AdminAuthorizationService>()
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val service = AchievementSuggestionService(repo, catalogs, admin, auth, transaction)
    private val candidate = AchievementCandidate("如鸢", "cat_test", "投稿原稿", "条件")
    private val oldEntry = candidate.entry("yh_old", 0).copy(name = "旧成就", target = 10)
    private val published = CatalogContent("如鸢", "partial", "测试资料", listOf(CatalogCategory("cat_test", "分类")), listOf(oldEntry))

    @BeforeEach
    fun prepare() {
        every { auth.hasPermission(any(), any()) } returns true
        mongo.createCollection(AchievementSuggestion::class.java)
        mongo.createCollection(AchievementCatalog::class.java)
        MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(AchievementSuggestion::class.java).forEach {
            mongo.indexOps(AchievementSuggestion::class.java).createIndex(it)
        }
        catalogs.insert(
            AchievementCatalog(
                "如鸢",
                published = CatalogPublication("v1", published, Instant.EPOCH, "fixture"),
                draft = published.copy(entries = published.entries + candidate.entry("yh_unfinished", 1).copy(name = "")),
                issuedIds = setOf("yh_old", "yh_unfinished"),
                categoryIds = setOf("cat_test"),
                identities = mapOf("yh_old" to oldEntry),
            ),
        )
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }
    private fun submit(key: String = "key", actor: String = "owner") =
        service.submit(actor, AchievementSuggestionSubmitRequest(key, candidate, "https://example.com/source", "私人说明")).suggestion
    private fun accept(id: String, coordinator: AchievementSuggestionService = service, revision: Long = 0) =
        coordinator.accept("admin", id, AchievementSuggestionAcceptRequest(0, revision, candidate.copy(name = "审核修订"), "核实资料"))
    private fun rawSuggestions() = mongo.getCollection("achievement_suggestions").find().into(mutableListOf<Document>())
    private fun concurrent(actions: List<() -> Any>): List<Result<Any>> {
        val executor = Executors.newFixedThreadPool(actions.size)
        val start = CountDownLatch(1)
        return try {
            val pending = actions.map { action ->
                executor.submit(
                    Callable {
                        start.await()
                        runCatching(action)
                    },
                )
            }
            start.countDown()
            pending.map { it.get(30, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `unique idempotency race creates one owner submission and conflicting content cannot replace it`() {
        val results = concurrent(List(4) { { submit() } })
        assertTrue(results.all { it.isSuccess })
        assertEquals(1L, mongo.getCollection("achievement_suggestions").countDocuments())
        assertEquals(1, results.map { (it.getOrThrow() as AchievementSuggestion).id }.distinct().size)
        assertThrows(InventoryApiException::class.java) {
            service.submit(
                "owner",
                AchievementSuggestionSubmitRequest("key", candidate.copy(name = "不同"), "https://example.com/source", "私人说明"),
            )
        }
        assertNotEquals(submit().id, submit(actor = "other").id)
    }

    @Test
    fun `accept appends one complete draft preserves others publication identities and personal facts`() {
        val value = submit()
        val before = catalogs.find("如鸢")!!
        mongo.getCollection(
            "achievement_archives",
        ).insertOne(
            Document("_id", "personal").append("records", listOf(Document("achievementId", "yh_old").append("status", "completed"))),
        )
        val personal = mongo.getCollection("achievement_archives").find().first()
        val accepted = accept(value.id)
        val id = accepted.suggestion.achievementId!!
        assertFalse(accepted.currentlyPublished!!)
        assertEquals(id, accept(value.id).suggestion.achievementId)
        val after = catalogs.find("如鸢")!!
        assertEquals(before.draft.entries, after.draft.entries.dropLast(1))
        assertEquals(before.published, after.published)
        assertEquals(before.identities, after.identities)
        assertEquals(1L, after.revision)
        assertTrue(id in after.issuedIds)
        assertEquals("审核修订", after.draft.entries.last().name)
        assertEquals(value.original, repo.find(value.id)!!.original)
        assertEquals(1L, repo.find(value.id)!!.version)
        assertEquals(after.draft.entries.last(), accepted.suggestion.acceptedSnapshot)
        assertEquals(personal, mongo.getCollection("achievement_archives").find().first())
        assertTrue(admin.preview("如鸢", after.revision).errors.isNotEmpty())
        var view = admin.save(
            "如鸢",
            after.revision,
            after.draft.copy(
                entries = after.draft.entries.filter {
                    it.achievementId !=
                        "yh_unfinished"
                },
            ),
        )
        view = admin.publish("如鸢", view.revision, "publisher")
        assertTrue(service.detail("owner", value.id).currentlyPublished!!)
        view = admin.publish("如鸢", view.revision, "publisher", "v1")
        assertFalse(service.detail("owner", value.id).currentlyPublished!!)
        assertEquals(id, service.detail("owner", value.id).suggestion.achievementId)
        assertEquals(personal, mongo.getCollection("achievement_archives").find().first())
        assertTrue(id in catalogs.find("如鸢")!!.issuedIds)
        assertTrue(view.published.restoredFrom == "v1")
    }

    @Test
    fun `stale catalog revision and final review failure roll back draft id allocation and suggestion fence`() {
        val value = submit()
        val before = catalogs.raw("如鸢")
        val original = rawSuggestions()
        assertEquals(409, assertThrows(InventoryApiException::class.java) { accept(value.id, revision = 99) }.status.value())
        assertEquals(before, catalogs.raw("如鸢"))
        assertEquals(original, rawSuggestions())
        val failing = spyk(repo)
        every { failing.accept(any(), any(), any(), any(), any()) } throws IllegalStateException("injected audit failure")
        val coordinator = AchievementSuggestionService(failing, catalogs, admin, auth, transaction)
        assertThrows(IllegalStateException::class.java) { accept(value.id, coordinator) }
        assertEquals(before, catalogs.raw("如鸢"))
        assertEquals(original, rawSuggestions())
        val casFail = spyk(catalogs)
        every { casFail.replace(any(), any()) } returns false
        val casAdmin = AchievementCatalogAdminService(AchievementCatalogService(mapper, casFail), casFail, mapper)
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                accept(value.id, AchievementSuggestionService(repo, casFail, casAdmin, auth, transaction))
            }.status.value(),
        )
        assertEquals(before, catalogs.raw("如鸢"))
        assertEquals(original, rawSuggestions())
    }

    @Test
    fun `competing accepts allocate at most one stable id and cannot be rejected afterward`() {
        val value = submit()
        val results = concurrent(List(4) { { accept(value.id) } })
        assertTrue(results.any { it.isSuccess })
        results.filter { it.isFailure }.forEach { assertEquals(409, (it.exceptionOrNull() as InventoryApiException).status.value()) }
        val final = repo.find(value.id)!!
        assertEquals(AchievementSuggestionStatus.ACCEPTED, final.status)
        assertEquals(3, catalogs.find("如鸢")!!.draft.entries.size)
        assertEquals(1L, catalogs.find("如鸢")!!.revision)
        assertEquals(final.achievementId, accept(value.id).suggestion.achievementId)
        assertThrows(InventoryApiException::class.java) {
            service.reject("other-admin", value.id, AchievementSuggestionRejectRequest(1, "重复"))
        }
    }

    @Test
    fun `accept reject race has one terminal result and no orphan draft`() {
        val value = submit()
        val results =
            concurrent(
                listOf({
                    accept(value.id)
                }, { service.reject("reviewer", value.id, AchievementSuggestionRejectRequest(0, "重复条目")) }),
            )
        assertEquals(1, results.count { it.isSuccess })
        val final = repo.find(value.id)!!
        assertEquals(1L, final.version)
        assertEquals(if (final.status == AchievementSuggestionStatus.ACCEPTED) 3 else 2, catalogs.find("如鸢")!!.draft.entries.size)
        assertThrows(InventoryApiException::class.java) {
            service.reject("reviewer", value.id, AchievementSuggestionRejectRequest(0, "不能覆盖"))
        }
    }

    @Test
    fun `reads are owner scoped stably paginated and never seed catalogs`() {
        (1..5).forEach { submit("page-$it") }
        submit("other", "other")
        val before = rawSuggestions()
        val catalog = catalogs.raw("如鸢")
        val page1 = service.mine("owner", null, 1, 2)
        val page2 = service.mine("owner", null, 2, 2)
        assertEquals(5L, page1.total)
        assertTrue((page1.items + page2.items).all { it.suggestion.submitterId == "owner" })
        assertEquals(4, (page1.items + page2.items).map { it.suggestion.id }.distinct().size)
        repeat(2) {
            service.options("如鸢")
            service.queue("admin", "PENDING", "如鸢", 1, 20)
            service.reviewOptions("admin", "如鸢")
        }
        assertThrows(InventoryApiException::class.java) { service.options("代号鸢") }
        assertEquals(null, catalogs.raw("代号鸢"))
        assertEquals(before, rawSuggestions())
        assertEquals(catalog, catalogs.raw("如鸢"))
    }
}
