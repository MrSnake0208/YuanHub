package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import kotlin.math.roundToLong

/** One accumulator per pool; input follows stored oldest-to-newest order, first gold assumes small pity. */
internal class RecruitmentGoldStatistics {
    private var knownPulls = 0L
    private var knownCount = 0L
    private var smallCount = 0L
    private var smallWins = 0L
    private var guaranteed = false
    private var validPity = true
    private var guaranteedCount = 0L

    var upGoldCount = 0L
        private set
    var knownUpGoldCount = 0L
        private set
    var unknownUpGoldCount = 0L
        private set

    val totalUpRate: Double?
        get() = if (knownUpGoldCount == 0L) null else (upGoldCount.toDouble() / knownUpGoldCount * 1000).roundToLong() / 10.0
    val guaranteedGoldCount: Long?
        get() = if (validPity) guaranteedCount else null
    val pityHistoryAssumption = "first_gold_small_pity"
    val pityStatus: String
        get() = when {
            !validPity -> "insufficient_history"
            knownUpGoldCount + unknownUpGoldCount == 0L -> "no_samples"
            else -> "inferred"
        }

    val averageGoldPulls: Double?
        get() = if (knownCount == 0L) null else (knownPulls.toDouble() / knownCount * 10).roundToLong() / 10.0
    val accountAverageGoldPulls: Double?
        get() = if (knownCount == 0L) null else (knownPulls.toDouble() / knownCount * 100).roundToLong() / 100.0
    val smallPityWinRate: Double?
        get() = if (!validPity || smallCount == 0L) null else (smallWins.toDouble() / smallCount * 1000).roundToLong() / 10.0

    fun add(event: RecruitmentStatisticEvent) {
        if (event.rarity == 4) return
        if (event.rarity == 5 && event.pullSpan != null && event.pullSpan > 0) {
            knownPulls += event.pullSpan
            knownCount++
        }
        // UP attribution remains countable even after the pity history becomes invalid.
        if (event.rarity == 5) {
            when (event.upStatus) {
                "up" -> {
                    upGoldCount++
                    knownUpGoldCount++
                }
                "non_up" -> knownUpGoldCount++
                else -> unknownUpGoldCount++
            }
        }
        if (!validPity) return
        if (event.rarity != 5 || event.upStatus !in listOf("up", "non_up")) {
            validPity = false
        } else if (guaranteed) {
            if (event.upStatus == "up") guaranteedCount++ else validPity = false
            guaranteed = false
        } else {
            smallCount++
            if (event.upStatus == "up") smallWins++ else guaranteed = true
        }
    }
}
