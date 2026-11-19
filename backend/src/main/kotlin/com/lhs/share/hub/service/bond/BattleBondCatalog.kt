package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.lhs.share.hub.repository.entity.BondRecord
import org.springframework.core.io.ClassPathResource

internal data class BattleBondEntry(
    val bondId: String,
    val members: List<String>,
    val type: String,
    val upstreamKey: String,
    val displayName: String? = null,
)

data class BattleBondSummary(val triggeredCount: Int, val availableTotal: Int)

internal object BattleBondCatalog {
    @JsonIgnoreProperties("source")
    private data class Resource(val entries: List<BattleBondEntry>)

    val entries = ClassPathResource("bond/battle-bonds.json").inputStream.use { stream ->
        jacksonObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .readValue<Resource>(stream).entries
    }
    val ids = entries.map { it.bondId }.toSet()
    val legacyIds = entries.associate { it.upstreamKey to it.bondId }

    init {
        check(ids.size == entries.size && legacyIds.size == entries.size) { "Duplicate battle bond ID or upstream key" }
    }

    fun summary(records: List<BondRecord>): BattleBondSummary {
        if (records.any { it.bondId !in ids }) BondRules.conflict("档案含缺失的战斗羁绊身份，请维护目录后重试")
        return BattleBondSummary(records.count { it.triggered }, entries.size)
    }
}
