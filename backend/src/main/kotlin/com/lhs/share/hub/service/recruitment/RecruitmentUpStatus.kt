package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot

internal fun effectiveRecruitmentUpStatus(
    event: RecruitmentStatisticEvent,
    currentPool: RecruitmentPoolSnapshot?,
    mappedAgentId: String?,
): String? {
    if (event.upStatus != null && event.upStatus != "unknown" || event.rarity != 5) return event.upStatus
    val agentId = event.agentId ?: return event.upStatus
    if (agentId.startsWith("tmp_") && mappedAgentId == null) return event.upStatus
    val resolved = mappedAgentId ?: agentId
    if (currentPool?.allowCustomUp ?: event.allowCustomUp) {
        if (event.upAgentIds.size != 2 || event.poolUpStatus != "verified") return event.upStatus
        return if (agentId in event.upAgentSlotIds || resolved in event.upAgentIds) "up" else "non_up"
    }
    val snapshot = currentPool ?: return event.upStatus
    val active = snapshot.upAgents.filter { it.active }
    if (snapshot.upStatus != "verified" || active.isEmpty() || snapshot.unmappedUpAgentNames.isNotEmpty()) return event.upStatus
    if (active.any { it.id == agentId || it.operatorId == resolved }) return "up"
    if (snapshot.upAgents.any { !it.active && it.id == agentId }) return event.upStatus
    return "non_up"
}
