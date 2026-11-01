package com.lhs.share.hub.service.notification

import com.lhs.share.hub.repository.NotificationRepository
import com.lhs.share.hub.repository.entity.Notification
import com.lhs.share.testinfra.TestMongo
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.io.IOException

@Tag("integration")
class NotificationTransactionMongoTest {
    private val database = TestMongo.database("notify")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)
    private val repository = MongoRepositoryFactory(mongo).getRepository(NotificationRepository::class.java)
    private val events = NotificationEventService()
    private val service = NotificationService(repository, events)
    private val transaction = TransactionTemplate(MongoTransactionManager(mongo.mongoDatabaseFactory))

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `real Mongo commit delivers once and rollback persists nothing and sends nothing`() {
        mongo.createCollection(Notification::class.java)
        val emitter = mockk<SseEmitter>(relaxed = true)
        val broken = mockk<SseEmitter>(relaxed = true)
        events.register("recipient", emitter)
        events.register("recipient", broken)
        every { broken.send(any<SseEmitter.SseEventBuilder>()) } throws IOException("disconnected")
        clearMocks(emitter, answers = false)
        for (commit in listOf(true, false)) {
            val before = repository.count()
            transaction.executeWithoutResult { status ->
                service.create("recipient", "FEEDBACK_REPLY", "reply", "synthetic message", "FEEDBACK", "ticket")
                verify(exactly = 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
                if (!commit) status.setRollbackOnly()
            }
            assertEquals(before + if (commit) 1 else 0, repository.count())
            verify(exactly = if (commit) 1 else 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
            clearMocks(emitter, answers = false)
        }
    }
}
