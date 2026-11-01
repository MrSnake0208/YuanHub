package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AccountShareScopesTest {
    private val repository = mockk<SubAccountRepository>()
    private val service =
        OperatorShareService(repository, mockk(), mockk(), mockk<OperatorAnnotationRepository>(), mockk(), mockk(), mockk())
    private var current = SubAccount(userId = "u", accountId = "a", name = "Account", shareToken = "legacy")

    private fun wire() {
        every { repository.findByUserIdAndAccountId(any(), any()) } answers {
            current.takeIf { it.userId == firstArg<String>() && it.accountId == secondArg<String>() }
        }
        every { repository.findByShareToken(any()) } answers { current.takeIf { it.shareToken == firstArg<String>() } }
        every { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) } answers {
            current.takeIf { it.userId == args[0] && it.accountId == args[1] && it.shareToken == args[2] && it.shareScopes == args[3] }
                ?.copy(shareToken = args[4] as String?, shareScopes = args[5] as List<String>)?.also { current = it }
        }
    }

    @Test
    fun `tags need explicit owner consent and are cleared when operator sharing closes`() {
        current = current.copy(shareScopes = listOf("star"))
        wire()
        assertEquals(
            "share_scope_requires_operator",
            assertThrows(OperatorApiException::class.java) { service.setScope("u", "a", "operator_tags", true) }.code,
        )
        assertThrows(OperatorApiException::class.java) { service.setScope("other", "a", "operator_tags", true) }
        verify(exactly = 0) { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) }
        service.create("u", "a")
        assertEquals(listOf("operator", "star"), service.getAccountShare("u", "a").scopes)
        service.setScope("u", "a", "operator_tags", true)
        assertEquals(listOf("operator", "operator_tags", "star"), current.shareScopes)
        assertEquals("legacy", current.shareToken)
        service.setScope("u", "a", "operator_tags", false)
        assertEquals(listOf("operator", "star"), current.shareScopes)
        service.setScope("u", "a", "operator_tags", true)
        service.setScope("u", "a", "operator", false)
        assertEquals(listOf("star"), current.shareScopes)
        service.create("u", "a")
        assertEquals(listOf("operator", "star"), current.shareScopes)
        service.setScope("u", "a", "operator_tags", true)
        service.revoke("u", "a")
        assertEquals(listOf("star"), current.shareScopes)
        service.create("u", "a")
        service.setScope("u", "a", "operator_tags", true)
        service.regenerateAccountShare("u", "a")
        assertEquals(listOf("operator", "operator_tags", "star"), current.shareScopes)
        service.revokeAccountShare("u", "a")
        assertEquals(emptyList<String>(), current.shareScopes)
        assertNull(current.shareToken)
    }

    @Test
    fun `tag consent retry cannot reopen a concurrently closed operator box`() {
        wire()
        every { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) } answers {
            current = current.copy(shareScopes = listOf("star"))
            null
        }
        assertEquals(
            "share_scope_requires_operator",
            assertThrows(OperatorApiException::class.java) { service.setScope("u", "a", "operator_tags", true) }.code,
        )
        assertEquals(listOf("star"), current.shareScopes)
        verify(exactly = 1) { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `concurrent star update preserves newly consented tags`() {
        wire()
        var collided = false
        every { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) } answers {
            if (!collided) {
                collided = true
                current = current.copy(shareScopes = listOf("operator", "operator_tags"))
                null
            } else {
                current.copy(shareScopes = args[5] as List<String>).also { current = it }
            }
        }
        service.setScope("u", "a", "star", true)
        assertEquals(listOf("operator", "operator_tags", "star"), current.shareScopes)
    }

    @Test
    fun `legacy tokens grant only operator and commands keep the other scope`() {
        wire()
        assertEquals(listOf("operator"), service.getAccountShare("u", "a").scopes)
        assertEquals(
            "share_not_authorized",
            assertThrows(OperatorApiException::class.java) {
                service.sharedAccount("legacy", "star")
            }.code,
        )
        service.setScope("u", "a", "star", true)
        assertEquals(listOf("operator", "star"), current.shareScopes)
        service.revoke("u", "a")
        assertEquals("legacy", current.shareToken)
        assertEquals(listOf("star"), current.shareScopes)
        assertFalse(service.get("u", "a").active)
        assertNull(service.get("u", "a").shareCode)
        assertThrows(OperatorApiException::class.java) { service.sharedAccount("legacy", "operator") }
        assertEquals("a", service.sharedAccount("legacy", "star").accountId)
        service.create("u", "a")
        assertEquals(listOf("operator", "star"), current.shareScopes)
        service.setScope("u", "a", "star", false)
        assertEquals("legacy", current.shareToken)
        assertEquals(listOf("operator"), current.shareScopes)
        service.revoke("u", "a")
        assertNull(current.shareToken)
        assertEquals(emptyList<String>(), current.shareScopes)
        assertThrows(OperatorApiException::class.java) { service.sharedAccount("legacy", "operator") }
    }

    @Test
    fun `star-only creation never enables operator and rotation revokes both old paths`() {
        current = current.copy(shareToken = null)
        wire()
        val first = service.setScope("u", "a", "star", true)
        assertEquals(listOf("star"), first.scopes)
        assertFalse(service.get("u", "a").active)
        assertThrows(OperatorApiException::class.java) { service.sharedAccount(first.shareCode!!, "operator") }
        service.create("u", "a")
        val rotated = service.regenerate("u", "a")
        assertNotEquals(first.shareCode, rotated.shareCode)
        assertEquals(listOf("operator", "star"), current.shareScopes)
        assertThrows(OperatorApiException::class.java) { service.sharedAccount(first.shareCode!!, "star") }
        service.revokeAccountShare("u", "a")
        assertFalse(service.getAccountShare("u", "a").active)
        assertThrows(OperatorApiException::class.java) { service.sharedAccount(rotated.shareCode!!, "star") }
    }

    @Test
    fun `concurrent one-scope mutation replays against newest scopes without losing a winner`() {
        current = current.copy(shareScopes = listOf("star"))
        wire()
        var collided = false
        every { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) } answers {
            if (!collided) {
                collided = true
                current = current.copy(shareScopes = listOf("operator", "star"))
                null
            } else {
                assertEquals(listOf("operator", "star"), args[3])
                current.copy(shareToken = args[4] as String?, shareScopes = args[5] as List<String>).also { current = it }
            }
        }
        service.setScope("u", "a", "star", false)
        assertEquals(listOf("operator"), current.shareScopes)
        assertEquals("legacy", current.shareToken)
    }

    @Test
    fun `ownership and unknown scopes fail before any write`() {
        wire()
        assertThrows(OperatorApiException::class.java) { service.setScope("other", "a", "star", true) }
        assertThrows(OperatorApiException::class.java) { service.setScope("u", "other", "star", true) }
        assertEquals(
            "share_scope_invalid",
            assertThrows(OperatorApiException::class.java) {
                service.setScope("u", "a", "private", true)
            }.code,
        )
        verify(exactly = 0) { repository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) }
    }
}
