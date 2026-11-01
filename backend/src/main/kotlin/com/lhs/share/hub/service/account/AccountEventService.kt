package com.lhs.share.hub.service.account

import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

@Service
class AccountEventService(
    private val beta: BetaService,
    private val recruitmentAccess: RecruitmentAccessService,
) {
    private val subscribers = ConcurrentHashMap<SubscriberKey, CopyOnWriteArraySet<SseEmitter>>()

    fun subscribe(userId: String, accountId: String): SseEmitter = register(userId, accountId, SseEmitter(0L))

    internal fun register(userId: String, accountId: String, emitter: SseEmitter): SseEmitter {
        val key = SubscriberKey(userId, accountId)
        if (!authorize(key)) return emitter
        subscribers.computeIfAbsent(key) { CopyOnWriteArraySet() }.add(emitter)
        emitter.onCompletion { remove(key, emitter) }
        emitter.onTimeout { remove(key, emitter) }
        emitter.onError { remove(key, emitter) }
        try {
            emitter.send(SseEmitter.event().reconnectTime(3_000).comment("connected"))
        } catch (_: Exception) {
            remove(key, emitter)
        }
        return emitter
    }

    fun publish(userId: String, accountId: String, eventName: String, eventId: String, data: Any) {
        val key = SubscriberKey(userId, accountId)
        if (!authorize(key)) return
        subscribers[key]?.forEach { emitter ->
            try {
                emitter.send(SseEmitter.event().id(eventId).name(eventName).data(data))
            } catch (_: Exception) {
                remove(key, emitter)
            }
        }
    }

    /** Subscribers must never observe a write that its enclosing transaction rolls back. */
    fun publishChange(userId: String, accountId: String, eventName: String, detail: Map<String, Any?> = emptyMap()) {
        val send = { publish(userId, accountId, eventName, UUID.randomUUID().toString(), detail + ("account_id" to accountId)) }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = send()
            })
        } else {
            send()
        }
    }

    @Scheduled(fixedDelay = 15_000)
    fun keepAlive() {
        subscribers.forEach { (key, emitters) ->
            if (!authorize(key)) return@forEach
            emitters.forEach { emitter ->
                try {
                    emitter.send(SseEmitter.event().comment("keepalive"))
                } catch (_: Exception) {
                    remove(key, emitter)
                }
            }
        }
    }

    private fun authorize(key: SubscriberKey): Boolean = try {
        beta.requireAccess(key.userId)
        true
    } catch (_: Exception) {
        if (runCatching { recruitmentAccess.canAccess(key.userId) }.getOrDefault(false)) {
            true
        } else {
            subscribers.remove(key)?.forEach { emitter -> runCatching { emitter.complete() } }
            false
        }
    }

    private fun remove(key: SubscriberKey, emitter: SseEmitter) {
        subscribers.computeIfPresent(key) { _, emitters ->
            emitters.remove(emitter)
            emitters.takeUnless { it.isEmpty() }
        }
    }

    private data class SubscriberKey(val userId: String, val accountId: String)
}
