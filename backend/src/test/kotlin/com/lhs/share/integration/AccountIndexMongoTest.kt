package com.lhs.share.integration

import com.lhs.share.fixtures.TestFixtures
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class AccountIndexMongoTest {
    private val database = TestMongo.database("accounts")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)

    @BeforeEach
    fun indexesFromActualProductionEntity() {
        val resolver = MongoPersistentEntityIndexResolver(mongo.converter.mappingContext)
        resolver.resolveIndexFor(SubAccount::class.java).forEach { mongo.indexOps(SubAccount::class.java).ensureIndex(it) }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `zhuyu preference compare and set is scoped to owner account and game`() {
        mongo.insert(SubAccount(userId = "owner", accountId = "a", name = "A"))
        mongo.insert(SubAccount(userId = "owner", accountId = "b", name = "B"))
        mongo.insert(SubAccount(userId = "other", accountId = "a", name = "A"))
        val repository = SubAccountRepositoryImpl(mongo)
        assertEquals("baijinbi", repository.updateDailyZhuyuPreference("owner", "a", "代号鸢", null, "baijinbi")?.dailyZhuyuPreference)
        assertEquals(null, repository.updateDailyZhuyuPreference("owner", "a", "代号鸢", null, "zhuyu"))
        assertEquals(null, repository.updateDailyZhuyuPreference("owner", "a", "如鸢", "baijinbi", "zhuyu"))
        assertEquals(null, repository.updateDailyZhuyuPreference("intruder", "a", "代号鸢", null, "zhuyu"))
        assertEquals(
            null,
            mongo.findOne(
                Query(Criteria.where("userId").`is`("owner").and("accountId").`is`("b")),
                SubAccount::class.java,
            )!!.dailyZhuyuPreference,
        )
        assertEquals(
            null,
            mongo.findOne(
                Query(Criteria.where("userId").`is`("other").and("accountId").`is`("a")),
                SubAccount::class.java,
            )!!.dailyZhuyuPreference,
        )
        assertEquals("zhuyu", repository.updateDailyZhuyuPreference("owner", "a", "代号鸢", "baijinbi", "zhuyu")?.dailyZhuyuPreference)
    }

    @Test
    fun `game switch preserves old zhuyu preferences and rolls back atomically`() {
        mongo.insert(SubAccount(userId = "owner", accountId = "a", name = "A", dailyZhuyuPreference = "baijinbi"))
        mongo.insert(SubAccount(userId = "other", accountId = "a", name = "A", dailyZhuyuPreference = "zhuyu"))
        val repository = SubAccountRepositoryImpl(mongo)
        val transaction = TransactionTemplate(MongoTransactionManager(mongo.mongoDatabaseFactory))
        fun read(user: String) =
            mongo.findOne(Query(Criteria.where("userId").`is`(user).and("accountId").`is`("a")), SubAccount::class.java)!!
        fun switch(game: String, fail: Boolean = false) {
            transaction.executeWithoutResult {
                val account = read("owner")
                assertTrue(repository.fenceRecruitmentWrite("owner", "a", account.game))
                val preferences = account.dailyZhuyuPreferencesByGame.toMutableMap()
                account.dailyZhuyuPreference?.let { preferences[account.game] = it }
                repository.switchDailyZhuyuPreference("owner", "a", preferences, preferences[game])
                repository.updateDetails("owner", "a", account.name, game, java.time.Instant.EPOCH)
                if (fail) throw IllegalStateException("rollback")
            }
        }
        assertThrows(IllegalStateException::class.java) { switch("如鸢", true) }
        assertEquals("代号鸢", read("owner").game)
        assertEquals("baijinbi", read("owner").dailyZhuyuPreference)
        assertTrue(read("owner").dailyZhuyuPreferencesByGame.isEmpty())
        switch("如鸢")
        assertEquals(null, read("owner").dailyZhuyuPreference)
        assertEquals(null, repository.updateDailyZhuyuPreference("owner", "a", "代号鸢", "baijinbi", "zhuyu"))
        assertEquals("zhuyu", repository.updateDailyZhuyuPreference("owner", "a", "如鸢", null, "zhuyu")?.dailyZhuyuPreference)
        switch("代号鸢")
        assertEquals("baijinbi", read("owner").dailyZhuyuPreference)
        switch("如鸢")
        assertEquals("zhuyu", read("owner").dailyZhuyuPreference)
        assertEquals("zhuyu", read("other").dailyZhuyuPreference)
    }

    @Test
    fun `concurrent old game preference write cannot cross a game switch`() {
        mongo.insert(SubAccount(userId = "owner", accountId = "a", name = "A", dailyZhuyuPreference = "baijinbi"))
        val repository = SubAccountRepositoryImpl(mongo)
        val transaction = TransactionTemplate(MongoTransactionManager(mongo.mongoDatabaseFactory))
        val fenced = CountDownLatch(1)
        val finishSwitch = CountDownLatch(1)
        val workers = Executors.newFixedThreadPool(2)
        try {
            val switching = workers.submit {
                transaction.executeWithoutResult {
                    assertTrue(repository.fenceRecruitmentWrite("owner", "a", "代号鸢"))
                    fenced.countDown()
                    assertTrue(finishSwitch.await(10, TimeUnit.SECONDS))
                    repository.switchDailyZhuyuPreference("owner", "a", mapOf("代号鸢" to "baijinbi"), null)
                    repository.updateDetails("owner", "a", "A", "如鸢", java.time.Instant.EPOCH)
                }
            }
            assertTrue(fenced.await(10, TimeUnit.SECONDS))
            val writing = workers.submit<SubAccount?> {
                repository.updateDailyZhuyuPreference("owner", "a", "代号鸢", "baijinbi", "zhuyu")
            }
            finishSwitch.countDown()
            switching.get(20, TimeUnit.SECONDS)
            assertEquals(null, writing.get(20, TimeUnit.SECONDS))
            val account = mongo.findOne(Query(Criteria.where("userId").`is`("owner").and("accountId").`is`("a")), SubAccount::class.java)!!
            assertEquals("如鸢", account.game)
            assertEquals(null, account.dailyZhuyuPreference)
            assertEquals("baijinbi", account.dailyZhuyuPreferencesByGame["代号鸢"])
        } finally {
            finishSwitch.countDown()
            workers.shutdownNow()
        }
    }

    @Test
    fun `panel preference defaults on for legacy documents and updates only the owning account`() {
        mongo.getCollection("sub_accounts").insertMany(
            listOf(
                Document("userId", "owner").append("accountId", "a").append("name", "A"),
                Document("userId", "owner").append("accountId", "b").append("name", "B"),
                Document("userId", "other").append("accountId", "a").append("name", "A"),
            ),
        )
        fun read(user: String, account: String) = mongo.findOne(
            Query(Criteria.where("userId").`is`(user).and("accountId").`is`(account)),
            SubAccount::class.java,
        )!!
        assertTrue(read("owner", "a").operatorPanelAutoFill)
        val repository = SubAccountRepositoryImpl(mongo)
        repository.updateOperatorPanelAutoFill("owner", "a", false)
        repository.updateOperatorPanelAutoFill("intruder", "a", false)
        assertFalse(read("owner", "a").operatorPanelAutoFill)
        assertTrue(read("owner", "b").operatorPanelAutoFill)
        assertTrue(read("other", "a").operatorPanelAutoFill)
        repository.updateDetails("owner", "a", "Renamed", "代号鸢", java.time.Instant.EPOCH)
        assertFalse(read("owner", "a").operatorPanelAutoFill)
        assertEquals(3L, mongo.count(Query(), SubAccount::class.java))
    }

    @Test
    fun `same owner and name conflicts even across game versions under the current backend model`() {
        mongo.insert(TestFixtures.account())
        assertThrows(DuplicateKeyException::class.java) {
            mongo.insert(TestFixtures.account(accountId = "acc_test_b", game = "代号鸢"))
        }
        assertEquals(1L, mongo.count(Query(), SubAccount::class.java))
    }

    @Test
    fun `different owners may use the same name without leaking into an owner-scoped query`() {
        val a = TestFixtures.account()
        val b = TestFixtures.account(userId = TestFixtures.USER_B, accountId = "acc_test_b")
        mongo.insert(a)
        mongo.insert(b)
        assertEquals(
            listOf(a.accountId),
            mongo.find(Query(Criteria.where("userId").`is`(a.userId)), SubAccount::class.java).map {
                it.accountId
            },
        )
        assertEquals(
            listOf(b.accountId),
            mongo.find(Query(Criteria.where("userId").`is`(b.userId)), SubAccount::class.java).map {
                it.accountId
            },
        )
    }

    @Test
    fun `canonical account identity cannot be duplicated under another display name`() {
        val original = TestFixtures.account()
        mongo.insert(original)
        assertThrows(DuplicateKeyException::class.java) { mongo.insert(original.copy(id = "second-mongo-id", name = "不同名称")) }
        assertEquals(original, mongo.findById(original.id!!, SubAccount::class.java))
    }
}
