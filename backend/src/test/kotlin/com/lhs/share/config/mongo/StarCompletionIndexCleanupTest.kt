package com.lhs.share.config.mongo

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.index.IndexOperations
import java.util.function.Supplier

class StarCompletionIndexCleanupTest {
    private val template = mockk<MongoTemplate>(relaxUnitFun = true)
    private val context = ApplicationContextRunner()
        .withUserConfiguration(StarCompletionIndexCleanup::class.java)
        .withBean("hubMongoTemplate", MongoTemplate::class.java, Supplier { template })

    @Test
    fun `test profile never registers startup database cleanup`() {
        context.withPropertyValues("spring.profiles.active=test").run {
            assertNull(it.startupFailure)
            assertEquals(0, it.getBeansOfType(StarCompletionIndexCleanup::class.java).size)
        }
        verify(exactly = 0) { template.indexOps(any<Class<*>>()) }
    }

    @Test
    fun `normal profiles retain startup cleanup and a clean index set is a no-op`() {
        val indexes = mockk<IndexOperations>()
        every { template.indexOps(any<Class<*>>()) } returns indexes
        every { indexes.indexInfo } returns emptyList()
        for (profiles in listOf("", "local", "prod", "local,agent-test")) {
            context.withPropertyValues("spring.profiles.active=$profiles").run {
                assertNull(it.startupFailure)
                it.getBean(StarCompletionIndexCleanup::class.java).run(DefaultApplicationArguments())
            }
        }
        verify(exactly = 4) { indexes.indexInfo }
        verify(exactly = 0) { indexes.dropIndex(any()) }
    }
}
