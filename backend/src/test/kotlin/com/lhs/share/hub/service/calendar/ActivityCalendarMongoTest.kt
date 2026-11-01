package com.lhs.share.hub.service.calendar

import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import java.time.LocalDate

/** Only the process-owned disposable TestMongo database is used. */
@Tag("integration")
class ActivityCalendarMongoTest {
    private val database = TestMongo.database("act_calendar")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = ActivityCalendarRepository(template)
    private val service = ActivityCalendarService(repository, RecruitmentCatalogRepository(template))
    private val date = LocalDate.parse("2026-10-03")
    private val request = ActivityCalendarWriteRequest("如鸢", "活动", ActivityCalendarCategory.ACTIVITY, date, date.plusDays(7))

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `Mongo optional classification round trips and missing historical fields keep legacy identity`() {
        val furniture = service.create("editor", request.copy(subtype = ActivityCalendarSubtype.FURNITURE))
        val cave = service.create(
            "editor",
            request.copy(
                title = "洞窟",
                subtype = ActivityCalendarSubtype.FURNITURE,
                subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE,
            ),
        )
        val saved = repository.find(cave.item.id)!!
        assertEquals(ActivityCalendarSubtype.FURNITURE, saved.subtype)
        assertEquals(ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE, saved.subtypeDetail)
        val collection = template.getCollection("activity_calendar_events")
        val raw = collection.find(org.bson.Document("_id", cave.item.id)).first()!!
        assertEquals("FURNITURE", raw["subtype"])
        assertEquals("MYSTERIOUS_CAVE", raw["subtypeDetail"])
        assertEquals(2, service.publicItems(null, null, null, null).items.size)
        assertTrue(furniture.item.id != cave.item.id)
        collection.updateOne(
            org.bson.Document("_id", cave.item.id),
            org.bson.Document("\$unset", org.bson.Document("subtype", "").append("subtypeDetail", ""))
                .append("\$set", org.bson.Document("category", "LOGIN")),
        )
        val legacy = repository.find(cave.item.id)!!
        assertEquals(ActivityCalendarCategory.LOGIN, legacy.category)
        assertNull(legacy.subtype)
        assertNull(legacy.subtypeDetail)
        assertEquals(cave.item.startDate, legacy.startDate)
        assertEquals(cave.item.endDate, legacy.endDate)
    }

    @Test
    fun `Mongo nullable version starts at zero CAS rejects stale writer and disable preserves document`() {
        val created = service.create("creator", request)
        assertEquals(0L, created.version)
        val id = created.item.id
        val stale = repository.find(id)!!
        val updated = service.update("editor", id, request.copy(expectedVersion = 0, title = "新版"))
        assertEquals(1L, updated.version)
        assertThrows(OptimisticLockingFailureException::class.java) { repository.save(stale.copy(title = "竞争覆盖")) }
        val conflict = assertThrows(ActivityCalendarApiException::class.java) {
            service.update("other", id, request.copy(expectedVersion = 0))
        }
        assertEquals(409, conflict.status.value())
        assertEquals("新版", repository.find(id)!!.title)
        service.update("editor", id, request.copy(expectedVersion = 1, enabled = false))
        assertTrue(service.publicItems(null, null, null, null).items.isEmpty())
        val admin = service.adminItems(null, null, null, null, false, null).items.single()
        assertFalse(admin.enabled)
        assertEquals(2L, admin.version)
        assertEquals("creator", admin.createdBy)
        assertEquals(1L, template.getCollection("activity_calendar_events").countDocuments())
    }

    @Test
    fun `Mongo ISO dates and game category enabled overlap queries merge only valid catalog facts without writes`() {
        val spanning = service.create("creator", request)
        service.create("creator", request.copy(title = "before", startDate = date.minusDays(10), endDate = date.minusDays(1)))
        service.create("creator", request.copy(title = "after", startDate = date.plusDays(1), endDate = date.plusDays(10)))
        val boundary = service.create("creator", request.copy(title = "boundary", startDate = date.minusDays(10), endDate = date))
        service.create("creator", request.copy(title = "other", game = "代号鸢"))
        service.create("creator", request.copy(title = "shop", category = ActivityCalendarCategory.SHOP))
        service.create("creator", request.copy(title = "disabled", enabled = false))
        template.insert(RecruitmentCatalogPool("valid", "如鸢", "卡池", date.minusDays(1), date))
        template.insert(RecruitmentCatalogPool("missing", "如鸢", "缺日期", null, date))
        template.insert(RecruitmentCatalogPool("inverted", "如鸢", "倒置", date.plusDays(1), date))
        template.insert(RecruitmentCatalogPool("disabled", "如鸢", "停用", date, date, enabled = false))
        val raw = template.getCollection("activity_calendar_events").find(org.bson.Document("_id", spanning.item.id)).first()!!
        assertEquals("2026-10-03", raw["startDate"])
        assertEquals("2026-10-10", raw["endDate"])
        val manualBefore = template.getCollection("activity_calendar_events").find().into(mutableListOf())
        val catalogBefore = template.getCollection("recruitment_catalog").find().into(mutableListOf())
        val items = service.publicItems("如鸢", date, date, listOf("ACTIVITY,RECRUITMENT")).items
        assertEquals(listOf(boundary.item.id, "recruitment:valid", spanning.item.id), items.map { it.id })
        assertEquals(items, service.publicItems("如鸢", date, date, listOf("ACTIVITY,RECRUITMENT")).items)
        assertEquals(listOf("shop"), service.publicItems("如鸢", date, date, listOf("SHOP")).items.map { it.title })
        assertEquals(listOf("other"), service.publicItems("代号鸢", date, date, null).items.map { it.title })
        assertTrue(service.publicItems(null, date.plusDays(100), null, null).items.isEmpty())
        assertTrue(service.publicItems(null, null, date.minusDays(100), null).items.isEmpty())
        assertEquals(manualBefore, template.getCollection("activity_calendar_events").find().into(mutableListOf()))
        assertEquals(catalogBefore, template.getCollection("recruitment_catalog").find().into(mutableListOf()))
    }

    @Test
    fun `Mongo持续活动空或缺失结束日期可读且跨期重叠查询不返回未来停用或其他游戏`() {
        val open = service.create("editor", request.copy(endDate = null))
        val absent = service.create("editor", request.copy(title = "缺失字段", endDate = null))
        service.create("editor", request.copy(title = "未来", startDate = date.plusYears(2), endDate = null))
        service.create("editor", request.copy(title = "停用", endDate = null, enabled = false))
        service.create("editor", request.copy(title = "其他游戏", game = "代号鸢", endDate = null))
        service.create("editor", request.copy(title = "已截止"))
        val collection = template.getCollection("activity_calendar_events")
        collection.updateOne(org.bson.Document("_id", open.item.id), org.bson.Document("\$set", org.bson.Document("endDate", null)))
        collection.updateOne(org.bson.Document("_id", absent.item.id), org.bson.Document("\$unset", org.bson.Document("endDate", "")))
        assertNull(repository.find(open.item.id)!!.endDate)
        assertNull(repository.find(absent.item.id)!!.endDate)
        val before = collection.find().into(mutableListOf())
        val later = date.plusYears(1)
        val items = service.publicItems("如鸢", later, later.plusDays(1), listOf("ACTIVITY")).items
        assertEquals(setOf(open.item.id, absent.item.id), items.map { it.id }.toSet())
        assertTrue(service.publicItems("如鸢", null, date.minusDays(1), listOf("ACTIVITY")).items.isEmpty())
        assertEquals(before, collection.find().into(mutableListOf()))
        service.update("editor", open.item.id, request.copy(expectedVersion = 0))
        assertEquals(listOf(absent.item.id), service.publicItems("如鸢", later, later, listOf("ACTIVITY")).items.map { it.id })
    }
}
