package com.lhs.share.hub.service.notification

import com.lhs.share.hub.repository.NotificationRepository
import com.lhs.share.hub.repository.entity.Notification
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class NotificationServiceTest {
    private val repository = mockk<NotificationRepository>()
    private val events = mockk<NotificationEventService>(relaxed = true)
    private val service = NotificationService(repository, events)

    @Test
    fun `creation publishes only the persisted ID and recipient`() {
        every { repository.save(any<Notification>()) } answers { firstArg<Notification>().copy(id = "saved_id") }
        val saved = service.create("recipient", "FEEDBACK_REPLY", "title", "body", "FEEDBACK", "ticket")
        assertEquals("saved_id", saved.id)
        verify(exactly = 1) { events.publishCreated("recipient", "saved_id") }
    }

    @Test
    fun `failed persistence never publishes`() {
        every { repository.save(any<Notification>()) } throws IllegalStateException("save failed")
        assertThrows(IllegalStateException::class.java) {
            service.create("recipient", "FEEDBACK_REPLY", "title", "body", "FEEDBACK", "ticket")
        }
        verify(exactly = 0) { events.publishCreated(any(), any()) }
    }
}
