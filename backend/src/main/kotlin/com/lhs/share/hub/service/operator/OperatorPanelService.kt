package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.operator.response.OperatorPanelResponse
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorHuaji
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class OperatorPanelService(
    private val accounts: SubAccountService,
    private val catalogs: OperatorCatalogRepository,
    private val currents: OperatorCurrentRepository,
    private val stars: StarStateCurrentRepository,
    private val loadouts: StarLoadoutCurrentRepository,
    private val rules: PanelRuleService,
) {
    fun current(userId: String, request: JsonNode): Map<String, OperatorPanelResponse> {
        fields(request, setOf("account_id", "operator_ids"))
        val ids = request.path("operator_ids")
        if (!ids.isArray || ids.size() !in 1..100 || ids.any { !it.isTextual || it.asText().length !in 1..128 }) invalid("operator_ids")
        val selected = ids.map { it.asText() }
        if (selected.distinct().size != selected.size) invalid("operator_ids")
        return saved(userId, text(request, "account_id"), selected.toSet())
    }

    /** Also used after the existing share scope check; no public arbitrary-input share calculator. */
    fun saved(userId: String, accountId: String, operatorIds: Set<String>): Map<String, OperatorPanelResponse> {
        val context = context(userId, accountId)
        return operatorIds.associateWith { id ->
            val catalog = context.catalog[id]
            val entry = context.entries[id]
            if (catalog == null || entry == null) {
                unavailable(context, "operator_unavailable")
            } else {
                val huaji = OperatorHuajiRules.read(entry, catalog)
                calculate(
                    context, id, entry.level, entry.levelBreakthroughStage, entry.elite, huaji,
                    entry.combatStats?.oddities?.get("hp")?.current ?: 0.0,
                    entry.combatStats?.oddities?.get("attack")?.current ?: 0.0,
                    context.loadouts[id].orEmpty(), strict = false,
                    legacyStones = entry.starStones.isNotEmpty() && id !in context.loadouts,
                )
            }
        }
    }

    fun preview(userId: String, request: JsonNode): OperatorPanelResponse {
        fields(request, setOf("account_id", "operator_id", "level", "level_breakthrough_stage", "elite", "huaji", "oddities", "loadout"))
        val context = context(userId, text(request, "account_id"))
        val id = text(request, "operator_id")
        val catalog = context.catalog[id] ?: return unavailable(context, "operator_unavailable")
        val huajiNode = request.path("huaji")
        fields(huajiNode, setOf("owned", "stage", "awakened"))
        if (!huajiNode.path("owned").isBoolean) invalid("huaji.owned")
        val awakened = huajiNode.get("awakened")?.let {
            when {
                it.isNull -> null
                it.isBoolean -> it.booleanValue()
                else -> invalid("huaji.awakened")
            }
        }
        val huaji = OperatorHuaji(huajiNode.path("owned").booleanValue(), integer(huajiNode, "stage"), awakened)
        OperatorHuajiRules.validate(huaji, catalog)
        if (awakened == true && !OperatorHuajiRules.awakeningSupported(catalog)) invalid("huaji.awakened")
        val oddities = request.path("oddities")
        fields(oddities, setOf("attack", "hp"))
        val slots = if (request.has("loadout")) {
            val node = request.path("loadout")
            fields(node, SLOT_KEYS)
            node.properties().associate { (slot, value) ->
                slot to
                    if (value.isNull) {
                        null
                    } else {
                        value.takeIf { it.isTextual && it.asText().length in 1..128 }?.asText()
                            ?: invalid("loadout.$slot")
                    }
            }
        } else {
            context.loadouts[id].orEmpty()
        }
        return calculate(
            context, id, integer(request, "level"), integer(request, "level_breakthrough_stage"), integer(request, "elite"), huaji,
            integer(oddities, "hp")?.toDouble(), integer(oddities, "attack")?.toDouble(), slots, strict = true,
            legacyStones = !request.has("loadout") && id !in context.loadouts && context.entries[id]?.starStones?.isNotEmpty() == true,
        )
    }

    private fun context(userId: String, accountId: String): Context {
        val account = accounts.requireAccount(userId, accountId)
        val records = currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId)
        val entries = records.firstOrNull { it.game == "*" }?.entries.orEmpty() +
            records.firstOrNull { it.game == "universal" }?.entries.orEmpty() +
            records.firstOrNull { it.game == account.game }?.entries.orEmpty()
        val state = stars.findByUserIdAndAccountId(userId, accountId)
        val equipped = loadouts.findByUserIdAndAccountId(userId, accountId)
        return Context(
            rules.snapshot(account.game),
            catalogs.findAllByOrderByOperatorIdAsc().filter { account.game in it.games }.associateBy { it.operatorId },
            entries,
            state,
            equipped?.loadouts.orEmpty().associate { it.operatorId to it.slots.asMap() },
            equipped == null || equipped.generation == (state?.generation ?: 0),
        )
    }

    private fun calculate(
        context: Context,
        id: String,
        level: Int?,
        breakthrough: Int?,
        potential: Int?,
        huaji: OperatorHuaji,
        oddityHp: Double?,
        oddityAttack: Double?,
        slots: Map<String, String?>,
        strict: Boolean,
        legacyStones: Boolean,
    ): OperatorPanelResponse {
        val bundle = context.rules ?: return unavailable(context, "rules_unavailable")
        if (!huaji.owned) return unavailable(context, "not_owned")
        val rule = bundle.operators.singleOrNull { it.operatorId == id } ?: return unavailable(context, "operator_unsupported")
        val catalog = context.catalog.getValue(id)
        if (rule.rarity != catalog.rarity ||
            rule.maxStar != OperatorHuajiRules.maximum(catalog)
        ) {
            return unavailable(context, "catalog_mismatch")
        }
        val stage = huaji.stage ?: if (huaji.awakened == true) 25 else null
        val missing = buildList {
            if (level == null || !strict && level == 0) add("level")
            if (potential == null) add("elite")
            if (stage == null) add("huaji.stage")
            if (oddityHp == null) add("oddities.hp")
            if (oddityAttack == null) add("oddities.attack")
            if (legacyStones || !context.loadoutGenerationValid) add("loadout")
        }
        if (missing.isNotEmpty()) return OperatorPanelResponse("incomplete", missingFields = missing, ruleVersion = bundle.ruleSet.id)
        try {
            if (oddityHp!! % 1.0 != 0.0 || oddityAttack!! % 1.0 != 0.0) throw PanelInputException("oddities", "invalid")
            val inventory = context.stars?.inventory.orEmpty().associateBy { it.instanceId }
            val assigned = slots.filterValues { it != null }
            if (assigned.values.distinct().size != assigned.size) throw PanelInputException("loadout", "duplicate_instance")
            val stones = assigned.map { (slot, instance) ->
                val star = inventory[instance] ?: throw PanelInputException("loadout.$slot", "instance_unavailable")
                val kind = if (slot.startsWith("main")) "main" else "support"
                if (star.kind != kind) throw PanelInputException("loadout.$slot", "invalid_slot")
                if (!allowed(star.name, catalog)) throw PanelInputException("loadout.$slot", "operator_restriction")
                val quality = listOf("white", "green", "blue", "purple", "orange").indexOf(star.quality) + 1
                val stone = bundle.stars.singleOrNull { it.name == star.name && it.quality == quality && it.kind == kind }
                    ?: throw PanelInputException("loadout.$slot", "unsupported")
                PanelStone(stone.sourceId, star.level, star.breakthroughStage)
            }
            val values = OperatorPanelCalculator.calculate(
                bundle,
                id,
                PanelCultivation(level!!, breakthrough, potential!!, stage!!, huaji.awakened, oddityHp.toInt(), oddityAttack!!.toInt()),
                stones,
            )
            return OperatorPanelResponse("calculated", values.attack, values.hp, ruleVersion = bundle.ruleSet.id)
        } catch (error: PanelInputException) {
            val field = when (error.field) {
                "breakthrough_stage" -> "level_breakthrough_stage"
                "star" -> "huaji.stage"
                "awakened" -> "huaji.awakened"
                else -> error.field.replace(Regex("stones\\[(\\d+)]")) { match ->
                    "loadout.${slots.filterValues { it != null }.keys.elementAt(match.groupValues[1].toInt())}"
                }
            }
            if (strict && error.reason !in setOf("missing", "unsupported")) invalid(field)
            return OperatorPanelResponse(
                "incomplete",
                missingFields = listOf(field),
                reason = error.reason,
                ruleVersion = bundle.ruleSet.id,
            )
        }
    }

    private fun allowed(name: String, catalog: OperatorCatalogEntity): Boolean = when (name) {
        "紫微" -> catalog.subProf.any { it in setOf("龙盾", "longdun") }
        "破军" -> catalog.subProf.any { it in setOf("破军", "pojun") }
        "天机" -> catalog.subProf.any { it in setOf("神纪", "诡道", "shenji", "guidao") }
        "文昌" -> catalog.subProf.any { it in setOf("岐黄", "qihuang") }
        "天魁" -> "地" in catalog.prof
        "天钺" -> "水" in catalog.prof
        "左辅" -> "火" in catalog.prof
        "右弼" -> "风" in catalog.prof
        "天马" -> "阴" in catalog.prof
        "擎羊" -> "阳" in catalog.prof
        else -> true
    }

    private fun fields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in allowed }) invalid("request")
    }

    private fun text(node: JsonNode, key: String): String = node.path(key)
        .takeIf { it.isTextual && it.asText().isNotBlank() && it.asText().length <= 128 }?.asText() ?: invalid(key)

    private fun integer(node: JsonNode, key: String): Int? = node.get(key)?.let {
        if (it.isNull) null else it.takeIf { value -> value.isIntegralNumber && value.canConvertToInt() }?.intValue() ?: invalid(key)
    }

    private fun unavailable(context: Context, reason: String) =
        OperatorPanelResponse("unsupported", reason = reason, ruleVersion = context.rules?.ruleSet?.id)
    private fun invalid(field: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "panel_invalid_input", "Invalid panel input", fieldPath = field)

    private data class Context(
        val rules: PanelRuleBundle?,
        val catalog: Map<String, OperatorCatalogEntity>,
        val entries: Map<String, OperatorEntry>,
        val stars: StarStateCurrent?,
        val loadouts: Map<String, Map<String, String?>>,
        val loadoutGenerationValid: Boolean,
    )

    companion object {
        private val SLOT_KEYS = StarLoadoutSlots().asMap().keys
    }
}
