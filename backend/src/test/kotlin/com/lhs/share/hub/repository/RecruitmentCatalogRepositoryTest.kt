package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.mongodb.client.result.UpdateResult
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update

class RecruitmentCatalogRepositoryTest {
    @Test
    fun `existing catalog updates write both enabled and disabled wishlist flags with CAS`() {
        val template = mockk<MongoTemplate>()
        val query = slot<Query>()
        val update = slot<Update>()
        every {
            template.updateFirst(capture(query), capture(update), RecruitmentCatalogPool::class.java)
        } returns UpdateResult.acknowledged(1, 1, null)
        val repository = RecruitmentCatalogRepository(template)

        for (enabled in listOf(true, false)) {
            assertTrue(repository.save(RecruitmentCatalogPool("pool", "如鸢", "心愿池", revision = 2, allowCustomUp = enabled)))
            assertEquals(Document("_id", "pool").append("revision", 1L), query.captured.queryObject)
            val fields = update.captured.updateObject.get("\$set", Document::class.java)
            assertEquals(enabled, fields["allowCustomUp"])
            assertEquals(2L, fields["revision"])
        }
    }
}
