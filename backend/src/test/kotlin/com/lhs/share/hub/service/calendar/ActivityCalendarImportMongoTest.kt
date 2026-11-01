package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class ActivityCalendarImportMongoTest {
    private val database = TestMongo.database("cal_import")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = ActivityCalendarRepository(template)
    private val calendar = ActivityCalendarService(repository, RecruitmentCatalogRepository(template))
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val importer = ActivityCalendarImportService(calendar, repository, mapper)
    private val json = """[{"game":"如鸢","title":"活动","category":"ACTIVITY","start_date":"2026-10-10","end_date":"2026-10-20"}]"""

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `real Mongo concurrent imports retries audit date storage edits and disabled public behavior`() {
        val preview = importer.preview(json)
        assertEquals(0L, template.getCollection("activity_calendar_events").countDocuments())
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(4)
        try {
            val jobs = (1..4).map { actor ->
                executor.submit(
                    Callable {
                        start.await(10, TimeUnit.SECONDS)
                        try {
                            importer.commit("editor-$actor", json, preview.previewToken).created
                        } catch (
                            error: ActivityCalendarApiException,
                        ) {
                            assertEquals(409, error.status.value())
                            0
                        }
                    },
                )
            }
            start.countDown()
            assertEquals(1, jobs.sumOf { it.get(30, TimeUnit.SECONDS) })
        } finally {
            executor.shutdownNow()
        }
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
        val repeated = importer.preview(json)
        assertEquals(1, repeated.existing)
        assertEquals(0, importer.commit("retry", json, repeated.previewToken).created)
        val event = repository.list(null, null, null, emptySet(), null).single()
        assertEquals(0L, event.version)
        assertTrue(event.createdBy.startsWith("editor-"))
        assertEquals(event.createdBy, event.updatedBy)
        assertEquals("2026-10-10", template.getCollection("activity_calendar_events").find().first()!!["startDate"])
        assertEquals(1, calendar.publicItems(null, null, null, null).items.size)
        val data = repeated.rows.single().data!!
        calendar.update("disable", event.id, data.copy(expectedVersion = 0, enabled = false))
        assertTrue(calendar.publicItems(null, null, null, null).items.isEmpty())
        assertEquals(1, importer.preview(json).existing)
        calendar.update("edit", event.id, data.copy(expectedVersion = 1, title = "不同标题", enabled = false))
        assertEquals(1, importer.preview(json).conflicts)
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
    }

    @Test
    fun `legacy disabled activity skips while other game and next period coexist`() {
        val data = importer.preview(json).rows.single().data!!
        calendar.create("legacy", data.copy(enabled = false))
        assertEquals(1, importer.preview(json).existing)
        val anotherGame = json.replace("如鸢", "代号鸢")
        val anotherPeriod = json.replace("2026-10-10", "2026-11-10").replace("2026-10-20", "2026-11-20")
        for (source in listOf(anotherGame, anotherPeriod)) {
            assertEquals(1, importer.commit("importer", source, importer.preview(source).previewToken).created)
        }
        assertEquals(3L, template.getCollection("activity_calendar_events").countDocuments())
        assertEquals(2, calendar.publicItems(null, null, null, null).items.size)
    }

    @Test
    fun `real Mongo ongoing imports round trip and repeated omitted end dates skip existing`() {
        val open = json.replace("\"2026-10-20\"", "null")
        val preview = importer.preview(open)
        assertEquals(1, importer.commit("editor", open, preview.previewToken).created)
        val omitted = open.replace(",\"end_date\":null", "")
        val repeat = importer.preview(omitted)
        assertEquals(1, repeat.existing)
        assertEquals(0, importer.commit("editor", omitted, repeat.previewToken).created)
        val item = calendar.publicItems("如鸢", java.time.LocalDate.parse("2027-01-01"), null, null).items.single()
        assertEquals(null, item.endDate)
        assertEquals(null, item.endAt)
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
    }
}
