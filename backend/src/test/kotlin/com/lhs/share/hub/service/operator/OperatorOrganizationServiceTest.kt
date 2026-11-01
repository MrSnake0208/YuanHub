package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorOrganizationRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorOrganization
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate

class OperatorOrganizationServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountRepository>()
    private val organizations = mockk<OperatorOrganizationRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val stored = mutableMapOf<String, OperatorOrganization>()
    private val transaction = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private val service = OperatorOrganizationService(accounts, organizations, catalog, mapper, events, transaction)

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            if (firstArg<String>() == "owner" && secondArg<String>() in listOf("a", "b")) {
                SubAccount(userId = "owner", accountId = secondArg(), name = "test", game = "如鸢")
            } else {
                null
            }
        }
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } returns true
        every { organizations.findByUserIdAndAccountId(any(), any()) } answers { stored["${firstArg<String>()}:${secondArg<String>()}"] }
        every { organizations.replace(any(), any(), any(), any(), any()) } answers {
            val key = "${firstArg<String>()}:${secondArg<String>()}"
            val revision = thirdArg<Long>()
            if ((stored[key]?.revision ?: 0) != revision) {
                null
            } else {
                OperatorOrganization(key, firstArg(), secondArg(), arg(3), revision + 1, arg(4)).also { stored[key] = it }
            }
        }
        every { catalog.getOperator(any()) } answers {
            val id = firstArg<String>()
            if (id == "missing") {
                null
            } else {
                OperatorCatalogEntity(
                    operatorId = id, name = id, rarity = 5, prof = listOf("阳"), subProf = emptyList(),
                    games = listOf(if (id == "other") "代号鸢" else "如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "1",
                )
            }
        }
    }

    @Test
    fun `empty repeated reads create no data and owner is required before repository access`() {
        repeat(2) {
            val result = service.get("owner", "a")
            assertEquals(0L, result.path("revision").asLong())
            assertEquals("a", result.path("account_id").asText())
            assertEquals(0, result.path("tags").size())
        }
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(OperatorApiException::class.java) { service.get("stranger", "a") }.status)
        verify(exactly = 0) { organizations.replace(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { organizations.findByUserIdAndAccountId("stranger", any()) }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
    }

    @Test
    fun `tags pin order and state order round trip independently per account`() {
        val request = body()
        val saved = service.put("owner", "a", request)
        assertEquals(1L, saved.path("revision").asLong())
        assertEquals("主力", saved.path("tags")[0].path("name").asText())
        assertEquals(saved, service.get("owner", "a"))
        assertEquals(0, service.get("owner", "b").path("tags").size())
        assertFalse(stored.getValue("owner:a").payloadJson.contains("expected_revision"))
        verify { accounts.fenceRecruitmentWrite("owner", "a", "如鸢") }
        verify { events.publishChange("owner", "a", "operator_organization", mapOf("revision" to 1L)) }
    }

    @Test
    fun `stale revision and creation collisions cannot overwrite saved data`() {
        val saved = service.put("owner", "a", body())
        assertEquals(
            "operator_organization_revision_conflict",
            assertThrows(OperatorApiException::class.java) {
                service.put("owner", "a", body())
            }.code,
        )
        assertEquals(saved, service.get("owner", "a"))
        every { organizations.replace(any(), any(), any(), any(), any()) } throws DuplicateKeyException("raced create")
        assertEquals(HttpStatus.CONFLICT, assertThrows(OperatorApiException::class.java) { service.put("owner", "b", body()) }.status)
    }

    @Test
    fun `invalid fields enums duplicates unknown ids and wrong game never write`() {
        val invalid = listOf(
            body().put("growth_state", "skip"), body().put("schema_version", 4_294_967_297L), body().put("expected_revision", -1),
            body().put("expected_revision", 1.5), body().put("tags", "bad"), body().put("schema_version", "1"),
            body().also { it.putArray("status_order").add("active").add("active").add("skip").add("discarded") },
            body().also { it.putArray("pinned_ids").add("a").add("a") },
            body().also { it.putArray("pinned_ids").add("missing") }, body().also { it.putArray("pinned_ids").add("other") },
            body().also { (it.path("tags")[0] as ObjectNode).put("name", "   ") },
            body().also { (it.path("tags")[0] as ObjectNode).put("id", "<tag>") },
            body().also { it.withArray("tags").add(it.path("tags")[0].deepCopy<JsonNode>()) },
        )
        invalid.forEach { request ->
            assertEquals(
                HttpStatus.UNPROCESSABLE_ENTITY,
                assertThrows(OperatorApiException::class.java) {
                    service.put("owner", "a", request)
                }.status,
            )
        }
        verify(exactly = 0) { organizations.replace(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { events.publishChange(any(), any(), any(), any()) }
    }

    @Test
    fun `account changed while saving cannot recreate organization`() {
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } returns false
        assertEquals(HttpStatus.CONFLICT, assertThrows(OperatorApiException::class.java) { service.put("owner", "a", body()) }.status)
        verify(exactly = 0) { organizations.replace(any(), any(), any(), any(), any()) }
    }

    private fun body() = mapper.readTree(
        """{"schema_version":1,"expected_revision":0,"status_order":["skip","active","graduated","discarded"],
            "pinned_ids":["b","a"],"tags":[{"id":"main","name":" 主力 ","operator_ids":["a","b"]}]}""",
    ) as ObjectNode
}
