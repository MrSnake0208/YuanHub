package com.lhs.share.hub.service.battle

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.BattleDraftRepository
import com.lhs.share.hub.repository.entity.BattleDraft
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.http.HttpStatus
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class BattleDraftMongoTest {
    private val database = TestMongo.database("battledraft")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val mapper = ObjectMapper()
    private val owned = mapOf(("u1" to "a1") to "如鸢", ("u1" to "a2") to "代号鸢", ("u2" to "b1") to "如鸢")
    private val accounts = mockk<SubAccountService>().also { service ->
        every { service.requireAccount(any(), any()) } answers {
            val game = owned[firstArg<String>() to secondArg<String>()]
                ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
            SubAccount(userId = firstArg(), accountId = secondArg(), name = "n", game = game)
        }
    }
    private val service = BattleDraftService(BattleDraftRepository(mongo), accounts, mapper)

    @BeforeEach
    fun setup() {
        mongo.createCollection(BattleDraft::class.java)
        MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(BattleDraft::class.java).forEach {
            mongo.indexOps(BattleDraft::class.java).ensureIndex(it)
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun body(title: String, game: String = "如鸢", revision: Long? = null): ObjectNode = mapper.createObjectNode().also { body ->
        revision?.let { body.put("revision", it) }
        body.set<ObjectNode>(
            "draft",
            mapper.createObjectNode().put("title", title).put("author", "").put("game", game).put("note", "").also { draft ->
                draft.putArray("operators").also { list -> repeat(5) { list.addObject().put("name", "") } }
                draft.putArray("targets").also { list -> repeat(5) { list.add("") } }
                draft.putArray("rounds").addObject().put("remark", "").putArray("actions")
            },
        )
    }

    private fun code(block: () -> Unit) = assertThrows(InventoryApiException::class.java, block).code

    @Test
    fun `drafts are isolated by user and game account`() {
        val id = service.create("u1", "a1", body("甲"))["id"].asText()

        assertEquals("battle_draft_not_found", code { service.get("u2", "b1", id) })
        assertEquals("battle_draft_not_found", code { service.get("u1", "a2", id) })
        assertEquals("account_not_found", code { service.get("u2", "a1", id) })
        assertEquals("battle_draft_not_found", code { service.save("u2", "b1", id, body("改", revision = 1)) })
        assertEquals("battle_draft_not_found", code { service.delete("u1", "a2", id) })
        assertEquals(0, service.list("u2", "b1")["drafts"].size())
        assertEquals("甲", service.get("u1", "a1", id)["draft"]["title"].asText())
    }

    @Test
    fun `stale revision conflicts and keeps the newer content`() {
        val id = service.create("u1", "a1", body("初版"))["id"].asText()
        assertEquals(2, service.save("u1", "a1", id, body("设备甲", revision = 1))["revision"].asLong())

        assertEquals("battle_draft_revision_conflict", code { service.save("u1", "a1", id, body("设备乙", revision = 1)) })
        val list = service.list("u1", "a1")["drafts"]
        assertEquals("设备甲", list.single()["title"].asText())
        assertEquals("设备甲", service.get("u1", "a1", id)["draft"]["title"].asText())
    }

    @Test
    fun `draft game must match the account game`() {
        assertEquals("battle_draft_invalid", code { service.create("u1", "a1", body("错游戏", game = "代号鸢")) })
        assertEquals(0, service.list("u1", "a1")["drafts"].size())
    }

    @Test
    fun `concurrent creation never exceeds the per-account limit and freed slots are reusable`() {
        val executor = Executors.newFixedThreadPool(8)
        val barrier = CyclicBarrier(8)
        val results = try {
            (1..8).map {
                executor.submit(
                    Callable {
                        barrier.await(10, TimeUnit.SECONDS)
                        runCatching { service.create("u1", "a1", body("草稿$it")) }
                    },
                )
            }.map { it.get(30, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }

        assertEquals(BattleDraftService.LIMIT, results.count { it.isSuccess })
        results.filter { it.isFailure }.forEach { assertEquals("battle_draft_limit", (it.exceptionOrNull() as InventoryApiException).code) }
        val drafts = service.list("u1", "a1")["drafts"]
        assertEquals(BattleDraftService.LIMIT, drafts.size())
        assertEquals(0, service.create("u1", "a2", body("另一账号", game = "代号鸢"))["revision"].asLong() - 1)

        service.delete("u1", "a1", drafts[0]["id"].asText())
        assertEquals("补位", service.create("u1", "a1", body("补位"))["title"].asText())
        assertEquals("battle_draft_limit", code { service.create("u1", "a1", body("超出")) })
    }
}
