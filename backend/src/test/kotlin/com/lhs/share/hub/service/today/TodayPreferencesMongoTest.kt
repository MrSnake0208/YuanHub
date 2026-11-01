package com.lhs.share.hub.service.today

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.TodayPreferencesRepository
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors

@Tag("integration")
class TodayPreferencesMongoTest {
    private val database = TestMongo.database("today_preferences")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = TodayPreferencesRepository(template)
    private val service = TodayPreferencesService(repository)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `first create and later concurrent CAS each have exactly one winner`() {
        template.createCollection("hub_user_today_preferences")
        for (revision in 0L..1L) {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val results = executor.invokeAll(
                    listOf("training", "private_items").map { module ->
                        Callable {
                            barrier.await()
                            repository.replace("owner", "desktop", revision, listOf(module), Instant.now())
                        }
                    },
                ).map { it.get() }
                assertEquals(1, results.count { it != null })
                assertEquals(revision + 1, repository.find("owner", "desktop")!!.version)
                assertEquals(1L, template.getCollection("hub_user_today_preferences").countDocuments())
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `owner and layout records are independent and another same type device sees saved values`() {
        repository.replace("owner", "desktop", 0, listOf("private_items"), Instant.now())
        repository.replace("owner", "mobile", 0, listOf("training"), Instant.now())
        repository.replace("other", "desktop", 0, emptyList(), Instant.now())
        val anotherDevice = TodayPreferencesService(TodayPreferencesRepository(template))
        assertEquals(listOf("private_items"), anotherDevice.get("owner", "desktop").hiddenModules)
        assertEquals(listOf("training"), anotherDevice.get("owner", "mobile").hiddenModules)
        assertEquals(emptyList<String>(), anotherDevice.get("other", "desktop").hiddenModules)
        assertNull(repository.replace("stranger", "desktop", 1, emptyList(), Instant.now()))
        assertEquals(1L, service.get("owner", "mobile").version)
        assertEquals(3L, template.getCollection("hub_user_today_preferences").countDocuments())
        assertEquals(0L, template.getCollection("maa_user").countDocuments())
    }

    @Test
    fun `empty repeated reads stay pure and hiding all can be restored at the next revision`() {
        repeat(2) { assertEquals(0L, service.get("new", "desktop").version) }
        assertEquals(0L, template.getCollection("hub_user_today_preferences").countDocuments())
        val mapper = jacksonObjectMapper()
        val hidden = """
            {"schema_version":1,"expected_version":0,
             "hidden_modules":["highlights","checklist","activities","training","private_items"]}
        """.trimIndent()
        assertEquals(5, service.save("new", "desktop", mapper.readTree(hidden)).hiddenModules.size)
        val reset = """{"schema_version":1,"expected_version":1,"hidden_modules":[]}"""
        assertEquals(emptyList<String>(), service.save("new", "desktop", mapper.readTree(reset)).hiddenModules)
        assertEquals(0L, service.get("new", "mobile").version)
    }
}
