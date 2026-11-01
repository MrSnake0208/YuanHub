package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.request.CalendarCompletionRequest
import com.lhs.share.hub.controller.calendar.request.CalendarProgressRequest
import com.lhs.share.hub.controller.calendar.request.CalendarSubscribeRequest
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.ActivityCalendarSubscriptionRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubscription
import com.lhs.share.hub.repository.entity.CalendarChecklistEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class ActivityCalendarSubscriptionMongoTest {
    private val database = TestMongo.database("cal_subs")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val repository = ActivityCalendarSubscriptionRepository(mongo)
    private val events = ActivityCalendarRepository(mongo)
    private val calendar = ActivityCalendarService(events, RecruitmentCatalogRepository(mongo))
    private val accounts = mockk<SubAccountRepository>()
    private val accountWrites = SubAccountRepositoryImpl(mongo)
    private val tokens = mockk<OpenApiTokenService>(relaxed = true)
    private val now = Instant.parse("2026-10-05T04:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val service = ActivityCalendarSubscriptionService(repository, accounts, calendar, transaction, clock)
    private val lifecycle = SubAccountService(
        accountRepository = accounts, inventoryCurrentRepository = mockk(relaxed = true), inventoryRecordRepository = mockk(relaxed = true),
        inventoryDeletedRecordRepository = mockk(relaxed = true), favoriteRepository = mockk(relaxed = true),
        operatorCurrentRepository = mockk(relaxed = true), operatorRecordRepository = mockk(relaxed = true),
        operatorCorrectionRecordRepository = mockk(relaxed = true), operatorV3ImportRecordRepository = mockk(relaxed = true),
        operatorScanReviewRepository = mockk(relaxed = true), tokenService = tokens, transactionTemplate = transaction,
        calendarSubscriptions = repository,
    )
    private lateinit var eventId: String

    @BeforeEach
    fun setup() {
        listOf(SubAccount::class.java, ActivityCalendarEvent::class.java, ActivityCalendarSubscription::class.java).forEach { type ->
            mongo.createCollection(type)
            MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(type).forEach {
                mongo.indexOps(type).createIndex(it)
            }
        }
        mongo.insert(SubAccount(id = "account-doc", userId = "owner", accountId = "account", name = "大号", game = "如鸢"))
        mongo.insert(SubAccount(id = "other-doc", userId = "other", accountId = "other-account", name = "小号", game = "如鸢"))
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            mongo.findOne(
                Query(Criteria.where("userId").`is`(firstArg<String>()).and("accountId").`is`(secondArg<String>())),
                SubAccount::class.java,
            )
        }
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } answers
            { accountWrites.fenceRecruitmentWrite(firstArg(), secondArg(), thirdArg()) }
        every { accounts.deleteById(any()) } answers
            {
                mongo.remove(Query(Criteria.where("_id").`is`(firstArg<String>())), SubAccount::class.java)
                Unit
            }
        val day = LocalDate.parse("2026-10-05")
        eventId =
            calendar.create(
                "editor",
                ActivityCalendarWriteRequest("如鸢", "本期活动", ActivityCalendarCategory.ACTIVITY, day, day.plusDays(3)),
            ).item.id
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun concurrent(actions: List<() -> Any>): List<Result<Any>> {
        val executor = Executors.newFixedThreadPool(actions.size)
        val ready = CountDownLatch(actions.size)
        val start = CountDownLatch(1)
        try {
            val results = actions.map { action ->
                executor.submit(
                    Callable {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching(action)
                    },
                )
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            return results.map { it.get(20, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `manual completion Mongo CAS preserves drafts history and competing device updates`() {
        val subscribed = service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        val entries = listOf(CalendarChecklistEntry("stable", " 未勾选子项 ", false))
        val original = repository.find("owner", "account", eventId)!!
        val saved = repository.save(original.copy(checklist = entries, memoTitle = "本期目标", memoNote = "原样\n保留"))
        val version = saved.version!!
        val results = concurrent(
            listOf(
                { service.completion("owner", eventId, CalendarCompletionRequest("account", version, true)) },
                {
                    service.progress(
                        "owner",
                        eventId,
                        CalendarProgressRequest(
                            "account",
                            version,
                            false,
                            entries.map {
                                it.copy(completed = true)
                            },
                            progressMode = "checklist",
                        ),
                    )
                },
            ),
        )
        assertEquals(1, results.count { it.isSuccess })
        val winner = repository.find("owner", "account", eventId)!!
        assertEquals(version + 1, winner.version)
        assertEquals("原样\n保留", winner.memoNote)
        assertEquals(" 未勾选子项 ", winner.checklist.single().title)
        assertEquals(!winner.isCompleted(), winner.checklist.single().completed)
        val completed = service.completion("owner", eventId, CalendarCompletionRequest("account", winner.version!!, true))
        assertTrue(completed.completed)
        assertEquals(
            completed.version,
            service.completion("owner", eventId, CalendarCompletionRequest("account", completed.version, true)).version,
        )
        assertThrows(ActivityCalendarApiException::class.java) {
            service.completion("owner", eventId, CalendarCompletionRequest("account", subscribed.version, false))
        }
        assertThrows(ActivityCalendarApiException::class.java) {
            service.completion("other", eventId, CalendarCompletionRequest("account", completed.version, false))
        }
        val restored = service.completion("owner", eventId, CalendarCompletionRequest("account", completed.version, false))
        assertFalse(restored.completed)
        assertEquals(winner.checklist, restored.checklist)
    }

    @Test
    fun `unique index and concurrent subscription yield one record and owner isolation`() {
        val results = concurrent(List(2) { { service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true)) } })
        assertEquals(1, results.count { it.isSuccess })
        assertEquals(1L, mongo.count(Query(), ActivityCalendarSubscription::class.java))
        val saved = repository.find("owner", "account", eventId)!!
        assertThrows(DuplicateKeyException::class.java) { repository.save(saved.copy(id = "duplicate", version = null)) }
        assertNull(repository.find("other", "account", eventId))
        assertThrows(ActivityCalendarApiException::class.java) { service.get("other", "account", eventId) }
        assertEquals(0, service.list("other", "other-account", null, null, null).subscribedCount)
    }

    @Test
    fun `concurrent progress CAS cannot lose saved update and stale retry fails`() {
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        val results =
            concurrent(List(2) { { service.progress("owner", eventId, CalendarProgressRequest("account", 0, true, emptyList())) } })
        assertEquals(1, results.count { it.isSuccess })
        assertEquals(1L, repository.find("owner", "account", eventId)!!.version)
        assertFalse(repository.find("owner", "account", eventId)!!.isCompleted())
        assertTrue(repository.find("owner", "account", eventId)!!.completed)
        assertThrows(ActivityCalendarApiException::class.java) {
            service.progress("owner", eventId, CalendarProgressRequest("account", 0, false, emptyList()))
        }
    }

    @Test
    fun `failed save rolls back both subscription and account fence`() {
        val broken = spyk(repository)
        every { broken.save(any()) } answers {
            repository.save(firstArg())
            error("injected after write")
        }
        val failing = ActivityCalendarSubscriptionService(broken, accounts, calendar, transaction, clock)
        assertThrows(IllegalStateException::class.java) {
            failing.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        }
        assertNull(repository.find("owner", "account", eventId))
        assertEquals(0L, mongo.findById("account-doc", SubAccount::class.java)!!.recruitmentFence)
    }

    @Test
    fun `real account deletion cascades cancelled history and rolls back on later failure`() {
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", 0, false))
        every { tokens.revokeByAccount("owner", "account") } throws IllegalStateException("injected deletion failure")
        assertThrows(IllegalStateException::class.java) { lifecycle.delete("owner", "account") }
        assertNotNull(mongo.findById("account-doc", SubAccount::class.java))
        assertNotNull(repository.find("owner", "account", eventId))
        every { tokens.revokeByAccount("owner", "account") } returns Unit
        lifecycle.delete("owner", "account")
        assertNull(mongo.findById("account-doc", SubAccount::class.java))
        assertNull(repository.find("owner", "account", eventId))
    }

    @Test
    fun `delete and subscribe race never leave an orphan including after explicit delete retry`() {
        val results =
            concurrent(
                listOf({ service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true)) }, {
                    lifecycle.delete("owner", "account")
                    true
                }),
            )
        assertTrue(results.any { it.isSuccess })
        if (mongo.findById("account-doc", SubAccount::class.java) == null) {
            assertFalse(repository.exists("owner", "account"))
        } else {
            lifecycle.delete("owner", "account")
        }
        assertNull(mongo.findById("account-doc", SubAccount::class.java))
        assertFalse(repository.exists("owner", "account"))
        assertNotNull(mongo.findById("other-doc", SubAccount::class.java))
    }

    @Test
    fun `legacy Mongo without memo fields reads without writes and roundtrips with old client safely`() {
        val created = service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        val entries = listOf(CalendarChecklistEntry("legacy-one", "旧关卡", true), CalendarChecklistEntry("legacy-two", "旧兑换", false))
        service.progress("owner", eventId, CalendarProgressRequest("account", created.version, false, entries))
        val collection = mongo.getCollection("activity_calendar_subscriptions")
        val filter = Document("eventId", eventId)
        collection.updateOne(filter, Document("$" + "unset", Document("memoTitle", "").append("memoNote", "")))
        val before = collection.find(filter).first()!!
        val legacy = service.get("owner", "account", eventId)
        assertEquals("本期备忘", legacy.memoTitle)
        assertEquals("", legacy.memoNote)
        assertEquals(entries, legacy.checklist)
        assertFalse(legacy.completed)
        assertEquals(before, collection.find(filter).first())
        val updated = service.progress(
            "owner",
            eventId,
            CalendarProgressRequest("account", legacy.version, false, entries, "本期已完成", "备注\n保留"),
        )
        val oldClient = service.progress("owner", eventId, CalendarProgressRequest("account", updated.version, false, entries))
        assertEquals("本期已完成", oldClient.memoTitle)
        assertEquals("备注\n保留", oldClient.memoNote)
        val cancelled = service.subscribe("owner", eventId, CalendarSubscribeRequest("account", oldClient.version, false))
        val restored = service.subscribe("owner", eventId, CalendarSubscribeRequest("account", cancelled.version, true))
        assertEquals(entries, restored.checklist)
        assertEquals(updated.memoTitle, restored.memoTitle)
        assertEquals(updated.memoNote, service.get("owner", "account", eventId).memoNote)
    }

    @Test
    fun `memo CAS writes remain isolated by account and event and cannot overwrite winning memo`() {
        mongo.insert(SubAccount(id = "account-b-doc", userId = "owner", accountId = "account-b", name = "本人小号", game = "如鸢"))
        val otherEvent = calendar.create(
            "editor",
            ActivityCalendarWriteRequest(
                "如鸢",
                "另一活动",
                ActivityCalendarCategory.ACTIVITY,
                LocalDate.parse("2026-10-05"),
                LocalDate.parse("2026-10-08"),
            ),
        ).item.id
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        service.subscribe("owner", otherEvent, CalendarSubscribeRequest("account", null, true))
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account-b", null, true))
        val results = concurrent(
            (1..2).map { number ->
                {
                    service.progress(
                        "owner",
                        eventId,
                        CalendarProgressRequest(
                            "account",
                            0,
                            false,
                            emptyList(),
                            "标题$number",
                            "备注$number",
                            manualCompleted =
                            number == 1,
                        ),
                    )
                }
            },
        )
        assertEquals(1, results.count { it.isSuccess })
        val winner = results.single {
            it.isSuccess
        }.getOrThrow() as com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionResponse
        val saved = service.get("owner", "account", eventId)
        assertEquals(winner.memoTitle, saved.memoTitle)
        assertEquals(winner.memoNote, saved.memoNote)
        assertEquals(winner.manualCompleted, saved.manualCompleted)
        assertEquals(winner.manualCompleted == true, saved.completed)
        assertEquals(1L, saved.version)
        assertEquals("本期备忘", service.get("owner", "account", otherEvent).memoTitle)
        assertEquals("", service.get("owner", "account-b", eventId).memoNote)
        assertNull(service.get("owner", "account", otherEvent).manualCompleted)
        assertNull(service.get("owner", "account-b", eventId).manualCompleted)
        assertThrows(ActivityCalendarApiException::class.java) {
            service.progress("other", eventId, CalendarProgressRequest("account", saved.version, false, emptyList(), "越权"))
        }
        assertEquals(saved.memoTitle, service.get("owner", "account", eventId).memoTitle)
    }

    @Test
    fun `missing manual field reads legacy progress without writes and boolean overrides survive Mongo round trips`() {
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        val collection = mongo.getCollection("activity_calendar_subscriptions")
        val filter = Document("eventId", eventId)
        val done = listOf(CalendarChecklistEntry("stable-id", "旧待办", true))
        listOf(
            true to emptyList(),
            false to emptyList(),
            false to done,
            true to done.map {
                it.copy(completed = false)
            },
        ).forEach { (old, entries) ->
            val current = repository.find("owner", "account", eventId)!!
            repository.save(current.copy(completed = old, checklist = entries))
            collection.updateOne(filter, Document("$" + "unset", Document("manualCompleted", "")))
            val before = collection.find(filter).first()!!
            val legacy = service.get("owner", "account", eventId)
            val effective = false
            assertEquals(effective, legacy.completed)
            assertNull(legacy.manualCompleted)
            assertEquals(before, collection.find(filter).first())
            val memo = service.progress(
                "owner",
                eventId,
                CalendarProgressRequest("account", legacy.version, entries.isEmpty() && old, entries, memoNote = "只改备注"),
            )
            assertNull(memo.manualCompleted)
            assertEquals(effective, memo.completed)
            val frozen = service.progress(
                "owner",
                eventId,
                CalendarProgressRequest(
                    "account",
                    memo.version,
                    false,
                    done.map {
                        it.copy(completed = !effective)
                    },
                    manualCompleted = effective,
                ),
            )
            assertEquals(effective, frozen.completed)
            assertEquals(effective, collection.find(filter).first()!!.getBoolean("manualCompleted"))
            assertEquals(effective, service.get("owner", "account", eventId).completed)
            val oldClient = service.progress("owner", eventId, CalendarProgressRequest("account", frozen.version, !effective, emptyList()))
            assertFalse(oldClient.completed)
            assertEquals(effective, repository.find("owner", "account", eventId)!!.manualCompleted)
        }
    }

    @Test
    fun `checklist only CAS writes preserve legacy BSON and account event isolation`() {
        service.subscribe("owner", eventId, CalendarSubscribeRequest("account", null, true))
        listOf(true, false).forEach { manual ->
            val original = repository.find("owner", "account", eventId)!!
            val saved = repository.save(
                original.copy(completed = true, manualCompleted = manual, memoTitle = "旧标题", memoNote = "历史\n内容"),
            )
            val entries = listOf(CalendarChecklistEntry("stable", "事项", !manual))
            val result = service.progress(
                "owner",
                eventId,
                CalendarProgressRequest("account", saved.version!!, false, entries, progressMode = "checklist"),
            )
            assertEquals(manual, result.completed)
            val stored = repository.find("owner", "account", eventId)!!
            assertTrue(stored.completed)
            assertEquals(manual, stored.manualCompleted)
            assertEquals("旧标题", stored.memoTitle)
            assertEquals("历史\n内容", stored.memoNote)
            assertEquals(entries, stored.checklist)
            assertEquals(saved.version!! + 1, stored.version)
            assertThrows(ActivityCalendarApiException::class.java) {
                service.progress(
                    "owner",
                    eventId,
                    CalendarProgressRequest("account", saved.version!!, false, emptyList(), progressMode = "checklist"),
                )
            }
            assertEquals(entries, repository.find("owner", "account", eventId)!!.checklist)
            assertNull(repository.find("other", "account", eventId))
            val empty = service.progress(
                "owner",
                eventId,
                CalendarProgressRequest("account", result.version, false, emptyList(), progressMode = "checklist"),
            )
            assertEquals(manual, empty.completed)
            assertTrue(empty.legacyCompleted)
            assertEquals(manual, empty.manualCompleted)
        }
    }

    @Test
    fun `持续活动可订阅跨期查询并进入今日待办摘要`() {
        val day = LocalDate.parse("2026-10-05")
        val open = calendar.create(
            "editor",
            ActivityCalendarWriteRequest("如鸢", "持续活动", ActivityCalendarCategory.ACTIVITY, day.minusDays(1), null),
        ).item.id
        service.subscribe("owner", open, CalendarSubscribeRequest("account", null, true))
        val later = service.list("owner", "account", day.plusYears(1), day.plusYears(1).plusDays(1), null)
        assertEquals(listOf(open), later.items.map { it.eventId })
        assertEquals(1, later.subscribedCount)
        assertEquals(1, service.summary("owner", "account").totalPending)
        assertEquals(1, service.summary("owner", "account").subscribedCount)
        assertEquals(listOf(open), service.summary("owner", "account").items.map { it.eventId })
    }
}
