package com.lhs.share.hub.repository.entity

import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.convert.MappingMongoConverter
import org.springframework.data.mongodb.core.convert.MongoCustomConversions
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver
import org.springframework.data.mongodb.core.mapping.MongoMappingContext

class LedgerPricingPersistenceTest {
    private val conversions = MongoCustomConversions(emptyList<Any>())
    private val context = MongoMappingContext().apply {
        setSimpleTypeHolder(conversions.simpleTypeHolder)
        afterPropertiesSet()
    }
    private val converter = MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context).apply {
        setCustomConversions(conversions)
        afterPropertiesSet()
    }

    @Test
    fun `new pricing and generic snapshots survive actual Mongo mapping without a database`() {
        val plan = LedgerPlan(
            userId = "owner",
            name = "日元预算",
            version = "ru",
            pricing = LedgerPricing("JPY", mapOf("JPY" to 0.05, "HKD" to 0.9), 95.0, true),
            cartItems = listOf(
                CartItem(1, 2, PackageSnapshot("港币礼包", priceAmount = 100.0, priceCurrency = "HKD", discountEligible = false)),
            ),
            customPackages = listOf(CustomPackage(1, "港币礼包", priceAmount = 100.0, priceCurrency = "HKD", discountEligible = false)),
            summary = PlanSummary(totalCny = 180.0, totalAmount = 3600.0, currency = "JPY"),
        )
        val document = Document()
        converter.write(plan, document)
        val restored = converter.read(LedgerPlan::class.java, document)
        assertEquals(plan.pricing, restored.pricing)
        assertEquals(plan.cartItems, restored.cartItems)
        assertEquals(plan.customPackages, restored.customPackages)
        assertEquals(plan.summary, restored.summary)
    }

    @Test
    fun `legacy BSON without new fields retains snapshot and full-price defaults`() {
        val document = Document.parse(
            """
            {"userId":"owner","name":"历史方案","version":"ru",
             "cartItems":[{"contentId":1,"quantity":1,"packageSnapshot":{"name":"原价","priceCny":648}}],
             "summary":{"totalCny":648,"totalPoints":0,"totalDraws":0}}
            """.trimIndent(),
        )
        val plan = converter.read(LedgerPlan::class.java, document)
        assertNull(plan.pricing)
        assertEquals(648.0, plan.cartItems.single().packageSnapshot.priceCny)
        assertEquals(true, plan.cartItems.single().packageSnapshot.discountEligible)
        assertNull(plan.cartItems.single().packageSnapshot.priceAmount)
        assertEquals("CNY", plan.summary!!.currency)
        assertNull(plan.summary.totalAmount)
    }
}
