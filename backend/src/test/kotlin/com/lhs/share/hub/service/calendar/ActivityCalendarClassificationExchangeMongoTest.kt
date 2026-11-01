package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.spyk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class ActivityCalendarClassificationExchangeMongoTest {
    private val database = TestMongo.database("calclass")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val template = MongoTemplate(factory)
    private val repository = ActivityCalendarRepository(template)
    private val calendar = ActivityCalendarService(repository, RecruitmentCatalogRepository(template))
    private val transactions = TransactionTemplate(MongoTransactionManager(factory))
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val exchange = ActivityCalendarClassificationExchangeService(calendar, repository, mapper, transactions)
    private val request =
        ActivityCalendarWriteRequest(
            "如鸢",
            "资料",
            ActivityCalendarCategory.LOGIN,
            LocalDate.parse("2026-01-01"),
            enabled = false,
            sourceNote = "保留来源",
            description = "保留说明",
        )
    private val collection get() = template.getCollection("activity_calendar_events")
    private fun snapshot() = collection.find().sort(Document("_id", 1)).into(mutableListOf())
    private fun document(): ObjectNode = mapper.valueToTree(exchange.export())
    private fun target(document: ObjectNode, row: Int = 0, level1: String = "常驻", level2: String = "历练/洞窟") {
        (document["items"][row] as ObjectNode).putObject("classification").put("level1", level1).put("level2", level2)
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `full export exceeds old 200 rows round trips with references and no implicit rewrite`() {
        repeat(201) { calendar.create("creator", request.copy(title = "历史$it")) }
        template.insert(RecruitmentCatalogPool("pool", "如鸢", "卡池", request.startDate, request.startDate.plusDays(2), poolType = "限定"))
        val before = snapshot()
        val json = document()
        assertEquals(201, json["items"].size())
        assertEquals(1, json["reference_items"].size())
        val preview = exchange.preview(json.toString())
        assertEquals(201, preview.unchanged)
        assertEquals(0, preview.ready)
        assertEquals(0, exchange.commit("editor", json.toString(), preview.previewToken).updated)
        assertEquals(before, snapshot())
        target(json)
        val id = json["items"][0]["id"].asText()
        val subscriptions = template.getCollection("activity_calendar_subscriptions")
        val subscription = Document("_id", "subscription-fixture").append("eventId", id).append("userId", "subscriber")
        subscriptions.insertOne(subscription)
        val original = repository.find(id)!!
        (json["items"][0] as ObjectNode).putObject("original").put("title", "不得覆盖标题").put("enabled", true)
        val changed = exchange.preview(json.toString())
        assertEquals(1, changed.ready)
        assertEquals(1, exchange.commit("editor", json.toString(), changed.previewToken).updated)
        val updated = repository.find(id)!!
        assertEquals(ActivityCalendarSubtype.TRIAL_CAVE, updated.subtype)
        assertEquals(
            original.copy(
                category = updated.category,
                subtype = updated.subtype,
                subtypeDetail = updated.subtypeDetail,
                updatedBy = updated.updatedBy,
                updatedAt = updated.updatedAt,
                version = updated.version,
            ),
            updated,
        )
        assertEquals(1L, updated.version)
        assertEquals(201L, collection.countDocuments())
        assertEquals(subscription, subscriptions.find().first())
        assertEquals(201, exchange.preview(json.toString()).unchanged)
    }

    @Test
    fun `legacy trial and cave round trip without writes and explicit new targets use canonical code`() {
        val old = listOf(
            calendar.create(
                "creator",
                request.copy(category = ActivityCalendarCategory.ACTIVITY, subtype = ActivityCalendarSubtype.FURNITURE_TRIAL),
            ),
            calendar.create(
                "creator",
                request.copy(category = ActivityCalendarCategory.ACTIVITY, subtype = ActivityCalendarSubtype.MYSTERIOUS_CAVE),
            ),
            calendar.create(
                "creator",
                request.copy(
                    category = ActivityCalendarCategory.ACTIVITY,
                    subtype = ActivityCalendarSubtype.FURNITURE,
                    subtypeDetail = com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE,
                ),
            ),
        )
        val before = snapshot()
        val json = document()
        assertTrue(json["items"].all { it["classification"]["level2"].asText() == "历练/洞窟" })
        val unchanged = exchange.preview(json.toString())
        assertEquals(3, unchanged.unchanged)
        assertEquals(0, exchange.commit("editor", json.toString(), unchanged.previewToken).updated)
        assertEquals(before, snapshot())
        val oldDocument = document()
        oldDocument["items"].forEach { row ->
            val subtype = row["original"]["item"]["subtype"].asText()
            (row as ObjectNode).putObject("classification").put("level1", "家具")
                .put("level2", if (subtype == "FURNITURE_TRIAL") "历练" else "神秘洞窟")
        }
        val oldPreview = exchange.preview(oldDocument.toString())
        assertEquals(3, oldPreview.unchanged)
        assertEquals(0, exchange.commit("editor", oldDocument.toString(), oldPreview.previewToken).updated)
        assertEquals(before, snapshot())

        val fresh = calendar.create("creator", request.copy(title = "明确重新归类"))
        val update = document()
        update["items"].forEach { row ->
            if (row["id"].asText() == fresh.item.id) {
                (row as ObjectNode).putObject("classification").put("level1", "常驻").put("level2", "历练/洞窟")
            }
        }
        val preview = exchange.preview(update.toString())
        assertEquals(1, preview.ready)
        assertEquals(1, exchange.commit("editor", update.toString(), preview.previewToken).updated)
        assertEquals(ActivityCalendarSubtype.TRIAL_CAVE, repository.find(fresh.item.id)!!.subtype)
        val oldIds = old.map { it.item.id }.toSet()
        assertEquals(before, snapshot().filter { it.getString("_id") in oldIds })
        val reexport = exchange.export()
        assertTrue(reexport.items.all { it.classification?.level2 == "历练/洞窟" })
        assertEquals(4, exchange.preview(mapper.writeValueAsString(reexport)).unchanged)

        val historical = old.last()
        calendar.update(
            "editor",
            historical.item.id,
            request.copy(
                category = ActivityCalendarCategory.ACTIVITY,
                subtype = ActivityCalendarSubtype.TRIAL_CAVE,
                expectedVersion = 0,
            ),
        )
        assertEquals(ActivityCalendarSubtype.TRIAL_CAVE, repository.find(historical.item.id)!!.subtype)
        assertNull(repository.find(historical.item.id)!!.subtypeDetail)
    }

    @Test
    fun `invalid duplicate unknown readonly and stale versions never partially write`() {
        val created = calendar.create("creator", request)
        val json = document()
        target(json)
        val preview = exchange.preview(json.toString())
        calendar.update("another", created.item.id, request.copy(title = "更新标题", expectedVersion = 0))
        val before = snapshot()
        assertEquals(1, exchange.preview(json.toString()).conflicts)
        assertThrows(ActivityCalendarApiException::class.java) { exchange.commit("editor", json.toString(), preview.previewToken) }
        assertEquals(before, snapshot())
        val unknown = document()
        target(unknown)
        (unknown["items"][0] as ObjectNode).put("id", "recruitment:pool")
        assertEquals(1, exchange.preview(unknown.toString()).invalid)
        (unknown["items"][0] as ObjectNode).put("id", "missing")
        val invalid = exchange.preview(unknown.toString())
        assertEquals(1, invalid.invalid)
        assertThrows(ActivityCalendarApiException::class.java) { exchange.commit("editor", unknown.toString(), invalid.previewToken) }
        assertEquals(before, snapshot())
        val duplicate = document()
        target(duplicate)
        (duplicate["items"] as com.fasterxml.jackson.databind.node.ArrayNode).add(
            duplicate["items"][0].deepCopy<com.fasterxml.jackson.databind.JsonNode>(),
        )
        assertEquals(1, exchange.preview(duplicate.toString()).invalid)
        assertEquals(before, snapshot())
    }

    @Test
    fun `a failed second CAS rolls back the first classification and its audit`() {
        repeat(2) { calendar.create("creator", request.copy(title = "回滚$it")) }
        val spy = spyk(repository)
        var writes = 0
        every { spy.updateClassification(any(), any(), any(), any()) } answers { if (++writes == 2) false else callOriginal() }
        val failing = ActivityCalendarClassificationExchangeService(calendar, spy, mapper, transactions)
        val json = document()
        target(json, 0)
        target(json, 1)
        val preview = failing.preview(json.toString())
        val before = snapshot()
        assertThrows(ActivityCalendarApiException::class.java) { failing.commit("editor", json.toString(), preview.previewToken) }
        assertEquals(2, writes)
        assertEquals(before, snapshot())
    }

    @Test
    fun `missing historical version updates safely once and old preview cannot overwrite intervening edit`() {
        val created = calendar.create("creator", request)
        collection.updateOne(Document("_id", created.item.id), Document("\$unset", Document("version", "")))
        val json = document()
        target(json)
        assertEquals(0, json["items"][0]["expected_version"].asInt())
        val preview = exchange.preview(json.toString())
        assertEquals(1, preview.ready, preview.toString())
        assertEquals(preview, transactions.execute { exchange.preview(json.toString()) })
        assertEquals(1, exchange.commit("editor", json.toString(), preview.previewToken).updated)
        assertEquals(1L, repository.find(created.item.id)!!.version)
        assertEquals(0, exchange.preview(json.toString()).ready)
        val fresh = document()
        target(fresh, level1 = "其他", level2 = "其他")
        val stale = exchange.preview(fresh.toString())
        val now = repository.find(created.item.id)!!
        repository.save(now.copy(description = "并发新说明"))
        val error =
            assertThrows(ActivityCalendarApiException::class.java) { exchange.commit("editor", fresh.toString(), stale.previewToken) }
        assertEquals(409, error.status.value())
        assertEquals("并发新说明", repository.find(created.item.id)!!.description)
    }

    @Test
    fun `concurrent edit after first write aborts whole classification transaction`() {
        repeat(2) { calendar.create("creator", request.copy(title = "并发$it")) }
        val json = document()
        target(json, 0)
        target(json, 1)
        val secondId = json["items"][1]["id"].asText()
        val firstId = json["items"][0]["id"].asText()
        val firstBefore = repository.find(firstId)
        val written = CountDownLatch(1)
        val proceed = CountDownLatch(1)
        val spy = spyk(repository)
        var writes = 0
        every { spy.updateClassification(any(), any(), any(), any()) } answers {
            val result = callOriginal()
            if (++writes == 1) {
                written.countDown()
                check(proceed.await(15, TimeUnit.SECONDS))
            }
            result
        }
        val racing = ActivityCalendarClassificationExchangeService(calendar, spy, mapper, transactions)
        val preview = racing.preview(json.toString())
        val executor = Executors.newSingleThreadExecutor()
        try {
            val commit = executor.submit<Any> { racing.commit("editor", json.toString(), preview.previewToken) }
            assertTrue(written.await(15, TimeUnit.SECONDS))
            calendar.update("another", secondId, request.copy(description = "并发编辑保留", expectedVersion = 0))
            proceed.countDown()
            val error = assertThrows(ExecutionException::class.java) { commit.get(15, TimeUnit.SECONDS) }
            assertEquals(409, (error.cause as ActivityCalendarApiException).status.value())
            assertEquals(firstBefore, repository.find(firstId))
            assertEquals("并发编辑保留", repository.find(secondId)!!.description)
            assertNull(repository.find(secondId)!!.subtype)
        } finally {
            proceed.countDown()
            executor.shutdownNow()
        }
    }
}
