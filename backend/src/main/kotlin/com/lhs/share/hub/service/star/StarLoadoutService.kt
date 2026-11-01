package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarLoadoutCurrentRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutCurrentResponse
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Service
class StarLoadoutService(
    private val repository: StarLoadoutCurrentRepository,
    private val states: StarStateCurrentRepository,
    private val accountService: SubAccountService,
    private val stateService: StarStateService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun current(userId: String, accountId: String): StarLoadoutCurrentResponse {
        accountService.requireAccount(userId, accountId)
        return repository.findByUserIdAndAccountId(userId, accountId)
            ?.let(StarLoadoutCurrentResponse::of)
            ?: StarLoadoutCurrentResponse.empty(accountId)
    }

    fun putCurrent(userId: String, accountId: String, request: StarLoadoutCurrentRequest): StarLoadoutCurrentResponse {
        val account = accountService.requireAccount(userId, accountId)
        val normalized = normalize(request)
        val expectedGeneration = request.expectedGeneration?.takeIf { it >= 0 } ?: throw invalid("expected_generation 不能为空且不能小于 0")
        return starCasConflictBoundary({
            if (states.findByUserIdAndAccountId(userId, accountId)?.generation != expectedGeneration) throw generationChanged()
            throw conflict()
        }) { requireNotNull(transactions.execute {
            val state = states.findByUserIdAndAccountId(userId, accountId)
                ?: throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_loadout_inventory_required", "A current star state is required before saving loadout")
            if (state.generation != expectedGeneration) throw generationChanged()
            validateReferences(state.inventory, normalized.loadouts, stateService.operatorIds(userId, accountId, account.game))
            if (!states.fenceLoadoutWrite(userId, accountId, state.generation, state.revision)) throw generationChanged()
            val saved = starCasConflictBoundary({ throw conflict() }) {
                repository.replaceForGeneration(userId, accountId, normalized.expectedRevision, expectedGeneration, normalized.loadouts, Instant.now())
                    ?: throw conflict()
            }
            StarLoadoutCurrentResponse.of(saved)
        }) }
    }

    private fun normalize(request: StarLoadoutCurrentRequest): NormalizedLoadouts {
        val expected = request.expectedRevision ?: throw invalid("expected_revision 不能为空")
        if (expected < 0) throw invalid("expected_revision 不能小于 0")
        val loadouts = request.loadouts ?: throw invalid("loadouts 不能为空")
        if (loadouts.size > MAX_OPERATORS) throw invalid("loadouts 数量不能超过 $MAX_OPERATORS")
        val normalized = loadouts.entries.sortedBy { it.key }.map { (operatorId, slots) ->
            if (!OPERATOR_ID.matches(operatorId)) throw invalid("operator_id 格式无效")
            if (slots.keys != SLOT_KEYS) throw invalid("每个 operator 必须恰好提供六个合法槽位")
            val normalizedSlots = SLOT_ORDER.associateWith { slot -> slots[slot] }
            normalizedSlots.values.filterNotNull().forEach { instanceId ->
                if (!INSTANCE_ID.matches(instanceId)) throw invalid("instance_id 格式无效")
            }
            StarOperatorLoadout(
                operatorId,
                StarLoadoutSlots(
                    normalizedSlots.getValue("main1"),
                    normalizedSlots.getValue("main2"),
                    normalizedSlots.getValue("main3"),
                    normalizedSlots.getValue("support1"),
                    normalizedSlots.getValue("support2"),
                    normalizedSlots.getValue("support3"),
                ),
            )
        }
        return NormalizedLoadouts(expected, normalized)
    }

    private fun validateReferences(inventoryEntries: List<StarStateEntry>, loadouts: List<StarOperatorLoadout>, operatorIds: Set<String>) {
        if (loadouts.any { it.operatorId !in operatorIds }) throw InventoryApiException(
            HttpStatus.UNPROCESSABLE_ENTITY, "star_loadout_invalid_operator", "operator_id does not exist in the current account",
        )
        val assignments = loadouts.flatMap { loadout ->
            loadout.slots.values().mapNotNull { (slot, instanceId) ->
                instanceId?.let { Assignment(loadout.operatorId, slot, it) }
            }
        }
        if (assignments.isEmpty()) return
        if (inventoryEntries.isEmpty()) throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "star_loadout_inventory_required",
                "A current star inventory is required before assigning stars",
            )
        val byId = inventoryEntries.associateBy(StarStateEntry::instanceId)
        val occupied = HashSet<String>()
        assignments.forEach { assignment ->
            if (assignment.operatorId !in operatorIds) throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "star_loadout_invalid_operator",
                "Assigned operator_id does not exist in the current account",
            )
            val entry = byId[assignment.instanceId] ?: throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "star_loadout_invalid_reference",
                "Assigned instance_id does not exist in the current star inventory",
            )
            val expectedKind = if (assignment.slot in MAIN_SLOTS) "main" else "support"
            if (entry.kind != expectedKind) {
                throw InventoryApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "star_loadout_slot_kind_mismatch",
                    "Star kind does not match the target slot",
                )
            }
            if (!occupied.add(assignment.instanceId)) {
                throw InventoryApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "star_loadout_instance_occupied",
                    "A star instance can be assigned only once per account",
                )
            }
        }
    }

    private fun invalid(message: String) = InventoryApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "star_loadout_invalid_snapshot",
        message,
    )

    private fun conflict() = InventoryApiException(
        HttpStatus.CONFLICT,
        "star_loadout_revision_conflict",
        "Star loadout changed; reload before saving",
    )

    private fun generationChanged() = InventoryApiException(
        HttpStatus.CONFLICT,
        "star_generation_changed",
        "Star generation changed; reload before saving loadout",
    )

    private data class NormalizedLoadouts(val expectedRevision: Long, val loadouts: List<StarOperatorLoadout>)

    private data class Assignment(val operatorId: String, val slot: String, val instanceId: String)

    companion object {
        private const val MAX_OPERATORS = 500
        private val OPERATOR_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        private val INSTANCE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        private val SLOT_ORDER = listOf("main1", "main2", "main3", "support1", "support2", "support3")
        private val SLOT_KEYS = SLOT_ORDER.toSet()
        private val MAIN_SLOTS = setOf("main1", "main2", "main3")
    }
}
