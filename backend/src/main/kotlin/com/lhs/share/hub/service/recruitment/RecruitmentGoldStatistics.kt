package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import kotlin.math.roundToLong

/**
 * One accumulator per pool; input follows stored oldest-to-newest order, first gold assumes small pity.
 * Pity counts only provable outcomes: an UP right after a non-UP is guaranteed gold; the gold after an UP
 * (or the first gold) is small pity. Unknown or rule-breaking records skip only the outcome they make unprovable.
 */
internal class RecruitmentGoldStatistics {
    private var knownPulls = 0L
    private var knownCount = 0L
    private var smallCount = 0L
    private var smallWins = 0L

    /** Previous gold's pity-relevant status: null before the first gold, otherwise "up", "non_up" or "unknown". */
    private var previousGold: String? = null
    private var guaranteedCount = 0L

    var upGoldCount = 0L
        private set
    var knownUpGoldCount = 0L
        private set
    var unknownUpGoldCount = 0L
        private set

    val totalUpRate: Double?
        get() = if (knownUpGoldCount == 0L) null else (upGoldCount.toDouble() / knownUpGoldCount * 1000).roundToLong() / 10.0
    val guaranteedGoldCount: Long
        get() = guaranteedCount
    val pityHistoryAssumption = "first_gold_small_pity"
    val pityStatus: String
        get() = if (knownUpGoldCount + unknownUpGoldCount == 0L) "no_samples" else "inferred"

    val averageGoldPulls: Double?
        get() = if (knownCount == 0L) null else (knownPulls.toDouble() / knownCount * 10).roundToLong() / 10.0
    val accountAverageGoldPulls: Double?
        get() = if (knownCount == 0L) null else (knownPulls.toDouble() / knownCount * 100).roundToLong() / 100.0
    val smallPityWinRate: Double?
        get() = if (smallCount == 0L) null else (smallWins.toDouble() / smallCount * 1000).roundToLong() / 10.0

    fun add(event: RecruitmentStatisticEvent) {
        if (event.rarity == 4) return
        if (event.rarity == 5 && event.pullSpan != null && event.pullSpan > 0) {
            knownPulls += event.pullSpan
            knownCount++
        }
        // UP attribution counts every gold regardless of pity state.
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
        // Missing rarity may be a gold, so the next gold's pity state becomes unknown as well.
        val status = if (event.rarity == 5 && event.upStatus in listOf("up", "non_up")) event.upStatus else "unknown"
        if (status != "unknown") {
            when (previousGold) {
                null, "up" -> {
                    smallCount++
                    if (status == "up") smallWins++
                }
                // A non-UP while guaranteed breaks the rule; skip it, the next gold is still guaranteed.
                "non_up" -> if (status == "up") guaranteedCount++
            }
        }
        previousGold = status
    }
}
