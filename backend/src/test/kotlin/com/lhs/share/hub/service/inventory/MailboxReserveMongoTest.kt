package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.repository.entity.WhiteCoinMail
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class MailboxReserveMongoTest {
    private val database = TestMongo.database("mailbox")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = SubAccountRepositoryImpl(template)
    private val reserve = MailboxReserve(listOf(WhiteCoinMail(20, 90)), 10, 1, Instant.parse("2026-10-22T00:00:00Z"))

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `legacy account persists replacement without touching stock and deletion cannot recreate account`() {
        template.getCollection("sub_accounts").insertOne(Document(mapOf("userId" to "owner", "accountId" to "a", "name" to "A")))
        val saved = repository.replaceMailboxReserve("owner", "a", 0, reserve)!!
        assertEquals(reserve, saved.mailboxReserve)
        assertEquals(reserve, template.findById(saved.id!!, SubAccount::class.java)!!.mailboxReserve)
        assertNull(repository.replaceMailboxReserve("owner", "a", 0, reserve))
        assertNull(repository.replaceMailboxReserve("stranger", "a", 1, reserve.copy(version = 2)))
        assertNull(repository.replaceMailboxReserve("owner", "b", 0, reserve))
        val cleared = reserve.copy(whiteCoinMails = emptyList(), fuChuanMailCount = 0, version = 2)
        assertEquals(cleared, repository.replaceMailboxReserve("owner", "a", 1, cleared)!!.mailboxReserve)
        template.remove(Query(Criteria.where("_id").`is`(saved.id)), SubAccount::class.java)
        assertNull(repository.replaceMailboxReserve("owner", "a", 2, reserve.copy(version = 3)))
        assertEquals(0L, template.getCollection("sub_accounts").countDocuments())
        assertEquals(0L, template.getCollection("inventory_current").countDocuments())
        assertEquals(0L, template.getCollection("inventory_records").countDocuments())
    }

    @Test
    fun `concurrent first and subsequent saves each have one winner and accounts stay independent`() {
        for ((user, account) in listOf("owner" to "a", "owner" to "b", "other" to "a")) {
            template.insert(SubAccount(userId = user, accountId = account, name = account))
        }
        for (version in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    (1..2).map { count ->
                        Callable {
                            barrier.await()
                            repository.replaceMailboxReserve(
                                "owner",
                                "a",
                                version,
                                reserve.copy(version = version + 1, fuChuanMailCount = count),
                            )
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it != null })
            } finally {
                executor.shutdownNow()
            }
        }
        assertEquals(reserve, repository.replaceMailboxReserve("owner", "b", 0, reserve)!!.mailboxReserve)
        assertEquals(reserve, repository.replaceMailboxReserve("other", "a", 0, reserve)!!.mailboxReserve)
        assertEquals(3L, template.getCollection("sub_accounts").countDocuments())
    }
}
