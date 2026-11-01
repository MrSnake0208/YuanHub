package com.lhs.share.hub.service.notification

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

@Service
class NotificationEventService {
    // shortcut: events are process-local; add a shared transport only when deploying multiple active instances.
    private val subscribers = ConcurrentHashMap<String, CopyOnWriteArraySet<SseEmitter>>()

    // Periodic rotation rechecks JWT authentication and follows blue/green upstream switches.
    fun subscribe(userId: String): SseEmitter = register(userId, SseEmitter(300_000L))

    internal fun register(userId: String, emitter: SseEmitter): SseEmitter {
        subscribers.compute(userId) { _, current -> (current ?: CopyOnWriteArraySet()).also { it.add(emitter) } }
        emitter.onCompletion { remove(userId, emitter) }
        emitter.onTimeout { disconnect(userId, emitter) }
        emitter.onError { remove(userId, emitter) }
        send(userId, emitter, SseEmitter.event().reconnectTime(3_000).comment("connected"))
        return emitter
    }

    fun publishCreated(userId: String, notificationId: String) {
        val publish = {
            subscribers[userId]?.forEach { emitter ->
                send(
                    userId,
                    emitter,
                    SseEmitter.event().id(notificationId).name("notification_created").data(mapOf("id" to notificationId)),
                )
            }
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    publish()
                }
            })
        } else {
            publish()
        }
    }

    @Scheduled(fixedDelay = 15_000)
    fun keepAlive() {
        subscribers.forEach { (userId, emitters) ->
            emitters.forEach { send(userId, it, SseEmitter.event().comment("keepalive")) }
        }
    }

    private fun send(userId: String, emitter: SseEmitter, event: SseEmitter.SseEventBuilder) {
        try {
            emitter.send(event)
        } catch (_: Exception) {
            disconnect(userId, emitter)
        }
    }

    private fun disconnect(userId: String, emitter: SseEmitter) {
        remove(userId, emitter)
        runCatching { emitter.complete() }
    }

    private fun remove(userId: String, emitter: SseEmitter) {
        subscribers.computeIfPresent(userId) { _, emitters ->
            emitters.remove(emitter)
            emitters.takeUnless { it.isEmpty() }
        }
    }
}
