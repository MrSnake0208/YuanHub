package com.lhs.share.hub.service.ledger

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.ledger.request.CartItemRequest
import com.lhs.share.hub.controller.ledger.request.CustomPackageRequest
import com.lhs.share.hub.controller.ledger.request.LedgerPlanCreateRequest
import com.lhs.share.hub.controller.ledger.request.PackageSnapshotRequest
import com.lhs.share.hub.repository.LedgerPlanRepository
import com.lhs.share.hub.repository.entity.LedgerPlan
import com.lhs.share.hub.repository.entity.LedgerPricing
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LedgerPricingServiceTest {
    private val repository = mockk<LedgerPlanRepository>()
    private val service = LedgerPlanService(repository, ShareProperties())
    private var saved: LedgerPlan? = null

    init {
        every { repository.countByUserId("owner") } returns 0
        every { repository.save(any()) } answers {
            firstArg<LedgerPlan>().copy(id = "plan").also { saved = it }
        }
    }

    private fun request() = LedgerPlanCreateRequest(
        name = "港币与日元",
        version = "ru",
        pricing = LedgerPricing(currency = "HKD", rates = mapOf("HKD" to 0.9, "JPY" to 0.05), discountPercent = 95.0, customOnly = true),
        cartItems = listOf(
            CartItemRequest(11, 1, PackageSnapshotRequest("当地礼包", points = 100, draws = 2.0, priceAmount = 100.0, priceCurrency = "HKD")),
            CartItemRequest(
                12,
                1,
                PackageSnapshotRequest(
                    "当地礼包",
                    points = 200,
                    draws = 3.0,
                    priceAmount = 2000.0,
                    priceCurrency = "JPY",
                    discountEligible = false,
                ),
            ),
        ),
        customPackages = listOf(
            CustomPackageRequest(id = 11, name = "当地礼包", points = 100, draws = 2.0, priceAmount = 100.0, priceCurrency = "HKD"),
            CustomPackageRequest(
                id = 12,
                name = "当地礼包",
                points = 200,
                draws = 3.0,
                priceAmount = 2000.0,
                priceCurrency = "JPY",
                discountEligible = false,
            ),
        ),
    )

    @Test
    fun `local prices discounts and same-name packages survive save detail and summary`() {
        val response = service.create("owner", request())
        assertEquals(185.5, response.summary!!.totalCny, 0.000001)
        assertEquals(185.5 / 0.9, response.summary.totalAmount!!, 0.000001)
        assertEquals("HKD", response.summary.currency)
        assertEquals(300L, response.summary.totalPoints)
        assertEquals(5.0, response.summary.totalDraws)
        assertEquals(2, response.customPackages.size)
        assertEquals(setOf("HKD", "JPY"), response.customPackages.map { it.priceCurrency }.toSet())
        assertEquals(response.customPackages.map { it.id }.toSet(), response.cartItems.map { it.contentId }.toSet())
        every { repository.findByIdAndUserId("plan", "owner") } answers { saved }
        assertEquals(response.pricing, service.getById("owner", "plan").pricing)
        assertEquals(response.cartItems, service.getById("owner", "plan").cartItems)
        every { repository.findByUserIdOrderByUpdatedAtDesc("owner") } answers { listOf(saved!!) }
        assertEquals(response.summary, service.list("owner", null).single().summary)
    }

    @Test
    fun `95 percent CNY and legacy snapshots retain expected amounts`() {
        val old =
            LedgerPlanCreateRequest(
                "旧方案",
                "ru",
                cartItems = listOf(CartItemRequest(1, 1, PackageSnapshotRequest("648充值", priceCny = 648.0))),
            )
        assertEquals(648.0, service.create("owner", old).summary!!.totalCny)
        assertEquals(615.6, service.create("owner", old.copy(pricing = LedgerPricing(discountPercent = 95.0))).summary!!.totalCny, 0.000001)
        val dollars = old.copy(
            version = "daihao",
            exchangeRate = 0.0,
            cartItems = listOf(CartItemRequest(1, 1, PackageSnapshotRequest("零汇率旧方案", priceUsd = 2.0))),
        )
        assertEquals(0.0, service.create("owner", dollars).summary!!.totalCny)
        assertEquals(0.0, service.create("owner", dollars.copy(pricing = LedgerPricing())).summary!!.totalCny)
        assertThrows(ApiResultException::class.java) { service.create("owner", dollars.copy(pricing = LedgerPricing(currency = "USD"))) }
    }

    @Test
    fun `invalid currencies rates price pairs and discounts never write`() {
        val source = request()
        val invalid = listOf(
            source.copy(exchangeRate = 1e7),
            source.copy(pricing = source.pricing!!.copy(rates = emptyMap())),
            source.copy(pricing = source.pricing.copy(currency = "EUR")),
            source.copy(pricing = source.pricing.copy(discountPercent = Double.NaN)),
            source.copy(pricing = source.pricing.copy(discountPercent = 0.0)),
            source.copy(pricing = source.pricing.copy(discountPercent = 101.0)),
            source.copy(pricing = source.pricing.copy(rates = mapOf("HKD" to 0.0))),
            source.copy(pricing = source.pricing.copy(rates = mapOf("JPY" to Double.POSITIVE_INFINITY))),
            source.copy(pricing = null),
            source.copy(customPackages = listOf(source.customPackages.first().copy(priceCurrency = null))),
            source.copy(customPackages = listOf(source.customPackages.first().copy(priceAmount = -1.0))),
            source.copy(customPackages = listOf(source.customPackages.first().copy(priceAmount = Double.NaN))),
        )
        invalid.forEach { assertThrows(ApiResultException::class.java) { service.create("owner", it) } }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `old-client replacement of a new plan is rejected and ownership still applies`() {
        every { repository.findByIdAndUserId("plan", "owner") } returns
            LedgerPlan(userId = "owner", name = "新方案", version = "ru", pricing = LedgerPricing())
        val old = LedgerPlanCreateRequest("改名", "ru")
        val error = assertThrows(ApiResultException::class.java) { service.update("owner", "plan", old) }
        assertTrue(error.message!!.contains("刷新"))
        every { repository.findByIdAndUserId("plan", "other") } returns null
        assertThrows(ApiResultException::class.java) { service.update("other", "plan", request()) }
        assertThrows(ApiResultException::class.java) { service.getById("other", "plan") }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `snake-case pricing request retains explicit zero price and discount exemption`() {
        val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val body = """
            {"name":"免费赠品","version":"ru",
             "pricing":{"currency":"JPY","rates":{"JPY":0.05},"discount_percent":95,"custom_only":true},
             "cart_items":[{"content_id":1,"quantity":1,"package_snapshot":{
               "name":"赠品","price_amount":0,"price_currency":"CNY","discount_eligible":false}}]}
        """.trimIndent()
        val request = mapper.readValue<LedgerPlanCreateRequest>(body)
        val result = service.create("owner", request)
        assertEquals(0.0, result.summary!!.totalAmount)
        assertEquals(false, result.cartItems.single().packageSnapshot.discountEligible)
        assertEquals(true, result.pricing!!.customOnly)
    }

    @Test
    fun `ru USD fallback rate is stored and canonical custom values determine the summary`() {
        val source = request().copy(
            exchangeRate = 7.0,
            pricing = LedgerPricing(),
            customPackages = listOf(CustomPackageRequest(id = 11, name = "当地充值", priceAmount = 10.0, priceCurrency = "USD")),
            cartItems = listOf(CartItemRequest(11, 2, PackageSnapshotRequest("过期草稿", priceAmount = 1.0, priceCurrency = "CNY"))),
        )
        val response = service.create("owner", source)
        assertEquals(7.0, response.pricing!!.rates["USD"])
        assertEquals(140.0, response.summary!!.totalCny)
        assertEquals("USD", response.cartItems.single().packageSnapshot.priceCurrency)
        assertEquals(10.0, response.cartItems.single().packageSnapshot.priceAmount)
    }
}
