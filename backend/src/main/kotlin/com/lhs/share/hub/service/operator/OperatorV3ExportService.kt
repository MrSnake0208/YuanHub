package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorGrowthTargetRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.repository.entity.normalized
import com.lhs.share.hub.repository.entity.oddityNumberNode
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

@Service
class OperatorV3ExportService(
    private val objectMapper: ObjectMapper,
    private val accountRepository: SubAccountRepository,
    private val currentRepository: OperatorCurrentRepository,
    private val annotationRepository: OperatorAnnotationRepository,
    private val targetRepository: OperatorGrowthTargetRepository,
    private val favoriteRepository: InventoryAgentFavoriteRepository,
    private val catalogService: OperatorCatalogService,
) {
    fun export(userId: String, accountId: String?, scope: String?, version: Int = 3): ObjectNode {
        val accounts = accounts(userId, accountId, scope)
        val now = Instant.now()
        val exportId = UUID.randomUUID().toString().replace("-", "")
        val root = objectMapper.createObjectNode()
            .put("format", "myshare-operator-exchange")
            .put("version", version)
            .put("exported_at", now.toString())
            .put("catalog_version", catalogService.currentCatalogVersion())
        root.set<ObjectNode>(
            "producer",
            objectMapper.createObjectNode().put("platform", "myshare").put("version", "6"),
        )
        val accountNodes = root.putArray("accounts")
        accounts.forEach { account ->
            accountNodes.add(
                objectMapper.createObjectNode()
                    .put("id", account.accountId)
                    .put("name", account.name)
                    .put("game_scope", account.game),
            )
        }
        val records = root.putArray("records")
        accounts.forEach { account ->
            val currents = currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, account.accountId)
            if (currents.isEmpty()) {
                records.add(objectiveRecord(account, exportId, now, emptyMap(), version))
            } else {
                val merged = linkedMapOf<String, OperatorEntry>()
                currents.filter { it.game == "*" || it.game == "universal" }.forEach { merged.putAll(it.entries) }
                currents.filter { it.game == account.game }.forEach { merged.putAll(it.entries) }
                records.add(objectiveRecord(account, exportId, now, merged, version))
            }
            records.add(annotationRecord(userId, account, exportId, now, version))
        }
        return root
    }

    private fun objectiveRecord(
        account: SubAccount,
        exportId: String,
        now: Instant,
        entries: Map<String, OperatorEntry>,
        version: Int,
    ): ObjectNode {
        val record = baseRecord(account, "myshare:export:$exportId:${account.accountId}:objective", "operator_snapshot", now)
        val array = record.putArray("entries")
        entries.toSortedMap().forEach { (operatorId, raw) ->
            val entry = raw.normalized()
            val node = objectMapper.createObjectNode()
                .put("operator_id", operatorId)
                .put("level", entry.level)
                .put("elite", entry.elite)
                .put("star_level", entry.starLevel)
            val catalog = catalogService.getOperator(operatorId)
            if (version >= 5) {
                val stage = OperatorLevelBreakthroughRules.read(entry.level, entry.levelBreakthroughStage)
                if (stage == null) node.putNull("level_breakthrough_stage") else node.put("level_breakthrough_stage", stage)
            } else {
                node.withArray(
                    "warnings",
                ).add("level_breakthrough_information_loss: use v5 to preserve level breakthrough and observed inputs")
            }
            run {
                val huaji = OperatorHuajiRules.read(entry, catalog)
                if (version >= 4) {
                    node.remove("star_level")
                    node.set<JsonNode>("huaji", objectMapper.valueToTree(huaji))
                    node.set<JsonNode>(
                        "huaji_legacy",
                        objectMapper.valueToTree(
                            OperatorHuajiRules.trace(entry, catalog),
                        ),
                    )
                } else {
                    node.withArray(
                        "warnings",
                    ).add(
                        "legacy_huaji_information_loss: owned=${huaji.owned}, stage=${huaji.stage}, awakened=${huaji.awakened}; legacy star_level=${entry.starLevel} cannot encode independent facts, use v4",
                    )
                }
            }
            val loadouts = node.putArray("disc_loadouts")
            entry.discLoadouts.forEach { loadout ->
                val loadoutNode = objectMapper.createObjectNode().put("id", loadout.id).put("name", loadout.name)
                val discs = loadoutNode.putArray("discs")
                loadout.discs.forEach { disc -> discs.add(objectMapper.createObjectNode().put("ot_name", disc.otName)) }
                loadoutNode.put("status", loadout.status)
                val targets = loadoutNode.putArray("target_discs")
                loadout.targetDiscs.forEach { disc -> targets.add(objectMapper.createObjectNode().put("ot_name", disc.otName)) }
                loadouts.add(loadoutNode)
            }
            val stones = node.putArray("equipped_star_stones")
            entry.starStones.forEach { stone ->
                stones.add(
                    objectMapper.createObjectNode()
                        .put("type", stone.type)
                        .put("name", stone.name ?: stone.type)
                        .put("level", stone.level),
                )
            }
            entry.combatStats?.let { stats ->
                val combat = objectMapper.createObjectNode()
                stats.observedAttack?.let { combat.put("observed_attack", it) }
                stats.observedHp?.let { combat.put("observed_hp", it) }
                if (stats.manualAttack == null) combat.putNull("manual_attack") else combat.put("manual_attack", stats.manualAttack)
                if (stats.manualHp == null) combat.putNull("manual_hp") else combat.put("manual_hp", stats.manualHp)
                stats.displayMode?.let { mode ->
                    val display = objectMapper.createObjectNode()
                    mode.attack?.let { display.put("attack", it) }
                    mode.hp?.let { display.put("hp", it) }
                    if (!display.isEmpty) combat.set<ObjectNode>("display_mode", display)
                }
                stats.source?.let { combat.put("source", it) }
                stats.observedAt?.let { combat.put("observed_at", it.toString()) }
                stats.observedStatus?.let { combat.put("observed_status", it) }
                stats.combatInputSignature?.let { combat.put("combat_input_signature", it) }
                stats.observedInputs?.let { inputs ->
                    val observed = objectMapper.createObjectNode()
                    inputs.level?.let { observed.put("level", it) }
                    if (version >= 5) {
                        if (inputs.levelBreakthroughStage ==
                            null
                        ) {
                            observed.putNull("level_breakthrough_stage")
                        } else {
                            observed.put("level_breakthrough_stage", inputs.levelBreakthroughStage)
                        }
                    }
                    inputs.elite?.let { observed.put("elite", it) }
                    inputs.starLevel?.let { observed.put("star_level", it) }
                    if (version >= 4) inputs.huaji?.let { observed.set<JsonNode>("huaji", objectMapper.valueToTree(it)) }
                    inputs.odditiesSignature?.let { observed.put("oddities_signature", it) }
                    inputs.equippedStarStonesSignature?.let { observed.put("equipped_star_stones_signature", it) }
                    if (!observed.isEmpty) combat.set<ObjectNode>("observed_inputs", observed)
                }
                if (stats.oddities.isNotEmpty()) {
                    val oddities = objectMapper.createObjectNode()
                    stats.oddities.forEach { (key, value) ->
                        oddities.set<ObjectNode>(
                            key,
                            objectMapper.createObjectNode().set<JsonNode>("current", oddityNumberNode(value.current)),
                        )
                    }
                    combat.set<ObjectNode>("oddities", oddities)
                }
                if (!combat.isEmpty) node.set<ObjectNode>("combat_stats", combat)
            }
            array.add(node)
        }
        return record
    }

    private fun annotationRecord(userId: String, account: SubAccount, exportId: String, now: Instant, versionForTargets: Int): ObjectNode {
        val record = baseRecord(account, "myshare:export:$exportId:${account.accountId}:annotations", ANNOTATION, now)
        val annotations = annotationRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, account.accountId)
            .associateBy { it.operatorId }
        val targets = targetRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, account.accountId)
            .associateBy { it.operatorId }
        val favorites = favoriteRepository.findAllByUserIdAndAccountIdOrderByAgentIdAsc(userId, account.accountId)
            .map { it.agentId }.toSet()
        val operatorIds = (annotations.keys + targets.keys + favorites).toSortedSet()
        val array = record.putArray("entries")
        operatorIds.forEach { operatorId ->
            val annotation = annotations[operatorId]
            val target = targets[operatorId]
            val node = objectMapper.createObjectNode()
                .put("operator_id", operatorId)
                .put("growth_state", annotation?.growthState ?: OperatorSubjectiveService.ACTIVE)
                .put("favorite", operatorId in favorites)
            if (annotation?.note == null) node.putNull("note") else node.put("note", annotation.note)
            if (target == null) {
                node.putNull("targets")
            } else {
                val targetNode = objectMapper.createObjectNode()
                target.targetLevel?.let { targetNode.put("level", it) }
                target.targetElite?.let { targetNode.put("elite", it) }
                if (versionForTargets >= 4 && target.targetHuaji != null) {
                    targetNode.set<JsonNode>("huaji", objectMapper.valueToTree(target.targetHuaji))
                } else {
                    target.targetStarLevel?.let { targetNode.put("star_level", it) }
                }
                target.targetHeartPaper?.let { targetNode.put("heart_paper", it) }
                node.set<ObjectNode>("targets", targetNode)
            }
            array.add(node)
        }
        return record
    }

    private fun baseRecord(account: SubAccount, id: String, type: String, now: Instant) = objectMapper.createObjectNode()
        .put("account_id", account.accountId)
        .put("record_id", id)
        .put("record_type", type)
        .put("game", account.game)
        .put("effective_at", now.toString())
        .put("snapshot_scope", "full")
        .put("source_kind", "backup")

    private fun accounts(userId: String, accountId: String?, scope: String?): List<SubAccount> = when {
        accountId != null && scope == null -> listOf(
            accountRepository.findByUserIdAndAccountId(userId, accountId)
                ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found"),
        )
        accountId == null && scope == "all" -> accountRepository.findAllByUserIdOrderByCreatedAtAsc(userId)
        else -> throw OperatorApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "schema_validation_failed",
            "Specify account_id or scope=all",
        )
    }

    companion object {
        private const val ANNOTATION = "operator_annotation_snapshot"
    }
}
