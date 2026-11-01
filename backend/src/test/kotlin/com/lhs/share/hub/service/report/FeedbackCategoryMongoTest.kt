package com.lhs.share.hub.service.report

import com.lhs.share.hub.repository.FeedbackCategoryCatalogRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackCategoryCatalog
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory

@Tag("integration")
class FeedbackCategoryMongoTest {
    private val database = TestMongo.database("feedbackcat")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = MongoRepositoryFactory(template)
        .getRepository(FeedbackCategoryCatalogRepository::class.java)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `旧目录默认显示且隐藏状态重载可恢复并受版本冲突保护`() {
        val category = FeedbackCategory("CUSTOM_TEST", "历史板块")
        template.getCollection("feedback_category_catalog").insertOne(
            Document("_id", "feedback")
                .append("categories", listOf(Document("key", category.key).append("label", category.label)))
                .append("version", 0L),
        )
        val stale = repository.findById("feedback").orElseThrow()
        assertEquals(category, stale.categories.single())
        val service = FeedbackCategoryService(repository)
        service.setHidden(category.key, true)
        assertEquals(category.copy(hidden = true), FeedbackCategoryService(repository).list().first { it.key == category.key })
        assertEquals(category.label, service.label(category.key))
        assertThrows(OptimisticLockingFailureException::class.java) { repository.save(stale) }
        service.setHidden(category.key, false)
        assertEquals(category, FeedbackCategoryService(repository).list().first { it.key == category.key })
    }

    @Test
    fun `历史目录补齐日历读取不写库后续编辑持久化且重载不重复`() {
        val historical = FeedbackArea.labels.filterKeys { it != FeedbackArea.CALENDAR }.map { (key, label) -> FeedbackCategory(key, label) }
        val saved = repository.save(FeedbackCategoryCatalog(categories = historical))
        val service = FeedbackCategoryService(repository)
        repeat(2) { assertEquals(1, service.list().count { it.key == FeedbackArea.CALENDAR }) }
        assertEquals(saved, repository.findById("feedback").orElseThrow())
        service.create("额外板块")
        val reloaded = FeedbackCategoryService(repository).list()
        assertEquals(1, reloaded.count { it.key == FeedbackArea.CALENDAR })
        assertEquals(historical, reloaded.filter { it.key != FeedbackArea.CALENDAR && !it.key.startsWith("CUSTOM_") })
        assertEquals(1, repository.findById("feedback").orElseThrow().categories.count { it.key == FeedbackArea.CALENDAR })
    }

    @Test
    fun `已有自定义日历改名后重载保留内置标识且不创建同义分类`() {
        val saved = repository.save(FeedbackCategoryCatalog(categories = listOf(FeedbackCategory("CUSTOM_CAL", "活动日历"))))
        val service = FeedbackCategoryService(repository)
        assertEquals(setOf("CUSTOM_CAL"), service.keys())
        assertEquals(saved, repository.findById("feedback").orElseThrow())
        service.rename("CUSTOM_CAL", "活动与招募日程")
        assertEquals(
            listOf(FeedbackCategory("CUSTOM_CAL", "活动与招募日程", FeedbackArea.CALENDAR)),
            FeedbackCategoryService(repository).list(),
        )
    }

    @Test
    fun `空库保留内置板块且目录持久化并发修改不会覆盖新名称`() {
        val service = FeedbackCategoryService(repository)
        val builtins = FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) }
        assertEquals(builtins, service.list())
        assertFalse(repository.existsById("feedback"))

        val category = service.create("新板块")
        assertEquals(builtins + category, service.list())
        val stale = repository.findById("feedback").orElseThrow()
        service.rename(category.key, "新名称")

        assertEquals("新名称", FeedbackCategoryService(repository).label(category.key))
        assertThrows(OptimisticLockingFailureException::class.java) {
            repository.save(stale.copy(categories = stale.categories.filterNot { it.key == category.key }))
        }
        assertEquals("新名称", service.label(category.key))
    }

    @Test
    fun `排序重载持久化并阻止旧顺序和旧版本覆盖且保留隐藏属性`() {
        val calendar = FeedbackCategory("CUSTOM_CAL", "日历", FeedbackArea.CALENDAR, hidden = true)
        val other = FeedbackCategory("OTHER", "其他")
        val stale = repository.save(FeedbackCategoryCatalog(categories = listOf(calendar, other)))
        val service = FeedbackCategoryService(repository)
        val keys = listOf(other.key, calendar.key)
        service.reorder(keys, keys.reversed())
        assertEquals(listOf(other, calendar), FeedbackCategoryService(repository).list())
        assertThrows(OptimisticLockingFailureException::class.java) { repository.save(stale) }
        assertEquals(
            409,
            assertThrows(com.lhs.share.controller.response.ApiResultException::class.java) {
                service.reorder(keys, keys.reversed())
            }.statusCode,
        )
        assertEquals(listOf(other, calendar), repository.findById("feedback").orElseThrow().categories)
    }
}
