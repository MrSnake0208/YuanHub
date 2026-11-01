package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequest
import com.lhs.share.hub.repository.CalendarPrivateItemRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.CalendarPrivateItem
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
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
import java.time.LocalDate
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class CalendarPrivateItemMongoTest {
    private val database = TestMongo.database("cal_private")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val repository = CalendarPrivateItemRepository(mongo)
    private val accounts = mockk<SubAccountRepository>()
    private val accountWrites = SubAccountRepositoryImpl(mongo)
    private val tokens = mockk<OpenApiTokenService>(relaxed = true)
    private val service = CalendarPrivateItemService(repository, accounts, transaction)
    private val day = LocalDate.parse("2026-10-15")
    private fun request(account: String = "a") = CalendarPrivateItemRequest(account, "领取奖励", day, "23:59", "私人说明", null)
    private val lifecycle = SubAccountService(
        accountRepository = accounts, inventoryCurrentRepository = mockk(relaxed = true), inventoryRecordRepository = mockk(relaxed = true),
        inventoryDeletedRecordRepository = mockk(relaxed = true), favoriteRepository = mockk(relaxed = true),
        operatorCurrentRepository = mockk(relaxed = true), operatorRecordRepository = mockk(relaxed = true),
        operatorCorrectionRecordRepository = mockk(relaxed = true), operatorV3ImportRecordRepository = mockk(relaxed = true),
        operatorScanReviewRepository = mockk(relaxed = true), tokenService = tokens, transactionTemplate = transaction,
        calendarPrivateItems = repository,
    )

    @BeforeEach
    fun setup() {
        listOf(SubAccount::class.java, CalendarPrivateItem::class.java).forEach { type ->
            mongo.createCollection(type)
            MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(type).forEach {
                mongo.indexOps(type).createIndex(it)
            }
        }
        listOf(
            SubAccount(id = "doc-a", userId = "owner", accountId = "a", name = "大号", game = "如鸢"),
            SubAccount(id = "doc-b", userId = "owner", accountId = "b", name = "小号", game = "代号鸢"),
            SubAccount(id = "doc-other", userId = "other", accountId = "c", name = "别人", game = "如鸢"),
        ).forEach { mongo.insert(it) }
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
        every { accounts.updateDetails(any(), any(), any(), any(), any()) } answers {
            accountWrites.updateDetails(firstArg(), secondArg(), thirdArg(), arg(3), arg(4))
        }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `monthly recurrence persists exceptions across reads with owner isolation and stale version rejection`() {
        val start = LocalDate.parse("2026-01-31")
        val created = service.create(
            "owner",
            request().copy(date = start, endDate = start.plusDays(2), recurrence = "MONTHLY", reminderOn = "START", reminderDaysBefore = 1),
        )
        service.create("owner", request("b").copy(date = start, recurrence = "MONTHLY"))
        service.create("other", request("c").copy(date = start, recurrence = "MONTHLY"))
        val from = LocalDate.parse("2026-02-28")
        val to = LocalDate.parse("2026-04-01")
        val listed = service.list("owner", "a", from, to).items
        assertEquals(listOf(from, LocalDate.parse("2026-03-31")), listed.map { it.occurrenceDate })
        assertTrue(listed.all { it.id == created.id && it.reminderOn == "START" && it.reminderDaysBefore == 1 })
        assertEquals(LocalDate.parse("2026-03-02"), listed.first().endDate)
        val count = mongo.getCollection("activity_calendar_private_items").countDocuments()
        assertEquals(3L, count)
        service.delete("owner", "a", created.id, created.version, from)
        val reread = CalendarPrivateItemService(CalendarPrivateItemRepository(mongo), accounts, transaction)
        assertEquals(listOf(LocalDate.parse("2026-03-31")), reread.list("owner", "a", from, to).items.map { it.occurrenceDate })
        assertEquals(setOf(from), repository.find("owner", "a", "如鸢", created.id)!!.excludedDates)
        assertEquals(count, mongo.getCollection("activity_calendar_private_items").countDocuments())
        assertEquals(
            409,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.delete("owner", "a", created.id, 0, LocalDate.parse("2026-03-31"))
            }.status.value(),
        )
        assertEquals(
            404,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.delete("owner", "b", created.id, 1, from)
            }.status.value(),
        )
        assertEquals(
            404,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.delete("other", "c", created.id, 1, from)
            }.status.value(),
        )
        val current = service.get("owner", "a", created.id)
        service.delete("owner", "a", created.id, current.version)
        assertTrue(service.list("owner", "a", from, to).items.isEmpty())
        assertEquals(2L, mongo.getCollection("activity_calendar_private_items").countDocuments())
        val legacy = service.create("owner", request())
        mongo.getCollection("activity_calendar_private_items").updateOne(
            org.bson.Document("_id", legacy.id),
            org.bson.Document("\$unset", org.bson.Document("recurrence", "").append("excludedDates", "")),
        )
        assertEquals("NONE", service.get("owner", "a", legacy.id).recurrence)
        assertEquals(listOf(legacy.id), service.list("owner", "a", day, day).items.map { it.id })
        service.update("owner", legacy.id, request().copy(expectedVersion = legacy.version))
        service.delete("owner", "a", legacy.id, legacy.version + 1)
    }

    @Test
    fun `real persistence bounded range owner indexes and duplicate id are isolated from public data`() {
        val a = service.create("owner", request())
        val b = service.create("owner", request("b").copy(time = null))
        val c = service.create("other", request("c"))
        service.create("owner", request().copy(date = day.plusDays(1), title = "明天"))
        assertEquals(listOf(a.id), service.list("owner", "a", day, day).items.map { it.id })
        assertEquals(listOf(b.id), service.list("owner", "b", day, day).items.map { it.id })
        assertEquals(listOf(c.id), service.list("other", "c", day, day).items.map { it.id })
        assertEquals(a, service.get("owner", "a", a.id))
        val before = mongo.getCollection("activity_calendar_private_items").find().into(mutableListOf())
        service.list("owner", "a", day, day.plusDays(1))
        assertEquals(before, mongo.getCollection("activity_calendar_private_items").find().into(mutableListOf()))
        assertTrue(mongo.indexOps(CalendarPrivateItem::class.java).indexInfo.any { it.name == "calendar_private_owner_date" })
        assertThrows(DuplicateKeyException::class.java) { mongo.insert(repository.find("owner", "a", "如鸢", a.id)!!) }
        assertFalse(mongo.collectionExists("activity_calendar_events"))
        assertFalse(mongo.collectionExists("activity_calendar_subscriptions"))
        assertFalse(mongo.collectionExists("activity_calendar_suggestions"))
        assertEquals(2, service.list("owner", "a", day, day.plusDays(1)).items.size)
    }

    @Test
    fun `reminders persist preserve old clients and historical documents while retaining CAS and isolation`() {
        val configured = request().copy(reminderOn = "END", reminderDaysBefore = 1, endDate = day.plusDays(5))
        val created = service.create("owner", configured)
        assertEquals("END", service.get("owner", "a", created.id).reminderOn)
        assertEquals(1, service.list("owner", "a", day, day).items.single().reminderDaysBefore)
        val legacy = service.update("owner", created.id, request().copy(endDate = day.plusDays(6), expectedVersion = 0))
        assertEquals("END", legacy.reminderOn)
        assertEquals(1, legacy.reminderDaysBefore)
        assertEquals(
            409,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.update("owner", created.id, configured.copy(expectedVersion = 0, reminderOnProvided = true))
            }.status.value(),
        )
        assertEquals(
            404,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.get("other", "c", created.id)
            }.status.value(),
        )
        val disabled = service.update(
            "owner",
            created.id,
            request().copy(endDate = day.plusDays(6), expectedVersion = 1, reminderOnProvided = true),
        )
        assertNull(disabled.reminderOn)
        mongo.getCollection("activity_calendar_private_items").updateOne(
            org.bson.Document("_id", created.id),
            org.bson.Document("\$unset", org.bson.Document("reminderOn", "").append("reminderDaysBefore", "")),
        )
        val before = mongo.getCollection("activity_calendar_private_items").find().first()
        val historical = service.get("owner", "a", created.id)
        assertNull(historical.reminderOn)
        assertEquals(0, historical.reminderDaysBefore)
        assertEquals(before, mongo.getCollection("activity_calendar_private_items").find().first())
    }

    @Test
    fun `cross user account and game cannot read update or delete record and deleted read is 404`() {
        val a = service.create("owner", request())
        listOf("owner" to "b", "other" to "c", "other" to "a").forEach { (user, account) ->
            listOf<() -> Any>(
                { service.get(user, account, a.id) },
                { service.update(user, a.id, request(account).copy(endDate = day.plusDays(5), expectedVersion = 0)) },
                { service.delete(user, account, a.id, 0) },
            ).forEach { action -> assertEquals(404, assertThrows(ActivityCalendarApiException::class.java) { action() }.status.value()) }
        }
        assertEquals("领取奖励", service.get("owner", "a", a.id).title)
        service.delete("owner", "a", a.id, 0)
        assertEquals(404, assertThrows(ActivityCalendarApiException::class.java) { service.get("owner", "a", a.id) }.status.value())
        assertFalse(repository.exists("owner", "a"))
    }

    @Test
    fun `repository limits range reads and service refuses silently truncated results`() {
        val created = service.create("owner", request())
        val template = repository.find("owner", "a", "如鸢", created.id)!!
        mongo.insert((1..1001).map { template.copy(id = "pci_${java.util.UUID.randomUUID()}") }, CalendarPrivateItem::class.java)
        assertEquals(1001, repository.list("owner", "a", "如鸢", day, day).size)
        assertEquals(422, assertThrows(ActivityCalendarApiException::class.java) { service.list("owner", "a", day, day) }.status.value())
        assertTrue(service.list("owner", "a", day.plusDays(1), day.plusDays(1)).items.isEmpty())
    }

    @Test
    fun `concurrent updates and update delete race admit one winner and preserve CAS`() {
        val a = service.create("owner", request())
        val updated =
            concurrent(List(2) { index -> { service.update("owner", a.id, request().copy(title = "修改$index", expectedVersion = 0)) } })
        assertEquals(1, updated.count { it.isSuccess })
        assertEquals(409, (updated.single { it.isFailure }.exceptionOrNull() as ActivityCalendarApiException).status.value())
        assertEquals(1L, service.get("owner", "a", a.id).version)
        val raced = concurrent(
            listOf(
                { service.update("owner", a.id, request().copy(title = "新版本", expectedVersion = 1)) },
                { service.delete("owner", "a", a.id, 1) },
            ),
        )
        assertEquals(1, raced.count { it.isSuccess })
        val stored = repository.find("owner", "a", "如鸢", a.id)
        assertTrue(stored == null || stored.version == 2L)
    }

    @Test
    fun `failed mutation rolls back document and account fence`() {
        val broken = spyk(repository)
        every { broken.save(any()) } answers {
            repository.save(firstArg())
            error("injected after write")
        }
        val failing = CalendarPrivateItemService(broken, accounts, transaction)
        assertThrows(IllegalStateException::class.java) { failing.create("owner", request()) }
        assertFalse(repository.exists("owner", "a"))
        assertEquals(0L, mongo.findById("doc-a", SubAccount::class.java)!!.recruitmentFence)
    }

    @Test
    fun `account rename preserves items and deletion cascade rolls back on later failure`() {
        val a = service.create("owner", request())
        val b = service.create("owner", request("b"))
        lifecycle.update("owner", "a", "新名字", null)
        assertEquals(a, service.get("owner", "a", a.id))
        every { tokens.revokeByAccount("owner", "a") } throws IllegalStateException("injected delete failure")
        assertThrows(IllegalStateException::class.java) { lifecycle.delete("owner", "a") }
        assertNotNull(mongo.findById("doc-a", SubAccount::class.java))
        assertNotNull(repository.find("owner", "a", "如鸢", a.id))
        every { tokens.revokeByAccount("owner", "a") } returns Unit
        lifecycle.delete("owner", "a")
        assertNull(mongo.findById("doc-a", SubAccount::class.java))
        assertFalse(repository.exists("owner", "a"))
        assertEquals(b, service.get("owner", "b", b.id))
    }

    @Test
    fun `account deletion races create without orphaning private records`() {
        val results = concurrent(
            listOf({ service.create("owner", request()) }, {
                lifecycle.delete("owner", "a")
                true
            }),
        )
        assertTrue(results.any { it.isSuccess })
        if (mongo.findById("doc-a", SubAccount::class.java) != null) lifecycle.delete("owner", "a")
        assertFalse(repository.exists("owner", "a"))
        assertNotNull(mongo.findById("doc-b", SubAccount::class.java))
        assertEquals(404, assertThrows(ActivityCalendarApiException::class.java) { service.create("owner", request()) }.status.value())
    }

    @Test
    fun `raw legacy documents read without rewriting then expand persist collapse and retain content`() {
        val created = service.create("owner", request())
        val collection = mongo.getCollection("activity_calendar_private_items")
        collection.updateOne(org.bson.Document("_id", created.id), org.bson.Document("$" + "unset", org.bson.Document("endDate", "")))
        val before = collection.find(org.bson.Document("_id", created.id)).first()!!
        assertFalse(before.containsKey("endDate"))
        val legacy = service.get("owner", "a", created.id)
        assertEquals(day, legacy.startDate)
        assertEquals(day, legacy.endDate)
        assertEquals(listOf(legacy), service.list("owner", "a", day, day).items)
        assertTrue(service.list("owner", "a", day.plusDays(1), day.plusDays(1)).items.isEmpty())
        assertEquals(before, collection.find(org.bson.Document("_id", created.id)).first())
        val decoder = com.lhs.share.hub.controller.calendar.request.CalendarPrivateItemRequestDecoder
        val mapper = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
        val omitted = decoder.decode(
            mapper.readTree("""{"account_id":"a","title":"旧客户端修改","date":"2026-10-15","expected_version":0}"""),
            true,
        )
        val legacyUpdated = service.update("owner", created.id, omitted)
        assertEquals("23:59", legacyUpdated.time)
        assertEquals("私人说明", legacyUpdated.note)
        assertEquals(day, legacyUpdated.endDate)
        val expanded = service.update(
            "owner",
            created.id,
            request().copy(date = day.minusDays(40), endDate = day.plusDays(40), expectedVersion = 1),
        )
        assertEquals(expanded, service.get("owner", "a", created.id))
        val stored = collection.find(org.bson.Document("_id", created.id)).first()!!
        assertTrue(stored.containsKey("endDate"))
        assertEquals(
            422,
            assertThrows(ActivityCalendarApiException::class.java) {
                service.update("owner", created.id, omitted.copy(expectedVersion = 2))
            }.status.value(),
        )
        assertEquals(stored, collection.find(org.bson.Document("_id", created.id)).first())
        val collapsed = service.update("owner", created.id, request().copy(endDate = day, expectedVersion = 2))
        assertEquals(day, collapsed.startDate)
        assertEquals(day, collapsed.endDate)
        assertEquals(collapsed, service.get("owner", "a", created.id))
        service.delete("owner", "a", created.id, 3)
        assertTrue(service.list("owner", "a", day, day).items.isEmpty())
    }

    @Test
    fun `overlap query includes both endpoints adjacent windows long ranges and leap dates with owner isolation`() {
        val start = LocalDate.parse("2026-12-30")
        val end = LocalDate.parse("2027-01-02")
        val interval = service.create("owner", request().copy(date = start, endDate = end))
        val legacy = service.create("owner", request().copy(date = end, time = null))
        mongo.getCollection("activity_calendar_private_items").updateOne(
            org.bson.Document("_id", legacy.id),
            org.bson.Document("$" + "unset", org.bson.Document("endDate", "")),
        )
        for (date in listOf(start, start.plusDays(1), end.minusDays(1), end)) {
            val ids = service.list("owner", "a", date, date).items.map { it.id }
            assertTrue(interval.id in ids)
            assertEquals(date == end, legacy.id in ids)
        }
        for (date in listOf(start.minusDays(1), end.plusDays(1))) assertTrue(service.list("owner", "a", date, date).items.isEmpty())
        assertEquals(
            listOf(interval.id, legacy.id),
            service.list("owner", "a", LocalDate.parse("2027-01-01"), LocalDate.parse("2027-01-31")).items.map {
                it.id
            },
        )
        val long = service.create("owner", request().copy(date = LocalDate.parse("2020-01-01"), endDate = LocalDate.parse("2030-12-31")))
        val leap = LocalDate.parse("2028-02-29")
        val leapItem = service.create("owner", request().copy(date = leap, endDate = leap.plusDays(1)))
        assertEquals(listOf(long.id, leapItem.id), service.list("owner", "a", leap, leap).items.map { it.id })
        assertTrue(service.list("owner", "b", start, end).items.isEmpty())
        assertTrue(service.list("other", "c", start, end).items.isEmpty())
        val foreign = service.create("other", request("c").copy(date = start, endDate = end))
        assertEquals(listOf(foreign.id), service.list("other", "c", start, end).items.map { it.id })
        val query = org.bson.Document("userId", "owner").append("accountId", "a").append("game", "如鸢")
            .append("date", org.bson.Document("$" + "lte", java.util.Date.from(end.atStartOfDay(java.time.ZoneOffset.UTC).toInstant())))
            .append(
                "$" + "or",
                listOf(
                    org.bson.Document(
                        "endDate",
                        org.bson.Document("$" + "gte", java.util.Date.from(start.atStartOfDay(java.time.ZoneOffset.UTC).toInstant())),
                    ),
                    org.bson.Document(
                        "endDate",
                        null,
                    ).append(
                        "date",
                        org.bson.Document("$" + "gte", java.util.Date.from(start.atStartOfDay(java.time.ZoneOffset.UTC).toInstant())),
                    ),
                ),
            )
        val explanation = mongo.executeCommand(
            org.bson.Document(
                "explain",
                org.bson.Document("find", "activity_calendar_private_items").append("filter", query)
                    .append("hint", "calendar_private_owner_date"),
            ).append("verbosity", "queryPlanner"),
        )
        assertTrue(explanation.toJson().contains("calendar_private_owner_date"))
        assertFalse(mongo.collectionExists("activity_calendar_events"))
    }

    private fun concurrent(actions: List<() -> Any>): List<Result<Any>> {
        val executor = Executors.newFixedThreadPool(actions.size)
        val ready = CountDownLatch(actions.size)
        val start = CountDownLatch(1)
        return try {
            val futures = actions.map { action ->
                executor.submit(
                    Callable {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS))
                        runCatching(action)
                    },
                )
            }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            futures.map { it.get(20, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }
}
