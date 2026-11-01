package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.index.Indexed

class SubAccountShareContractTest {
    @Test
    fun `tag consent defaults private and never grants access without operator or token`() {
        val account = SubAccount(userId = "u", accountId = "a", name = "A", shareToken = "code")
        assertEquals(listOf("operator"), account.effectiveShareScopes())
        assertEquals(emptyList<String>(), account.copy(shareScopes = listOf("operator_tags")).effectiveShareScopes())
        assertEquals(listOf("star"), account.copy(shareScopes = listOf("operator_tags", "star")).effectiveShareScopes())
        val consented = account.copy(shareScopes = listOf("operator", "operator_tags"))
        assertEquals(listOf("operator", "operator_tags"), consented.effectiveShareScopes())
        assertEquals(emptyList<String>(), consented.copy(shareToken = null).effectiveShareScopes())
    }

    @Test
    fun `share token is nullable and has a sparse unique index`() {
        val field = SubAccount::class.java.getDeclaredField("shareToken")
        val index = field.getAnnotation(Indexed::class.java)

        assertEquals("idx_sub_share_token_unique", index.name)
        assertTrue(index.unique)
        assertTrue(index.sparse)
    }

    @Test
    fun `common account response does not include share token`() {
        val json = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .writeValueAsString(
                com.lhs.share.hub.controller.account.response.SubAccountResponse.of(
                    SubAccount(userId = "u1", accountId = "acc1", name = "大号", shareToken = "secret"),
                ),
            )

        assertFalse(json.contains("shareToken"))
        assertFalse(json.contains("share_token"))
        assertTrue(json.contains("\"id\":\"acc1\""))
    }
}
