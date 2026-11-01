package com.lhs.share.hub.work

import com.lhs.share.hub.work.repository.MaaCopilotWorkSource
import com.lhs.share.hub.work.repository.MaaCopilotWorkSourceRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Query

class MaaCopilotWorkSourceRepositoryTest {
    private val template = mockk<MongoTemplate>()
    private val repository = MaaCopilotWorkSourceRepository(template)

    @Test
    fun `all source reads require public and not deleted and project only raw content`() {
        val listQuery = slot<Query>()
        val detailQuery = slot<Query>()
        every { template.count(any<Query>(), MaaCopilotWorkSource::class.java, "maa_copilot") } returns 1
        every { template.find(capture(listQuery), MaaCopilotWorkSource::class.java, "maa_copilot") } returns emptyList()
        every { template.findOne(capture(detailQuery), MaaCopilotWorkSource::class.java, "maa_copilot") } returns null

        repository.findPublic(1, 20)
        repository.findPublicById(7)

        listOf(listQuery.captured, detailQuery.captured).forEach { query ->
            assertEquals("PUBLIC", query.queryObject["status"])
            assertEquals(false, query.queryObject["delete"])
            assertEquals(1, query.fieldsObject["content"])
            assertFalse(query.fieldsObject.containsKey("actions"))
            assertFalse(query.fieldsObject.containsKey("simingActions"))
        }
        assertEquals(7L, detailQuery.captured.queryObject["copilotId"])
    }
}
