package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionAcceptRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionRejectRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionSubmitRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.ActivityCalendarSuggestionRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestion
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.spyk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
import java.time.LocalDate
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Uses only an owned disposable replica set. No development connection is accepted. */
@Tag("integration")
class ActivityCalendarSuggestionMongoTest {
    private val database = TestMongo.database("cal_suggest")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val template = MongoTemplate(factory)
    private val repository = ActivityCalendarSuggestionRepository(template)
    private val events = ActivityCalendarRepository(template)
    private val calendar = ActivityCalendarService(events, RecruitmentCatalogRepository(template))
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val service = ActivityCalendarSuggestionService(repository, calendar, events, transaction)
    private val day = LocalDate.parse("2026-10-03")
    private val event =
        ActivityCalendarWriteRequest(
            "如鸢",
            "原始标题",
            ActivityCalendarCategory.ACTIVITY,
            day,
            day.plusDays(2),
            sourceUrl = "https://example.com/source",
        )

    @BeforeEach
    fun prepare() {
        template.createCollection(ActivityCalendarEvent::class.java)
        template.createCollection(ActivityCalendarSuggestion::class.java)
        MongoPersistentEntityIndexResolver(
            template.converter.mappingContext,
        ).resolveIndexFor(ActivityCalendarSuggestion::class.java).forEach {
            template.indexOps(ActivityCalendarSuggestion::class.java).createIndex(it)
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun submit(actor: String = "owner", requestId: String = "request-one", game: String = "如鸢") =
        service.submit(actor, ActivityCalendarSuggestionSubmitRequest(event.copy(game = game), "私人备注", requestId))

    private fun accept(id: String, title: String = "审核标题") = service.accept(
        "editor",
        id,
        ActivityCalendarSuggestionAcceptRequest(0, event.copy(title = title, sourceNote = "管理备注", enabled = false), "已核对"),
    )

    private fun concurrent(actions: List<() -> Any>): List<Result<Any>> {
        val executor = Executors.newFixedThreadPool(actions.size)
        val ready = CountDownLatch(actions.size)
        val start = CountDownLatch(1)
        try {
            val futures = actions.map { action ->
                executor.submit(
                    Callable {
                        ready.countDown()
                        assertTrue(start.await(10, TimeUnit.SECONDS))
                        runCatching(action)
                    },
                )
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            return futures.map { it.get(20, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `unique concurrent retry creates one suggestion per owner and conflicts for changed material without public leakage`() {
        val results = concurrent(List(4) { { submit() } })
        assertTrue(results.all { it.isSuccess }, results.toString())
        assertEquals(
            1,
            results.map {
                (it.getOrThrow() as com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionResponse).id
            }.toSet().size,
        )
        assertEquals(1L, template.getCollection("activity_calendar_suggestions").countDocuments())
        val conflict = assertThrows(ActivityCalendarApiException::class.java) {
            service.submit("owner", ActivityCalendarSuggestionSubmitRequest(event.copy(title = "不同资料"), "私人备注", "request-one"))
        }
        assertEquals(409, conflict.status.value())
        submit("other")
        assertEquals(2L, template.getCollection("activity_calendar_suggestions").countDocuments())
        assertTrue(calendar.publicItems(null, null, null, null).items.isEmpty())
        assertEquals(0L, template.getCollection("activity_calendar_events").countDocuments())
    }

    @Test
    fun `accept commits exactly one enabled event retains originals ISO snapshot audit and retry ignores changed draft`() {
        val suggestion = submit()
        val before = repository.find(suggestion.id)!!
        val accepted = accept(suggestion.id)
        val duplicate = accept(suggestion.id, "重试不应用")
        assertEquals(accepted.eventId, duplicate.eventId)
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
        val stored = repository.find(suggestion.id)!!
        assertEquals(before.original, stored.original)
        assertEquals(before.submissionNote, stored.submissionNote)
        assertEquals(ActivityCalendarSuggestionStatus.ACCEPTED, stored.status)
        assertEquals(1L, stored.version)
        assertEquals("editor", stored.reviewedBy)
        assertEquals("审核标题", stored.acceptedSnapshot!!.title)
        assertEquals("editor", events.find(stored.eventId!!)!!.createdBy)
        assertTrue(events.find(stored.eventId!!)!!.enabled)
        val raw = template.getCollection("activity_calendar_suggestions").find(Document("_id", suggestion.id)).first()!!
        assertEquals("2026-10-03", (raw["original"] as Document)["startDate"])
        assertEquals("2026-10-03", (raw["acceptedSnapshot"] as Document)["startDate"])
        assertEquals("审核标题", calendar.publicItems(null, null, null, null).items.single().title)
        calendar.update("editor", stored.eventId!!, event.copy(title = "后续修改", enabled = false, expectedVersion = 0))
        val detail = service.detail("owner", suggestion.id, false)
        assertEquals("审核标题", detail.acceptedSnapshot!!.title)
        assertEquals("后续修改", detail.currentEvent!!.item.title)
        assertFalse(detail.currentEvent!!.enabled)
        assertEquals(ActivityCalendarSuggestionStatus.ACCEPTED, detail.status)
    }

    @Test
    fun `suggestion review write failure rolls back formal event and leaves pending original`() {
        val suggestion = submit()
        val failing = spyk(repository)
        every { failing.review(any(), any(), any(), any(), any(), any()) } throws IllegalStateException("injected suggestion write failure")
        val coordinator = ActivityCalendarSuggestionService(failing, calendar, events, transaction)
        assertThrows(IllegalStateException::class.java) {
            coordinator.accept("editor", suggestion.id, ActivityCalendarSuggestionAcceptRequest(0, event, null))
        }
        assertEquals(0L, template.getCollection("activity_calendar_events").countDocuments())
        assertEquals(ActivityCalendarSuggestionStatus.PENDING, repository.find(suggestion.id)!!.status)
        assertEquals(0L, repository.find(suggestion.id)!!.version)
    }

    @Test
    fun `event write failure after insert rolls back entire acceptance and creates no review`() {
        val suggestion = submit()
        val failing = spyk(events)
        every { failing.save(any()) } answers {
            events.save(firstArg())
            throw IllegalStateException("injected event write failure")
        }
        val coordinator =
            ActivityCalendarSuggestionService(
                repository,
                ActivityCalendarService(failing, RecruitmentCatalogRepository(template)),
                failing,
                transaction,
            )
        assertThrows(IllegalStateException::class.java) {
            coordinator.accept("editor", suggestion.id, ActivityCalendarSuggestionAcceptRequest(0, event, null))
        }
        assertEquals(0L, template.getCollection("activity_calendar_events").countDocuments())
        assertEquals(ActivityCalendarSuggestionStatus.PENDING, repository.find(suggestion.id)!!.status)
        assertEquals(null, repository.find(suggestion.id)!!.eventId)
    }

    @Test
    fun `simultaneous accept produces single event with one terminal result and stale reject cannot replace it`() {
        val suggestion = submit()
        val results = concurrent(List(4) { { accept(suggestion.id) } })
        assertTrue(results.any { it.isSuccess })
        results.filter { it.isFailure }.forEach { assertEquals(409, (it.exceptionOrNull() as ActivityCalendarApiException).status.value()) }
        val final = repository.find(suggestion.id)!!
        assertEquals(ActivityCalendarSuggestionStatus.ACCEPTED, final.status)
        assertEquals(1L, final.version)
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
        results.filter { it.isSuccess }.forEach {
            assertEquals(
                final.eventId,
                (it.getOrThrow() as com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionResponse).eventId,
            )
        }
        assertEquals(
            409,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.reject("other-editor", suggestion.id, ActivityCalendarSuggestionRejectRequest(1, "不采纳"))
            }.status.value(),
        )
    }

    @Test
    fun `accept reject race has one terminal decision with no orphan and rejected state is immutable`() {
        val suggestion = submit()
        val results = concurrent(
            listOf(
                { accept(suggestion.id) },
                { service.reject("other-editor", suggestion.id, ActivityCalendarSuggestionRejectRequest(0, "重复活动")) },
            ),
        )
        assertEquals(1, results.count { it.isSuccess })
        assertEquals(409, (results.single { it.isFailure }.exceptionOrNull() as ActivityCalendarApiException).status.value())
        val final = repository.find(suggestion.id)!!
        val count = template.getCollection("activity_calendar_events").countDocuments()
        assertEquals(if (final.status == ActivityCalendarSuggestionStatus.ACCEPTED) 1L else 0L, count)
        assertEquals(1L, final.version)
        val rejected = submit(requestId = "rejected")
        service.reject("editor", rejected.id, ActivityCalendarSuggestionRejectRequest(0, "需补充来源"))
        assertEquals(409, assertThrows(ActivityCalendarApiException::class.java) { accept(rejected.id) }.status.value())
    }

    @Test
    fun `stable pagination scopes owner status and game at tied timestamps and repeated reads preserve documents`() {
        val ids = (1..5).map { submit(requestId = "page-$it").id }
        ids.forEach { id ->
            template.updateFirst(
                org.springframework.data.mongodb.core.query.Query(
                    org.springframework.data.mongodb.core.query.Criteria.where("_id").`is`(id),
                ),
                org.springframework.data.mongodb.core.query.Update().set("createdAt", Instant.EPOCH),
                ActivityCalendarSuggestion::class.java,
            )
        }
        submit("other", "other", "代号鸢")
        service.reject("editor", ids.first(), ActivityCalendarSuggestionRejectRequest(0, "重复"))
        val before = template.getCollection("activity_calendar_suggestions").find().into(mutableListOf())
        assertEquals(ids.sortedDescending().take(2), service.mine("owner", null, 1, 2).items.map { it.id })
        assertEquals(ids.sortedDescending().drop(2).take(2), service.mine("owner", null, 2, 2).items.map { it.id })
        assertEquals(4L, service.mine("owner", "PENDING", 1, 20).total)
        assertEquals(ids.filter { it != ids.first() }.sorted(), service.queue("PENDING", "如鸢", 1, 20).items.map { it.id })
        assertTrue(service.mine("owner", null, 100, 20).items.isEmpty())
        assertEquals(
            404,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.detail("other", ids.first(), false)
            }.status.value(),
        )
        assertEquals(before, template.getCollection("activity_calendar_suggestions").find().into(mutableListOf()))
    }

    @Test
    fun `classification survives suggestion transaction original snapshot and public event without duplicating records`() {
        val classified = event.copy(
            subtype = ActivityCalendarSubtype.FURNITURE,
            subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE,
        )
        val suggestion = service.submit("owner", ActivityCalendarSuggestionSubmitRequest(classified, null, "classification"))
        val result = service.accept("editor", suggestion.id, ActivityCalendarSuggestionAcceptRequest(0, classified, null))
        val stored = repository.find(suggestion.id)!!
        assertEquals(ActivityCalendarSubtype.FURNITURE, stored.original.subtype)
        assertEquals(ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE, stored.original.subtypeDetail)
        assertEquals(classified.subtypeDetail, stored.acceptedSnapshot!!.subtypeDetail)
        assertEquals(classified.subtypeDetail, result.currentEvent!!.item.subtypeDetail)
        assertEquals(classified.subtypeDetail, calendar.publicItems(null, null, null, null).items.single().subtypeDetail)
        assertEquals(
            result.eventId,
            service.accept("editor", suggestion.id, ActivityCalendarSuggestionAcceptRequest(0, classified, null)).eventId,
        )
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
    }

    @Test
    fun `持续活动建议原资料与采纳快照保留空结束日期`() {
        val open = event.copy(endDate = null, startTime = "05:00")
        val submitted = service.submit("owner", ActivityCalendarSuggestionSubmitRequest(open, null, "ongoing-request"))
        val stored = repository.find(submitted.id)!!
        assertEquals(null, stored.original.endDate)
        val accepted = service.accept("editor", submitted.id, ActivityCalendarSuggestionAcceptRequest(0, open, null))
        val saved = repository.find(accepted.id)!!
        assertEquals(null, saved.acceptedSnapshot!!.endDate)
        assertEquals(null, events.find(saved.eventId!!)!!.endTime)
        assertEquals("05:00", saved.original.startTime)
    }
}
