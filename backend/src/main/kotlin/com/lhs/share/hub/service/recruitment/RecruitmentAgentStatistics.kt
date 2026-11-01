package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.controller.recruitment.response.RecruitmentAgentCount
import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent

internal fun isPermanentRecruitmentPool(snapshot: RecruitmentPoolSnapshot): Boolean =
    snapshot.endDate == null && snapshot.poolType?.trim()?.lowercase() in setOf("permanent", "standard", "常驻", "常驻卡池", "常驻招募")

internal class RecruitmentAgentStatistics(pools: List<RecruitmentPool>, temporaryAgents: List<RecruitmentTemporaryAgent>) {
    private val slots = pools.associate { it.poolId to (it.mappedSnapshot ?: it.snapshot).upAgents.associateBy { slot -> slot.id } }
    private val permanentPoolIds = pools.filter { isPermanentRecruitmentPool(it.mappedSnapshot ?: it.snapshot) }.map { it.poolId }.toSet()
    private val temporary = temporaryAgents.associateBy { it.agentId }
    private val obtained = mutableMapOf<String, RecruitmentAgentCount>()
    private val nonUp = mutableMapOf<String, RecruitmentAgentCount>()
    private val permanent = mutableMapOf<String, RecruitmentAgentCount>()

    val mostObtained: List<RecruitmentAgentCount> get() = leaders(obtained)
    val mostNonUp: List<RecruitmentAgentCount> get() = leaders(nonUp)
    val mostPermanent: List<RecruitmentAgentCount> get() = leaders(permanent)

    fun add(event: RecruitmentStatisticEvent) {
        if (event.rarity != 5) return
        val originalId = event.agentId ?: return
        val slot = slots[event.poolId]?.get(originalId)
        val mapped = temporary[originalId]
        val id = slot?.operatorId ?: mapped?.mappedAgentId ?: originalId
        val name = slot?.name ?: mapped?.mappedName ?: event.agentName ?: id
        increment(obtained, id, name)
        if (event.poolId in permanentPoolIds) increment(permanent, id, name)
        if (event.upStatus == "non_up" && event.poolId in slots && event.poolId !in permanentPoolIds) increment(nonUp, id, name)
    }

    private fun increment(counts: MutableMap<String, RecruitmentAgentCount>, id: String, name: String) {
        counts[id] = RecruitmentAgentCount(id, name, (counts[id]?.count ?: 0L) + 1)
    }

    private fun leaders(counts: Map<String, RecruitmentAgentCount>): List<RecruitmentAgentCount> {
        val maximum = counts.values.maxOfOrNull { it.count } ?: return emptyList()
        return counts.values.filter { it.count == maximum }.sortedBy { it.agentId }
    }
}
