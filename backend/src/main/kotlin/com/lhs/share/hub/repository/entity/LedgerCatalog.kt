package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("hub_ledger_packages")
data class LedgerCatalogPackage(
    @Id val id: String,
    val game: String,
    val contentId: Long,
    val name: String,
    val points: Int,
    val draws: Double,
    val limit: Int,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val category: String,
    val sortId: Int = 0,
    val extra: String = "",
    val enabled: Boolean = true,
    @Version val version: Long? = null,
    val updatedAt: Instant = Instant.now(),
)

data class LedgerReward(val name: String, val count: Int)
data class LedgerTier(val points: Int, val rewards: List<LedgerReward>, val sortId: Int = 0, val enabled: Boolean = true)

@Document("hub_ledger_campaigns")
data class LedgerCampaign(
    @Id val id: String,
    val game: String,
    val name: String,
    val startsAt: Instant?,
    val endsAt: Instant,
    val timeZone: String,
    val status: String,
    val tiers: List<LedgerTier>,
    val sourceNote: String = "",
    @Version val version: Long? = null,
    val updatedAt: Instant = Instant.now(),
)

@Document("hub_ledger_settings")
data class LedgerCatalogSettings(
    @Id val id: String = "default",
    val exchangeRate: Double = 6.7,
    @Version val version: Long? = null,
    val updatedAt: Instant = Instant.now(),
)

@Document("hub_ledger_settings")
data class LedgerCatalogSequence(@Id val id: String, val lastId: Long = 999999)
