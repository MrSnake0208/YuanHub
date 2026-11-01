package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.response.StarShareEntry
import com.lhs.share.hub.controller.star.response.StarShareResponse
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.effectiveShareScopes
import com.lhs.share.hub.service.operator.OperatorShareService
import org.springframework.stereotype.Service

@Service
class StarShareService(private val shares: OperatorShareService, private val states: StarStateCurrentRepository) {
    fun view(code: String): StarShareResponse {
        val account = shares.sharedAccount(code, "star")
        val state = states.findByUserIdAndAccountId(account.userId, account.accountId)
        return StarShareResponse(
            account.game,
            account.effectiveShareScopes().filter { it in setOf("operator", "star") },
            state != null,
            state?.updatedAt,
            state?.inventory.orEmpty().map { StarShareEntry(it.kind, it.name, it.quality, it.level, it.breakthroughStage) },
        )
    }
}
