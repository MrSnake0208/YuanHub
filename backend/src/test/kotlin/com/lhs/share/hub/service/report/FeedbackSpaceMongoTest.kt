package com.lhs.share.hub.service.report

import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageRequest
import org.springframework.data.mongodb.core.MongoTemplate

@Tag("integration")
class FeedbackSpaceMongoTest {
    private val database = TestMongo.database("fb_spaces")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)
    private val queries = FeedbackTicketQueryRepository(mongo)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `旧目录缺失专区字段默认主站且专区变更持久化不移动旧板块`() {
        mongo.getCollection("feedback_category_catalog").insertOne(
            Document("_id", "feedback")
                .append("categories", listOf(Document("key", "MAAYUAN").append("label", "麻圆"))).append("version", 0L),
        )
        val repository = org.springframework.data.mongodb.repository.support.MongoRepositoryFactory(mongo)
            .getRepository(com.lhs.share.hub.repository.FeedbackCategoryCatalogRepository::class.java)
        val service = FeedbackCategoryService(repository)
        assertEquals(listOf("yuanhub"), service.spaces().map { it.id })
        assertEquals("yuanhub", service.list().first { it.key == "MAAYUAN" }.spaceId)
        service.createSpace("partner-a", "合作平台")
        service.updateSpace("partner-a", "合作平台新名", false)
        val reloaded = FeedbackCategoryService(repository)
        assertEquals("合作平台新名", reloaded.requireSpace("partner-a").label)
        assertEquals(false, reloaded.requireSpace("partner-a").active)
        assertEquals(1, reloaded.inSpace("partner-a").size)
        assertEquals("yuanhub", reloaded.list().first { it.key == "MAAYUAN" }.spaceId)
    }

    @Test
    fun `数据库在分页计数前隔离专区且缺失字段历史工单仍属主站`() {
        val base =
            FeedbackTicket(
                id = "legacy", type = "BUG", category = "OPERATOR", area = "OPERATOR", reporterUserId = "owner",
                content = "相同关键词", visibility = "PUBLIC", publicTitle = "相同关键词", workflowStage = "UNASSIGNED",
            )
        val legacy = Document()
        mongo.converter.write(base, legacy)
        legacy.remove("spaceId")
        mongo.getCollection("feedback_tickets").insertOne(legacy)
        mongo.insert(base.copy(id = "default-explicit", spaceId = "yuanhub"))
        mongo.insert(base.copy(id = "a-public", spaceId = "partner-a", workArea = "CUSTOM_A", category = "CUSTOM_A", area = "CUSTOM_A"))
        mongo.insert(
            base.copy(
                id = "a-private",
                spaceId = "partner-a",
                visibility = "PRIVATE",
                workArea = "CUSTOM_A",
                category = "CUSTOM_A",
                area = "CUSTOM_A",
            ),
        )
        mongo.insert(
            base.copy(
                id = "b-private",
                spaceId = "partner-b",
                visibility = "PRIVATE",
                workArea = "CUSTOM_B",
                category = "CUSTOM_B",
                area = "CUSTOM_B",
            ),
        )
        mongo.insert(base.copy(id = "b-public", spaceId = "partner-b", workArea = "CUSTOM_B", category = "CUSTOM_B", area = "CUSTOM_B"))
        val page = queries.search(
            null, null, null, null, null, "相同", PageRequest.of(0, 1), workAreas = setOf("CUSTOM_A"), queue = "UNASSIGNED",
            knownAreas =
            FeedbackArea.all + setOf("CUSTOM_A", "CUSTOM_B"),
            spaceIds = setOf("partner-a"),
        )
        assertEquals(2L, page.totalElements)
        assertEquals(setOf("partner-a"), page.content.map { FeedbackSpaces.id(it) }.toSet())
        val defaultPage = queries.search("owner", null, null, null, null, null, PageRequest.of(0, 20), spaceIds = setOf("yuanhub"))
        assertEquals(setOf("legacy", "default-explicit"), defaultPage.content.map { it.id }.toSet())
        assertEquals(1L, queries.publicSearch(null, null, "相同", null, "latest", PageRequest.of(0, 20), "partner-a").totalElements)
        assertEquals(listOf("a-public"), queries.searchPublicSimilar(listOf("相同"), 40, "partner-a").map { it.id })
        assertEquals(
            setOf("legacy", "default-explicit"),
            queries.publicSearch(null, null, null, null, "latest", PageRequest.of(0, 20)).content.map {
                it.id
            }.toSet(),
        )
        assertEquals(6L, mongo.count(org.springframework.data.mongodb.core.query.Query(), FeedbackTicket::class.java))
    }
}
