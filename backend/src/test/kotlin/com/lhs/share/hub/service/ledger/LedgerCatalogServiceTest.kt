package com.lhs.share.hub.service.ledger

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.ledger.request.LedgerCampaignWrite
import com.lhs.share.hub.controller.ledger.request.LedgerCatalogDecoder
import com.lhs.share.hub.controller.ledger.request.LedgerPackageWrite
import com.lhs.share.hub.controller.ledger.request.LedgerSettingsWrite
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.repository.entity.LedgerCatalogPackage
import com.lhs.share.hub.repository.entity.LedgerCatalogSettings
import com.lhs.share.hub.repository.entity.LedgerReward
import com.lhs.share.hub.repository.entity.LedgerTier
import com.lhs.share.hub.service.admin.AdminAuditService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.dao.OptimisticLockingFailureException
import java.time.Instant

class LedgerCatalogServiceTest {
    private val repository = mockk<LedgerCatalogRepository>()
    private val audit = mockk<AdminAuditService>(relaxed = true)
    private val service = LedgerCatalogService(repository, audit)
    private val request = LedgerPackageWrite("ru", "礼包", 60, 0.6, 2, priceCny = 6.0, category = "其他")
    private val campaign = LedgerCampaignWrite(
        "ru",
        "新活动",
        Instant.parse("2026-10-01T00:00:00Z"),
        Instant.parse("2026-10-30T00:00:00Z"),
        "Asia/Shanghai",
        "published",
        listOf(LedgerTier(100, listOf(LedgerReward("符传", 1)))),
    )

    @Test
    fun `create assigns trusted ID preserves decimals and records actor and changes`() {
        every { repository.nextId("ru") } returns 1000000
        every { repository.insert(any<LedgerCatalogPackage>()) } answers { firstArg<LedgerCatalogPackage>().copy(version = 0) }
        val result = service.savePackage("editor", null, request)
        assertEquals("ru:1000000", result.id)
        assertEquals(0.6, result.draws)
        assertEquals(6.0, result.priceCny)
        verify {
            audit.record(
                match {
                    it.actorUserId == "editor" && it.targetResource == "ledger:ru:1000000" &&
                        it.after?.ledger?.get("value")?.contains("draws=0.6") == true
                },
            )
        }
    }

    @Test
    fun `invalid price game points quantity and sorting never write or audit`() {
        listOf(
            request.copy(game = "other"), request.copy(priceCny = Double.NaN), request.copy(priceCny = -1.0),
            request.copy(priceUsd = 1.0), request.copy(draws = Double.POSITIVE_INFINITY), request.copy(points = -1),
            request.copy(limit = 0), request.copy(sortId = -1), request.copy(name = " "), request.copy(category = "x".repeat(41)),
        ).forEach { assertThrows(LedgerCatalogException::class.java) { service.savePackage("editor", null, it) } }
        verify(exactly = 0) {
            repository.nextId(any())
            repository.insert(any<LedgerCatalogPackage>())
            audit.record(any())
        }
    }

    @Test
    fun `stale versions and Mongo CAS surface 409 without audit`() {
        val old = LedgerCatalogPackage("ru:1", "ru", 1, "旧", 60, 0.6, 2, priceCny = 6.0, category = "其他", version = 2)
        every { repository.findPackage("ru:1") } returns old
        assertEquals(
            409,
            assertThrows(LedgerCatalogException::class.java) {
                service.savePackage("editor", old.id, request.copy(expectedVersion = 1))
            }.status.value(),
        )
        every { repository.save(any<LedgerCatalogPackage>()) } throws OptimisticLockingFailureException("race")
        assertEquals(
            409,
            assertThrows(LedgerCatalogException::class.java) {
                service.savePackage("editor", old.id, request.copy(expectedVersion = 2))
            }.status.value(),
        )
        verify(exactly = 0) { audit.record(any()) }
    }

    @Test
    fun `campaign rejects missing start reversed interval zone duplicate tiers and invalid rewards`() {
        listOf(
            campaign.copy(startsAt = null), campaign.copy(startsAt = campaign.endsAt), campaign.copy(timeZone = "fake"),
            campaign.copy(status = "live"), campaign.copy(tiers = emptyList()), campaign.copy(tiers = campaign.tiers + campaign.tiers),
            campaign.copy(tiers = listOf(LedgerTier(0, listOf(LedgerReward("符传", 1))))),
            campaign.copy(tiers = listOf(LedgerTier(100, listOf(LedgerReward("符传", 0))))),
            campaign.copy(tiers = campaign.tiers.map { it.copy(enabled = false) }),
        ).forEach { assertThrows(LedgerCatalogException::class.java) { service.previewCampaign(it) } }
        assertEquals(campaign.tiers, service.previewCampaign(campaign).tiers)
        verify(exactly = 0) { audit.record(any()) }
    }

    @Test
    fun `public catalog excludes disabled draft and disabled tiers and reads never write`() {
        val enabled = LedgerCatalogPackage("ru:1", "ru", 1, "礼包", 1, 0.6, 1, priceCny = 1.0, category = "其他")
        val live = service.previewCampaign(
            campaign.copy(
                tiers =
                campaign.tiers + LedgerTier(200, listOf(LedgerReward("停用", 1)), enabled = false),
            ),
        )
        every { repository.packages() } returns listOf(enabled, enabled.copy(id = "ru:2", contentId = 2, enabled = false))
        every { repository.campaigns() } returns
            listOf(live, live.copy(id = "draft", status = "draft"), live.copy(id = "off", status = "disabled"))
        every { repository.settings() } returns LedgerCatalogSettings(version = 0)
        repeat(2) {
            val result = service.catalog()
            assertEquals(1, result.packages.size)
            assertEquals(1, result.campaigns.size)
            assertEquals(1, result.campaigns.single().tiers.size)
        }
        assertEquals(3, service.catalog(true).campaigns.size)
        verify(exactly = 0) {
            repository.save(any<LedgerCatalogPackage>())
            repository.save(any<LedgerCatalogSettings>())
            audit.record(any())
        }
    }

    @Test
    fun `default exchange rate rejects invalid and stale updates`() {
        every { repository.settings() } returns LedgerCatalogSettings(version = 2)
        for (value in listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY, 10001.0)) {
            assertThrows(LedgerCatalogException::class.java) { service.saveSettings("editor", LedgerSettingsWrite(value, 2)) }
        }
        assertEquals(
            409,
            assertThrows(LedgerCatalogException::class.java) {
                service.saveSettings("editor", LedgerSettingsWrite(7.0, 1))
            }.status.value(),
        )
        verify(exactly = 0) { audit.record(any()) }
    }

    @Test
    fun `strict decoder rejects unknown ID coercion fractions and null primitives`() {
        val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val decoder = LedgerCatalogDecoder(mapper)
        val json = """{"game":"ru","name":"礼包","category":"其他","points":1,"draws":0.6,"limit":1,"price_cny":6} """
        assertEquals(0.6, decoder.read(mapper.readTree(json), LedgerPackageWrite::class.java).draws)
        for (invalid in listOf(
            json.replace("\"points\":1", "\"points\":1.5"),
            json.replace("\"points\":1", "\"points\":null"),
            json.replace("\"name\":\"礼包\"", "\"name\":12"),
            json.replace("\"points\":1", "\"points\":\"1\""),
            json.replace("\"game\"", "\"content_id\":77,\"game\""),
        )) {
            assertThrows(LedgerCatalogException::class.java) { decoder.read(mapper.readTree(invalid), LedgerPackageWrite::class.java) }
        }
    }
}
