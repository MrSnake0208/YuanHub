package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import java.time.Instant
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Field-only share writes must not undo recruitment's lifecycle fence or resurrect deleted accounts. */
@Tag("integration")
class OperatorShareMongoTest {
    private val database = TestMongo.database("op_share")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = SubAccountRepositoryImpl(template)
    private val now = Instant.parse("2026-10-01T01:00:00Z")

    @BeforeEach
    fun setup() {
        template.createCollection(SubAccount::class.java)
        MongoPersistentEntityIndexResolver(template.converter.mappingContext).resolveIndexFor(SubAccount::class.java).forEach {
            template.indexOps(SubAccount::class.java).ensureIndex(it)
        }
        template.insert(SubAccount(userId = "u", accountId = "a", name = "A", game = "代号鸢", shareToken = "old-a"))
        template.insert(SubAccount(userId = "u", accountId = "b", name = "B", game = "如鸢", shareToken = "old-b"))
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun owner(accountId: String) = Query.query(Criteria.where("userId").`is`("u").and("accountId").`is`(accountId))

    @Test
    fun `tag consent persists with owner and stale scope CAS protection`() {
        val scopes = listOf("operator", "operator_tags", "star")
        val enabled = repository.updateShareAuthorization("u", "a", "old-a", null, "old-a", scopes, now)!!
        assertEquals(scopes, template.findOne(owner("a"), SubAccount::class.java)!!.shareScopes)
        assertNull(repository.updateShareAuthorization("foreign", "a", "old-a", scopes, "old-a", listOf("star"), now))
        assertNull(repository.updateShareAuthorization("u", "a", "old-a", null, "old-a", listOf("operator"), now))
        val closed = repository.updateShareAuthorization("u", "a", "old-a", enabled.shareScopes, "old-a", listOf("star"), now)!!
        assertEquals(listOf("star"), closed.shareScopes)
        assertNull(repository.updateShareAuthorization("u", "a", "old-a", scopes, "old-a", scopes, now))
        assertNull(template.findOne(owner("b"), SubAccount::class.java)!!.shareScopes)
    }

    @Test
    fun `simultaneous scope CAS writes have exactly one winner without changing another account`() {
        val barrier = CyclicBarrier(2)
        Executors.newFixedThreadPool(2).use { executor ->
            val attempts = listOf(listOf("operator", "star"), listOf("star")).map { scopes ->
                executor.submit<SubAccount?> {
                    barrier.await(10, TimeUnit.SECONDS)
                    repository.updateShareAuthorization("u", "a", "old-a", null, "old-a", scopes, now)
                }
            }
            val winners = attempts.mapNotNull { it.get(10, TimeUnit.SECONDS) }
            assertEquals(1, winners.size)
            assertEquals(winners.single().shareScopes, template.findOne(owner("a"), SubAccount::class.java)!!.shareScopes)
            assertEquals("old-b", template.findOne(owner("b"), SubAccount::class.java)!!.shareToken)
        }
    }

    @Test
    fun `scope CAS rejects stale scopes even when token is unchanged`() {
        val enabled = repository.updateShareAuthorization("u", "a", "old-a", null, "old-a", listOf("operator", "star"), now)!!
        assertEquals(listOf("operator", "star"), enabled.shareScopes)
        assertNull(repository.updateShareAuthorization("u", "a", "old-a", null, null, emptyList(), now))
        assertNull(repository.updateShareAuthorization("other", "a", "old-a", enabled.shareScopes, null, emptyList(), now))
        val starOnly = repository.updateShareAuthorization("u", "a", "old-a", enabled.shareScopes, "old-a", listOf("star"), now)!!
        assertEquals(listOf("star"), starOnly.shareScopes)
        assertNotNull(repository.updateShareAuthorization("u", "a", "old-a", starOnly.shareScopes, null, emptyList(), now))
        assertNull(template.findOne(owner("a"), SubAccount::class.java)!!.shareToken)
        template.remove(owner("a"), SubAccount::class.java)
        assertNull(repository.updateShareAuthorization("u", "a", null, emptyList(), "late", listOf("star"), now))
    }

    @Test
    fun `late share mutation preserves current game name and recruitment fence`() {
        val old = template.findOne(owner("a"), SubAccount::class.java)!!
        template.updateFirst(
            owner("a"),
            Update().set("game", "如鸢").set("name", "Renamed").set("recruitmentFence", 7L),
            SubAccount::class.java,
        )
        val updated = repository.updateShareToken("u", "a", old.shareToken, "new-a", now)!!
        assertEquals("如鸢", updated.game)
        assertEquals("Renamed", updated.name)
        assertEquals(7L, updated.recruitmentFence)
        assertEquals(old.id, updated.id)
        assertEquals(old.createdAt, updated.createdAt)
        assertEquals(now, updated.updatedAt)
        assertEquals("new-a", updated.shareToken)
        assertEquals("old-b", template.findOne(owner("b"), SubAccount::class.java)!!.shareToken)
    }

    @Test
    fun `share CAS is owner scoped and cannot upsert a deleted account`() {
        assertNull(repository.updateShareToken("foreign", "a", "old-a", "foreign-code", now))
        assertNotNull(repository.updateShareToken("u", "a", "old-a", "winner", now))
        assertNull(repository.updateShareToken("u", "a", "old-a", "stale", now))
        assertEquals("winner", template.findOne(owner("a"), SubAccount::class.java)!!.shareToken)
        template.remove(owner("a"), SubAccount::class.java)
        assertNull(repository.updateShareToken("u", "a", "winner", "late", now))
        assertNull(repository.updateShareToken("u", "a", null, "late-create", now))
        assertFalse(template.exists(owner("a"), SubAccount::class.java))
        assertNotNull(template.findOne(owner("b"), SubAccount::class.java))
    }

    @Test
    fun `revoking multiple accounts removes the sparse unique token field instead of indexing null`() {
        assertNotNull(repository.updateShareToken("u", "a", "old-a", null, now))
        assertNotNull(repository.updateShareToken("u", "b", "old-b", null, now))
        assertNull(template.findOne(owner("a"), SubAccount::class.java)!!.shareToken)
        assertNull(template.findOne(owner("b"), SubAccount::class.java)!!.shareToken)
        assertEquals(
            0L,
            template.getCollection("sub_accounts").countDocuments(org.bson.Document("shareToken", org.bson.Document("\$exists", true))),
        )
        assertNotNull(repository.updateShareToken("u", "a", null, "restored-a", now))
    }
}
