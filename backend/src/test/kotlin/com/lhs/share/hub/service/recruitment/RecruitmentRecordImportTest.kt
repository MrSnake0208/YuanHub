package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportOptions
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class RecruitmentRecordImportTest {
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val catalog = mockk<RecruitmentCatalog>()
    private val snapshot = RecruitmentPoolSnapshot("公共池", "如鸢", catalogPoolId = "public")
    private val current =
        RecruitmentArchive(
            "u:a",
            "u",
            "a",
            "如鸢",
            baseline = 100,
            currentPoolId = "personal",
            pools = listOf(RecruitmentPool("personal", snapshot, 7)),
        )
    private val importer = RecruitmentRecordImport(mapper, catalog)
    private val eventId = "550e8400-e29b-41d4-a716-446655440000"

    init {
        every { catalog.snapshot("如鸢", "public", false) } returns snapshot
        every { catalog.findPool("如鸢", "public") } returns RecruitmentCatalogPool("public", "如鸢", "公共池")
        every { catalog.operator("如鸢", "official") } returns RecruitmentAgentSnapshot("official", "密探", rarity = 5)
    }

    private fun node(): ObjectNode = mapper.readTree(
        """{"schema":"yuanhub.recruitment.import.v1","game":"如鸢","events":[{"event_id":"$eventId","catalog_pool_id":"public","agent_id":"official","pull_span":37}]}""",
    ) as ObjectNode

    @Test fun `minimal record resolves facts and reuses target pool without replacing state`() {
        val doc = importer.read(node(), current)
        val event = doc.events.single()
        assertEquals("personal", event.poolId)
        assertEquals("密探", event.agentSnapshot.name)
        assertEquals(5, event.agentSnapshot.rarity)
        assertEquals("unknown", event.upStatus)
        assertEquals("external", event.source)
        assertEquals(1L, event.sortOrder)
        val defaultPlan = recruitmentExchangePlan(current, emptyList(), emptyList(), doc, RecruitmentImportOptions(), recordsOnly = true)
        assertEquals("count_overlap", defaultPlan.items.single { it.entityType == "event" }.status)
        val confirmed =
            recruitmentExchangePlan(
                current,
                emptyList(),
                emptyList(),
                doc,
                RecruitmentImportOptions(confirmCountChange = true),
                recordsOnly = true,
            )
        assertEquals(144L, confirmed.candidateKnownTotal)
        assertEquals(100L, confirmed.archive.baseline)
        assertEquals(7L, confirmed.archive.pools.single().progress)
        assertEquals("personal", confirmed.archive.currentPoolId)
        assertThrows(RecruitmentApiException::class.java) {
            recruitmentExchangePlan(
                current,
                emptyList(),
                emptyList(),
                doc,
                RecruitmentImportOptions("use_backup", true),
                recordsOnly = true,
            )
        }
    }

    @Test fun `fresh record import has no artificial overlap and preserves known zero pool state`() {
        val fresh = current.copy(baseline = 0, pools = listOf(current.pools.single().copy(progress = 0)))
        val plan =
            recruitmentExchangePlan(
                fresh,
                emptyList(),
                emptyList(),
                importer.read(node(), fresh),
                RecruitmentImportOptions(),
                recordsOnly = true,
            )
        assertEquals(37L, plan.candidateKnownTotal)
        assertEquals(0L, plan.archive.pools.single().progress)
        assertEquals("personal", plan.archive.currentPoolId)
    }

    @Test fun `strict input rejects fabricated metadata missing spans duplicate UUIDs and four star spans`() {
        val mutations: List<(ObjectNode) -> Unit> = listOf(
            { it.put("baseline", 100) },
            { it.put("game", "代号鸢") },
            { (it.path("events")[0] as ObjectNode).remove("pull_span") },
            { (it.path("events")[0] as ObjectNode).put("pull_span", "37") },
            { (it.path("events")[0] as ObjectNode).put("event_id", "evt_144") },
            { (it.path("events")[0] as ObjectNode).put("created_at", "2026-10-14T00:00:00Z") },
            { (it.path("events")[0] as ObjectNode).put("up_status", "selection") },
            { it.withArray("events").add(it.path("events")[0].deepCopy<JsonNode>()) },
            { it.withArray("events").removeAll() },
        )
        mutations.forEach { mutate ->
            val input = node()
            mutate(input)
            assertThrows(RecruitmentApiException::class.java) { importer.read(input, current) }
        }
        every { catalog.operator("如鸢", "official") } returns RecruitmentAgentSnapshot("official", "四星", rarity = 4)
        assertThrows(RecruitmentApiException::class.java) { importer.read(node(), current) }
        val unknown = node()
        (unknown.path("events")[0] as ObjectNode).putNull("pull_span")
        assertEquals(4, importer.read(unknown, current).events.single().agentSnapshot.rarity)
    }

    @Test fun `batch references and totals are checked without counting member spans twice`() {
        val input = node()
        val batchId = "550e8400-e29b-41d4-a716-446655440001"
        (input.path("events")[0] as ObjectNode).put("batch_id", batchId)
        assertThrows(RecruitmentApiException::class.java) { importer.read(input, current) }
        input.set<JsonNode>("batches", mapper.readTree("""[{"batch_id":"$batchId","catalog_pool_id":"public","total_pull_count":100}]"""))
        assertEquals(100L, exchangeTotal(importer.read(input, current)))
        (input.path("batches")[0] as ObjectNode).put("total_pull_count", 36)
        assertThrows(RecruitmentApiException::class.java) { importer.read(input, current) }
        input.set<JsonNode>("events", mapper.readTree("[]"))
        (input.path("batches")[0] as ObjectNode).put("total_pull_count", 0)
        assertThrows(RecruitmentApiException::class.java) { importer.read(input, current) }
    }

    @Test fun `ambiguous personal pools and hidden directory are not silently selected`() {
        assertThrows(RecruitmentApiException::class.java) {
            importer.read(node(), current.copy(pools = current.pools + current.pools.single().copy(poolId = "second")))
        }
        every { catalog.findPool("如鸢", "public") } returns RecruitmentCatalogPool("public", "如鸢", "公共池", hidden = true)
        assertThrows(RecruitmentApiException::class.java) { importer.read(node(), current) }
    }

    @Test fun `bound slots use operator rarity and retain pool owned identity`() {
        every { catalog.snapshot("如鸢", "public", false) } returns
            snapshot.copy(upAgents = listOf(RecruitmentUpAgent("public:up:1", "占位", "official")))
        val input = node()
        (input.path("events")[0] as ObjectNode).put("agent_id", "public:up:1")
        assertEquals("public:up:1", importer.read(input, current).events.single().agentSnapshot.agentId)
    }
}
