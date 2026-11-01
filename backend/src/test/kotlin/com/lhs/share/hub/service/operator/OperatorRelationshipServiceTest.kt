package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorRelationshipRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorRelationships
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class OperatorRelationshipServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountRepository>()
    private val operators = mockk<OperatorCatalogService>()
    private val rules = mockk<OperatorRelationshipCatalog>()
    private val repository = mockk<OperatorRelationshipRepository>()
    private val transaction = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private val service = OperatorRelationshipService(accounts, operators, rules, repository, mapper, transaction)
    private var stored: OperatorRelationships? = null
    private fun body(entries: String, revision: Long = stored?.revision ?: 0) =
        mapper.readTree("""{"expected_revision":$revision,"catalog_version":"test","entries":$entries}""")

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            if (firstArg<String>() == "u" &&
                secondArg<String>() == "a"
            ) {
                SubAccount(userId = "u", accountId = "a", name = "test", game = "如鸢")
            } else {
                null
            }
        }
        every { accounts.fenceRecruitmentWrite("u", "a", "如鸢") } returns true
        every { rules.snapshot("如鸢") } returns OperatorRelationshipCatalog.Snapshot("test", mapper.createObjectNode())
        every { operators.getOperator(any()) } answers {
            val id = firstArg<String>()
            if (id in
                setOf("op", "sp")
            ) {
                OperatorCatalogEntity(
                    operatorId = id, name = id, rarity = 5, prof = emptyList(), subProf = emptyList(),
                    games = listOf(
                        "如鸢",
                    ),
                    discs = emptyList(), starStones = emptyList(), catalogVersion = "1",
                )
            } else {
                null
            }
        }
        every { repository.find("u", "a", "如鸢") } answers { stored }
        every { repository.replace("u", "a", "如鸢", any(), any()) } answers {
            OperatorRelationships("id", "u", "a", "如鸢", arg(4), arg<Long>(3) + 1, Instant.now()).also { stored = it }
        }
    }

    @Test
    fun `read is pure and rejects foreign owners and accounts`() {
        assertEquals(0L, service.get("u", "a")["revision"])
        assertThrows(OperatorApiException::class.java) { service.get("other", "a") }
        assertThrows(OperatorApiException::class.java) { service.patch("u", "b", body("""{"op":{"trust":1}}""")) }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `zero partial edits explicit clear idempotency and stale revisions`() {
        service.patch("u", "a", body("""{"op":{"trust":0,"rumors":2}}"""))
        service.patch("u", "a", body("""{"op":{"trust":500}}"""))
        assertEquals(2, mapper.readTree(stored!!.entriesJson).path("op").path("rumors").asInt())
        service.patch("u", "a", body("""{"op":{"trust":500}}"""))
        assertEquals(2L, stored!!.revision)
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body("""{"op":{"trust":1}}""", 1)) }
        service.patch("u", "a", body("""{"op":{"trust":null}}"""))
        assertFalse(mapper.readTree(stored!!.entriesJson).path("op").has("trust"))
        service.patch("u", "a", body("""{"op":{"rumors":null}}"""))
        assertEquals("{}", stored!!.entriesJson)
    }

    @Test
    fun `invalid batch never writes and accepts no implicit coercion`() {
        for (entry in listOf(
            """{"op":{"trust":-1}}""",
            """{"op":{"trust":1.5}}""",
            """{"op":{"trust":"1"}}""",
            """{"op":{"trust":9007199254740992}}""",
            """{"op":{"trust":1},"bad":{"rumors":1}}""",
            """{"op":{"owned":true}}""",
            """{"op":{}}""",
        )) {
            assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body(entry)) }
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `shared trust canonicalizes once and rejects conflicting restore values`() {
        every { rules.snapshot("如鸢") } returns OperatorRelationshipCatalog.Snapshot(
            "test",
            mapper.readTree("""{"op":{"trust_owner_id":"op","trust":{"max":1000}},"sp":{"trust_owner_id":"op"}}"""),
        )
        service.patch("u", "a", body("""{"sp":{"trust":500,"rumors":3}}"""))
        val entries = mapper.readTree(stored!!.entriesJson)
        assertEquals(500, entries.path("op").path("trust").asInt())
        assertFalse(entries.path("sp").has("trust"))
        assertEquals(3, entries.path("sp").path("rumors").asInt())
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body("""{"op":{"trust":10},"sp":{"trust":20}}""")) }
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body("""{"sp":{"trust":1001}}""")) }
    }

    @Test
    fun `catalog version and account fence block stale or deleted account writes`() {
        val stale = body("""{"op":{"trust":1}}""") as com.fasterxml.jackson.databind.node.ObjectNode
        stale.put("catalog_version", "old")
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", stale) }
        every { accounts.fenceRecruitmentWrite("u", "a", "如鸢") } returns false
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body("""{"op":{"trust":1}}""")) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `catalog validates reward boundaries and explicit sharing`() {
        val valid = mapper.readTree(
            """{"version":"fixture","games":{"如鸢":{"op":{"trust_owner_id":"op","trust":{
            "max":100,"complete":true,"source":"test fixture only","verified_on":"2026-10-22",
            "milestones":[{"at":100,"rewards":[{"item_key":"coin","name":"测试币","quantity":20}]}]},
            "rumors":null}},"代号鸢":{}}}""",
        )
        OperatorRelationshipCatalog.validate(valid)
        for (invalid in listOf(
            valid.toString().replace("\"at\":100", "\"at\":101"),
            valid.toString().replace("\"quantity\":20", "\"quantity\":0"),
            valid.toString().replace("\"trust_owner_id\":\"op\"", "\"trust_owner_id\":\"missing\""),
        )) {
            assertThrows(IllegalArgumentException::class.java) { OperatorRelationshipCatalog.validate(mapper.readTree(invalid)) }
        }
    }

    @Test
    fun `legacy trust is read without writes and only explicit trust edit resolves aliases`() {
        every { rules.snapshot("如鸢") } returns OperatorRelationshipCatalog.Snapshot(
            "test",
            mapper.readTree("""{"op":{"trust_owner_id":"op","trust":{"max":1000}},"sp":{"trust_owner_id":"op"}}"""),
        )
        stored = OperatorRelationships("id", "u", "a", "如鸢", """{"op":{"trust":100},"sp":{"trust":200,"rumors":3}}""", 1, Instant.now())
        val before = stored
        service.get("u", "a")
        assertEquals(before, stored)
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
        service.patch("u", "a", body("""{"sp":{"rumors":4}}"""))
        assertEquals(200, mapper.readTree(stored!!.entriesJson).path("sp").path("trust").asInt())
        service.patch("u", "a", body("""{"sp":{"trust":0}}"""))
        var entries = mapper.readTree(stored!!.entriesJson)
        assertEquals(0, entries.path("op").path("trust").asInt())
        assertFalse(entries.path("sp").has("trust"))
        assertEquals(4, entries.path("sp").path("rumors").asInt())
        service.patch("u", "a", body("""{"op":{"trust":null}}"""))
        entries = mapper.readTree(stored!!.entriesJson)
        assertFalse(entries.has("op"))
        assertFalse(entries.path("sp").has("trust"))
    }

    @Test
    fun `mapping changes inside transaction reject the write before replacing records`() {
        every { rules.snapshot("如鸢") } returnsMany listOf(
            OperatorRelationshipCatalog.Snapshot("test", mapper.createObjectNode()),
            OperatorRelationshipCatalog.Snapshot("changed", mapper.createObjectNode()),
        )
        assertThrows(OperatorApiException::class.java) { service.patch("u", "a", body("""{"op":{"trust":0}}""")) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }
}
