package com.lhs.share.hub.service.account

import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

class AccountEventServiceTest {
    private val beta = mockk<BetaService> { every { requireAccess(any()) } just runs }
    private val recruitmentAccess = mockk<RecruitmentAccessService>(relaxed = true)
    private val service = AccountEventService(beta, recruitmentAccess)

    @Test
    fun `events are delivered only to the matching user and account`() {
        val matching = emitter()
        val otherAccount = emitter()
        val otherUser = emitter()
        service.register("u1", "acc1", matching)
        service.register("u1", "acc2", otherAccount)
        service.register("u2", "acc1", otherUser)
        clearMocks(matching, otherAccount, otherUser, answers = false)

        service.publish("u1", "acc1", "inventory_import", "event-1", mapOf("id" to "item1"))

        verify(exactly = 1) { matching.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 0) { otherAccount.send(any<SseEmitter.SseEventBuilder>()) }
        verify(exactly = 0) { otherUser.send(any<SseEmitter.SseEventBuilder>()) }
    }

    @Test
    fun `change notifications wait for commit and do not publish on rollback`() {
        val matching = emitter()
        service.register("u1", "acc1", matching)
        clearMocks(matching, answers = false)
        TransactionSynchronizationManager.initSynchronization()
        try {
            service.publishChange("u1", "acc1", "operator_growth_target")
            verify(exactly = 0) { matching.send(any<SseEmitter.SseEventBuilder>()) }
            TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
            verify(exactly = 1) { matching.send(any<SseEmitter.SseEventBuilder>()) }
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
        clearMocks(matching, answers = false)
        TransactionSynchronizationManager.initSynchronization()
        try {
            service.publishChange("u1", "acc1", "operator_annotation")
            TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCompletion(1) }
            verify(exactly = 0) { matching.send(any<SseEmitter.SseEventBuilder>()) }
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    private fun emitter() = mockk<SseEmitter>(relaxed = true).also {
        every { it.onCompletion(any()) } just runs
        every { it.onTimeout(any()) } just runs
        every { it.onError(any()) } just runs
    }
}
