package com.lhs.share.hub.service.development

import com.lhs.share.hub.repository.DevelopmentGoalRepository
import com.lhs.share.hub.repository.entity.DevelopmentCriterion
import com.lhs.share.hub.repository.entity.DevelopmentGoal
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.data.domain.PageRequest
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import java.time.Instant

@Tag("integration")
class DevelopmentGoalMongoTest {
    private val database = TestMongo.database("developmentgoal")
    private val client = TestMongo.client()
    private val repository = MongoRepositoryFactory(
        MongoTemplate(SimpleMongoClientDatabaseFactory(client, database)),
    ).getRepository(DevelopmentGoalRepository::class.java)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `验收清单和关联持久化且旧副本不能覆盖新进度`() {
        val created = repository.save(
            DevelopmentGoal(
                "goal_1",
                "目标",
                "交付说明",
                "PLANNED",
                listOf(DevelopmentCriterion("验收")),
                feedbackIds = listOf("public_1"),
                createdAt = Instant.EPOCH,
                updatedAt = Instant.EPOCH,
            ),
        )
        val stale = repository.findById(created.id).orElseThrow()
        repository.save(created.copy(stage = "COMPLETED", criteria = listOf(DevelopmentCriterion("验收", true))))
        assertThrows(OptimisticLockingFailureException::class.java) { repository.save(stale.copy(title = "旧管理员修改")) }
        val stored = repository.findByStage("COMPLETED", PageRequest.of(0, 12)).content.single()
        assertEquals(true, stored.criteria.single().completed)
        assertEquals(listOf("public_1"), stored.feedbackIds)
        assertEquals("目标", stored.title)
        assertEquals(1L, repository.count())
    }
}
