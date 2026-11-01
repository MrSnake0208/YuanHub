package com.lhs.share.hub.service.notification

import io.mockk.clearMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.io.IOException

class NotificationEventServiceTest {
    private val service = NotificationEventService()

    @Test
    fun `only the recipient receives a notification and all their tabs receive the same ID`() {
        val first = mockk<SseEmitter>(relaxed = true)
        val second = mockk<SseEmitter>(relaxed = true)
        val outsider = mockk<SseEmitter>(relaxed = true)
        service.register("recipient", first)
        service.register("recipient", second)
        service.register("outsider", outsider)
        clearMocks(first, second, outsider, answers = false)

        service.publishCreated("recipient", "ntf_one")

        verify(exactly = 1) {
            first.send(match<SseEmitter.SseEventBuilder> { event -> event.build().any { it.data == mapOf("id" to "ntf_one") } })
        }
        verify(exactly = 1) { second.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 0) { outsider.send(any<SseEmitter.SseEventBuilder>()) }
    }

    @Test
    fun `events wait for commit and rollback never sends`() {
        val emitter = mockk<SseEmitter>(relaxed = true)
        service.register("recipient", emitter)
        clearMocks(emitter, answers = false)
        for (commit in listOf(true, false)) {
            TransactionSynchronizationManager.initSynchronization()
            try {
                service.publishCreated("recipient", "ntf_one")
                verify(exactly = 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
                val callbacks = TransactionSynchronizationManager.getSynchronizations()
                if (commit) callbacks.forEach { it.afterCommit() }
                callbacks.forEach {
                    it.afterCompletion(
                        if (commit) TransactionSynchronization.STATUS_COMMITTED else TransactionSynchronization.STATUS_ROLLED_BACK,
                    )
                }
                verify(exactly = if (commit) 1 else 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
            } finally {
                TransactionSynchronizationManager.clearSynchronization()
                clearMocks(emitter, answers = false)
            }
        }
    }

    @Test
    fun `broken connection is removed without affecting other subscribers or the caller`() {
        val broken = mockk<SseEmitter>(relaxed = true)
        val healthy = mockk<SseEmitter>(relaxed = true)
        service.register("recipient", broken)
        service.register("recipient", healthy)
        clearMocks(broken, healthy, answers = false)
        every { broken.send(any<SseEmitter.SseEventBuilder>()) } throws IOException("disconnected")

        service.publishCreated("recipient", "ntf_one")
        service.publishCreated("recipient", "ntf_two")
        service.keepAlive()

        verify(exactly = 1) { broken.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 1) { broken.complete() }
        verify(exactly = 3) { healthy.send(any<SseEmitter.SseEventBuilder>()) }
    }

    @Test
    fun `completion and timeout remove subscriptions`() {
        val emitter = mockk<SseEmitter>(relaxed = true)
        var completed: Runnable? = null
        every { emitter.onCompletion(any()) } answers { completed = firstArg() }
        service.register("recipient", emitter)
        clearMocks(emitter, answers = false)
        completed!!.run()
        service.keepAlive()
        verify(exactly = 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }

        var timedOut: Runnable? = null
        every { emitter.onTimeout(any()) } answers { timedOut = firstArg() }
        service.register("recipient", emitter)
        clearMocks(emitter, answers = false)
        timedOut!!.run()
        service.publishCreated("recipient", "ntf_one")
        verify(exactly = 0) { emitter.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 1) { emitter.complete() }
    }
}
