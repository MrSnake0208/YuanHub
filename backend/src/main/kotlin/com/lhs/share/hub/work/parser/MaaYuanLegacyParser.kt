package com.lhs.share.hub.work.parser

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.work.model.AutoBattleAction
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.CompatibilityIssue
import com.lhs.share.hub.work.model.CompatibilityStatus
import com.lhs.share.hub.work.model.DragonQiCondition
import com.lhs.share.hub.work.model.InteractionAction
import com.lhs.share.hub.work.model.MaaYuanExtension
import com.lhs.share.hub.work.model.OperatorAction
import com.lhs.share.hub.work.model.OperatorAliveCondition
import com.lhs.share.hub.work.model.OperatorCopiedCondition
import com.lhs.share.hub.work.model.OperatorPresentCondition
import com.lhs.share.hub.work.model.PartySurvivesCondition
import com.lhs.share.hub.work.model.RestartAction
import com.lhs.share.hub.work.model.SlotAction
import com.lhs.share.hub.work.model.StarCountCondition
import com.lhs.share.hub.work.model.SwitchTargetAction
import com.lhs.share.hub.work.model.WaitAction
import com.lhs.share.hub.work.model.WorkAction
import com.lhs.share.hub.work.model.WorkCondition
import com.lhs.share.hub.work.model.WorkDelays
import com.lhs.share.hub.work.model.WorkExec
import com.lhs.share.hub.work.model.WorkExtensions
import com.lhs.share.hub.work.model.WorkRound
import com.lhs.share.hub.work.model.YuanAssistExtension
import org.springframework.stereotype.Component

data class LegacyWorkDraft(
    val game: String?,
    val stageName: String?,
    val title: String?,
    val details: String,
    val operators: List<String?>,
    val exec: WorkExec?,
    val rounds: List<WorkRound>,
    val levelIdHint: String?,
    val stageIdHint: String?,
    val levelNameHint: String?,
)

data class LegacyParseResult(val draft: LegacyWorkDraft?, val issues: List<CompatibilityIssue>)

@Component
class MaaYuanLegacyParser(private val objectMapper: ObjectMapper) {
    fun parse(rawContent: String): LegacyParseResult {
        val issues = mutableListOf<CompatibilityIssue>()
        val root = try {
            objectMapper.readTree(rawContent)
        } catch (_: Exception) {
            return LegacyParseResult(null, listOf(issue("invalid_source_json", "$", "source", "content 不是合法 JSON")))
        }
        if (!root.isObject) {
            return LegacyParseResult(null, listOf(issue("invalid_source_document", "$", "source", "content 顶层必须是对象")))
        }

        val operators = parseOperators(root, issues)
        val rounds = parseRounds(root, operators, issues)
        if (rounds.isEmpty()) {
            issues += issue("missing_rounds", "$.actions", "rounds", "未找到可解释的 SiMing 回合动作")
        }
        val stageName = root.text("stage_name", "stageName")?.takeIf { value ->
            if (value.length <= 256) {
                true
            } else {
                issues += issue("invalid_stage_name", "$.stage_name", "stage_name", "关卡名称超过协议长度限制")
                false
            }
        }
        if (stageName == null) issues += issue("missing_stage_name", "$.stage_name", "stage_name", "作业缺少关卡名称")
        val title = root.path("doc").text("title")?.takeIf { value ->
            if (value.length <= 256) {
                true
            } else {
                issues += issue("invalid_title", "$.doc.title", "doc:title", "作业标题超过协议长度限制")
                false
            }
        }
        if (title == null) issues += issue("missing_title", "$.doc.title", "doc:title", "作业缺少标题")
        val details = root.path("doc").text("details") ?: ""
        if (details.length > 20_000) {
            issues += issue("invalid_details", "$.doc.details", "doc:details", "作业说明超过协议长度限制")
        }

        val levelMeta = root.first("level_meta", "levelMeta")
        return LegacyParseResult(
            LegacyWorkDraft(
                game = root.text("game")?.takeIf(::isGame),
                stageName = stageName,
                title = title,
                details = details,
                operators = operators,
                exec = parseExec(root, issues),
                rounds = rounds,
                levelIdHint = levelMeta?.text("level_id", "levelId") ?: root.text("level_id", "levelId"),
                stageIdHint = levelMeta?.text("stage_id", "stageId") ?: root.text("stage_id", "stageId") ?: stageName,
                levelNameHint = levelMeta?.text("name") ?: stageName,
            ),
            issues,
        )
    }

    private fun parseOperators(root: JsonNode, issues: MutableList<CompatibilityIssue>): List<String?> {
        val node = root.path("opers")
        val names = if (node.isArray) {
            node.map { operator ->
                when {
                    operator.isTextual -> operator.asText().trim().ifEmpty { null }
                    operator.isObject -> operator.text("name")
                    else -> null
                }
            }
        } else {
            emptyList()
        }
        if (names.size < 5) {
            issues += partialIssue("incomplete_operators", "$.opers", "operators", "源作业不足五个槽位，缺失槽位保留为 null")
        }
        if (names.size > 5) {
            issues += issue("too_many_operators", "$.opers", "operators", "源作业包含超过五个槽位")
        }
        return names.take(5) + List((5 - names.size).coerceAtLeast(0)) { null }
    }

    private fun parseRounds(root: JsonNode, operators: List<String?>, issues: MutableList<CompatibilityIssue>): List<WorkRound> {
        val candidates = listOf("actions", "siming_actions", "simingActions")
            .mapNotNull { root.path(it).takeUnless(JsonNode::isMissingNode)?.takeUnless(JsonNode::isNull) }
        val actions = candidates.firstOrNull(JsonNode::isObject) ?: directRoundMap(root)
        if (actions == null && candidates.any(JsonNode::isArray)) {
            issues += issue(
                "unsupported_source_actions",
                "$.actions",
                "legacy_copilot_actions",
                "MAA Copilot actions 数组不是 SiMing 回合语义",
            )
            return emptyList()
        }
        if (actions == null || !actions.isObject) return emptyList()
        return if (actions.fieldNames().asSequence().any { ACTION_NODE.matches(it) || ROUND_NODE.matches(it) }) {
            parsePipeline(actions, operators, issues)
        } else {
            parseRoundActions(actions, operators, issues)
        }
    }

    private fun directRoundMap(root: JsonNode): JsonNode? = root.takeIf { candidate ->
        candidate.fieldNames().asSequence().any { it.toIntOrNull() != null }
    }

    private fun parseRoundActions(actions: JsonNode, operators: List<String?>, issues: MutableList<CompatibilityIssue>): List<WorkRound> =
        actions.fields().asSequence()
            .mapNotNull { (roundKey, entries) ->
                val round = roundKey.toIntOrNull() ?: return@mapNotNull null
                if (round !in 1..50 || !entries.isArray) {
                    issues += issue("invalid_round", "$.actions.$roundKey", "round", "回合编号或动作列表无效")
                    return@mapNotNull null
                }
                val parsed = entries.mapIndexedNotNull { index, entry ->
                    val token = when {
                        entry.isTextual -> entry.asText()
                        entry.isArray -> entry.firstOrNull()?.takeIf(JsonNode::isTextual)?.asText()
                        else -> null
                    }
                    if (token == null) {
                        issues += issue(
                            "unsupported_source_node",
                            "$.actions.$roundKey[$index]",
                            "source_action",
                            "无法解释动作节点",
                        )
                        null
                    } else {
                        parseToken(token.trim(), operators, "$.actions.$roundKey[$index]", issues)
                    }
                }
                parsed.takeIf { it.isNotEmpty() }?.let { WorkRound(round, actions = it) }
            }.sortedBy(WorkRound::round).toList()

    private fun parsePipeline(actions: JsonNode, operators: List<String?>, issues: MutableList<CompatibilityIssue>): List<WorkRound> {
        val byRound = sortedMapOf<Int, MutableList<WorkAction>>()
        actions.fields().asSequence().mapNotNull { (key, node) ->
            ACTION_NODE.matchEntire(key)?.let { Triple(it.groupValues[1].toInt(), it.groupValues[2].toInt(), key to node) }
        }.sortedWith(compareBy({ it.first }, { it.second })).forEach { (round, _, pair) ->
            val (key, node) = pair
            val path = "$.actions.${pathKey(key)}"
            if (round !in 1..50) {
                issues += issue("invalid_round", path, "round", "回合编号必须在 1..50")
                return@forEach
            }
            validateBranches(node, path, issues)
            val action = parsePipelineNode(node, operators, path, issues)
            if (action != null) byRound.getOrPut(round) { mutableListOf() } += action
            appendLegacyNextActions(node, byRound.getOrPut(round) { mutableListOf() })
        }

        actions.fields().forEachRemaining { (key, node) ->
            val match = ROUND_NODE.matchEntire(key) ?: return@forEachRemaining
            val round = match.groupValues[1].toInt()
            val path = "$.actions.${pathKey(key)}"
            if (round !in 1..50) {
                issues += issue("invalid_round", path, "round", "回合编号必须在 1..50")
                return@forEachRemaining
            }
            validateBranches(node, path, issues)
            val prefix = mutableListOf<WorkAction>()
            node.stringList("next").forEach { target ->
                when {
                    target == FULL_RESTART -> prefix += CheckAction(condition = PartySurvivesCondition(), onFail = "restart")
                    target == MANUAL_RESTART -> prefix += RestartAction()
                    OLD_STAR_NODE.matches(target) -> prefix += starAction(OLD_STAR_NODE.matchEntire(target)!!.groupValues[2])
                }
            }
            if (prefix.isNotEmpty()) byRound.getOrPut(round) { mutableListOf() }.addAll(0, prefix)
        }

        return byRound.mapNotNull { (round, roundActions) ->
            roundActions.takeIf { it.isNotEmpty() }?.let { WorkRound(round, actions = it) }
        }
    }

    private fun parsePipelineNode(
        node: JsonNode,
        operators: List<String?>,
        path: String,
        issues: MutableList<CompatibilityIssue>,
    ): WorkAction? {
        val customAction = node.text("custom_action", "customAction")
        if (node.text("action") == "Custom" && customAction == null) {
            issues += issue("unsupported_source_node", path, "custom_action:missing", "Custom 动作缺少 custom_action")
            return null
        }
        if (customAction != null && customAction !in KNOWN_CUSTOM_ACTIONS) {
            issues += issue("unsupported_source_node", path, "custom_action:$customAction", "未知 CustomAction")
            return null
        }
        val params = node.first("custom_action_param", "customActionParam")
        when (customAction) {
            "AllDownRestart" -> return CheckAction(condition = PartySurvivesCondition(), onFail = "restart")
            "DownRestart" -> return slotCheck(params, path, issues) { OperatorAliveCondition(slot = it) }
            "RetreatRestart" -> return slotCheck(params, path, issues) { OperatorPresentCondition(slot = it) }
            "BirdRestart" -> return slotCheck(params, path, issues) { OperatorCopiedCondition(slot = it) }
            "DragonRestart" -> return slotCheck(params, path, issues) { DragonQiCondition(slot = it, operator = ">=", value = 2) }
            "StarRestart" -> {
                val color = params?.text("expect")?.let(::starColor)
                val invert = params?.path("invert")?.takeIf(JsonNode::isBoolean)?.asBoolean()
                if (color != null && invert == true) return starAction(color)
                issues += issue("unsupported_source_node", path, "star_restart", "无法无损解释星检测条件")
                return null
            }
        }

        val text = node.text("text_doc", "textDoc")?.trim()
        if (text == "等待") {
            val duration = node.int("post_delay", "postDelay", "rear_delay", "rearDelay")
            return if (duration != null && duration in 1..600_000) {
                WaitAction(durationMs = duration)
            } else {
                issues += issue("invalid_wait", path, "wait", "等待节点缺少正数时长")
                null
            }
        }
        val normalized = when {
            text?.startsWith("再动") == true -> "额外:${text.removePrefix("再动")}"
            text == "左侧目标" -> "额外:左侧目标"
            text == "右侧目标" -> "额外:右侧目标"
            text == "吕布" -> "额外:吕布"
            text == "开自动" || text == "开启自动战斗" -> "额外:开自动"
            text == "关卡内互动" -> "额外:关卡内互动"
            text == "左上角重开" -> "重开:左上角"
            text != null && SLOT_DETECTION_TEXT.matches(text) -> {
                val match = SLOT_DETECTION_TEXT.matchEntire(text)!!
                "重开:检测${match.groupValues[1]}号位${match.groupValues[2]}"
            }
            else -> text
        }
        if (normalized == null) {
            issues += issue("unsupported_source_node", path, "pipeline_node", "动作节点缺少可解释的 text_doc")
            return null
        }
        return parseToken(normalized, operators, path, issues)
    }

    private fun slotCheck(
        params: JsonNode?,
        path: String,
        issues: MutableList<CompatibilityIssue>,
        factory: (Int) -> WorkCondition,
    ): WorkAction? {
        val slot = params?.int("position")
        if (slot !in 1..5) {
            issues += issue("invalid_detection_slot", path, "check", "检测节点缺少合法槽位")
            return null
        }
        return CheckAction(condition = factory(slot!!), onFail = "restart")
    }

    private fun parseToken(
        sourceToken: String,
        operators: List<String?>,
        path: String,
        issues: MutableList<CompatibilityIssue>,
    ): WorkAction? {
        val token = sourceToken.trim()
        val basic = BASIC_TOKEN.matchEntire(token)
        if (basic != null) {
            val type = when (basic.groupValues[2].lowercase()) {
                "普" -> "attack"
                "大" -> "ultimate"
                "下" -> "defense"
                else -> "sp"
            }
            return SlotAction(basic.groupValues[1].toInt(), type)
        }
        WAIT_TOKEN.matchEntire(token)?.let { match ->
            val duration = match.groupValues[1].toIntOrNull()
            if (duration != null && duration in 1..600_000) return WaitAction(durationMs = duration)
            issues += issue("invalid_wait", path, "wait", "等待时长必须在 1..600000")
            return null
        }
        return when (token) {
            "额外:左侧目标" -> SwitchTargetAction(direction = "left")
            "额外:右侧目标" -> SwitchTargetAction(direction = "right")
            "额外:开自动" -> AutoBattleAction(enabled = true)
            "额外:关卡内互动" -> InteractionAction()
            "重开:全灭" -> CheckAction(condition = PartySurvivesCondition(), onFail = "restart")
            "重开:左上角" -> RestartAction()
            "重开:无橙星" -> starAction("orange")
            "重开:无紫星" -> starAction("purple")
            "重开:无蓝星" -> starAction("blue")
            "额外:史子眇sp" -> operatorSlot("史子眇", operators, path, issues)?.let { SlotAction(it, "sp") }
            "额外:吕布" -> operatorSlot("吕布", operators, path, issues)?.let {
                OperatorAction(slot = it, action = "switch_form")
            }
            else -> parseDetectionToken(token) ?: run {
                issues += issue("unsupported_source_node", path, "source_action:$token", "未知 SiMing 动作 token")
                null
            }
        }
    }

    private fun parseDetectionToken(token: String): WorkAction? {
        val match = DETECTION_TOKEN.matchEntire(token) ?: return null
        val slot = match.groupValues[1].toInt()
        val condition = when (match.groupValues[2]) {
            "阵亡" -> OperatorAliveCondition(slot = slot)
            "退场" -> OperatorPresentCondition(slot = slot)
            "鹦鹉" -> OperatorCopiedCondition(slot = slot)
            else -> DragonQiCondition(slot = slot, operator = ">=", value = 2)
        }
        return CheckAction(condition = condition, onFail = "restart")
    }

    private fun operatorSlot(name: String, operators: List<String?>, path: String, issues: MutableList<CompatibilityIssue>): Int? {
        val slots = operators.mapIndexedNotNull { index, operator -> (index + 1).takeIf { operator == name } }
        if (slots.size == 1) return slots.single()
        issues += issue("ambiguous_operator_slot", path, "operator:$name", "无法唯一确定$name 的槽位")
        return null
    }

    private fun appendLegacyNextActions(node: JsonNode, target: MutableList<WorkAction>) {
        val next = node.stringList("next")
        if (FULL_RESTART in next) target += CheckAction(condition = PartySurvivesCondition(), onFail = "restart")
        if (MANUAL_RESTART in next) target += RestartAction()
    }

    private fun validateBranches(node: JsonNode, path: String, issues: MutableList<CompatibilityIssue>) {
        listOf("next", "on_error", "onError").forEach { field ->
            node.stringList(field).filterNot(::isKnownBranch).forEach { target ->
                issues += issue(
                    "unsupported_source_node",
                    "$path.${field.replace("onError", "on_error")}",
                    "pipeline_branch:$target",
                    "未知 Pipeline 分支目标",
                )
            }
        }
    }

    private fun parseExec(root: JsonNode, issues: MutableList<CompatibilityIssue>): WorkExec? {
        val actionGraph = listOf("actions", "siming_actions", "simingActions")
            .firstNotNullOfOrNull { root.path(it).takeIf(JsonNode::isObject) }
        val customDelay = actionGraph?.path("抄作业自定义延时")
        val delays = customDelay?.takeIf(JsonNode::isObject)?.let { node ->
            WorkDelays(
                attack = delay(node, issues, "attack_delay", "attackDelay"),
                ultimate = delay(node, issues, "ult_delay", "ultDelay"),
                defense = delay(node, issues, "defense_delay", "defenseDelay"),
                sp = delay(node, issues, "ult_delay", "ultDelay"),
            ).takeUnless { it.attack == null && it.ultimate == null && it.defense == null }
        }
        val nav = parseNavigation(actionGraph)
        val maayuan = MaaYuanExtension(
            levelType = root.text("level_type", "levelType") ?: nav.levelType,
            recognitionName = root.text("level_recognition_name", "levelRecognitionName") ?: nav.recognitionName,
            recTargetOffset = intArray(root.first("rec_target_offset", "recTargetOffset")) ?: nav.recTargetOffset,
            difficulty = root.text("activity_difficulty_override", "activityDifficultyOverride") ?: nav.difficulty,
            caveType = root.text("cave_type", "caveType") ?: nav.caveType,
            lantaiNav = root.boolean("lantai_nav", "lantaiNav"),
        ).takeUnless { it == MaaYuanExtension() }
        val yuanassist = root.first("yuanassist", "yuanassist_extension")?.int("enemy_turn_wait_ms", "enemyTurnWaitMs")
            ?.let(::YuanAssistExtension)
        val extensions = WorkExtensions(maayuan, yuanassist).takeUnless { maayuan == null && yuanassist == null }
        return WorkExec(delays, extensions).takeUnless { delays == null && extensions == null }
    }

    private fun delay(node: JsonNode, issues: MutableList<CompatibilityIssue>, vararg names: String): Int? {
        val value = node.int(*names) ?: return null
        if (value in 0..600_000) return value
        issues += issue(
            "invalid_delay",
            "$.actions['抄作业自定义延时'].${names.first()}",
            "delay",
            "动作延迟必须在 0..600000",
        )
        return null
    }

    private fun parseNavigation(actions: JsonNode?): MaaYuanExtension {
        if (actions == null) return MaaYuanExtension()
        val restartTargets = actions.path("抄作业点左上角重开").stringList("next")
        val typeTarget = restartTargets.lastOrNull()
        val (levelType, nodeName) = when (typeTarget) {
            "抄作业找到关卡-主线" -> "主线" to null
            "抄作业进入关卡-洞窟" -> "洞窟" to typeTarget
            "抄作业找到关卡-活动" -> "活动" to typeTarget
            "抄作业找到关卡-活动分级" -> "活动有分级" to typeTarget
            "抄作业进入关卡-白鹄" -> "白鹄" to null
            "抄作业找到关卡-兰台" -> "兰台" to typeTarget
            "抄作业找到关卡-OCR" -> "其他" to typeTarget
            else -> null to null
        }
        val node = nodeName?.let(actions::path)
        val recognition = when (levelType) {
            "兰台" -> node?.text("level")
            "活动", "活动有分级", "其他" -> node?.text("expected")
            else -> null
        }
        return MaaYuanExtension(
            levelType = levelType,
            recognitionName = recognition,
            recTargetOffset = intArray(node?.first("target_offset", "targetOffset")),
            difficulty = actions.path("抄作业选择活动分级").text("expected"),
            caveType = if (levelType == "洞窟") node?.text("text_doc", "textDoc") else null,
        )
    }

    private fun intArray(node: JsonNode?): List<Int>? = node?.takeIf(JsonNode::isArray)
        ?.mapNotNull { it.takeIf(JsonNode::isIntegralNumber)?.asInt() }?.takeIf { it.size == 4 }

    private fun starAction(color: String) = CheckAction(
        condition = StarCountCondition(color = starColor(color) ?: color, operator = ">=", value = 1),
        onFail = "restart",
    )

    private fun starColor(value: String): String? = when (value) {
        "橙", "orange" -> "orange"
        "紫", "purple" -> "purple"
        "蓝", "blue" -> "blue"
        else -> null
    }

    private fun isKnownBranch(target: String): Boolean = target in KNOWN_BRANCHES ||
        ACTION_NODE.matches(target) || ROUND_NODE.matches(target) || OLD_STAR_NODE.matches(target)

    private fun isGame(value: String) = value == "代号鸢" || value == "如鸢"

    private fun issue(code: String, path: String, feature: String, message: String) =
        CompatibilityIssue(code, path, feature, message, CompatibilityStatus.UNSUPPORTED)

    private fun partialIssue(code: String, path: String, feature: String, message: String) =
        CompatibilityIssue(code, path, feature, message, CompatibilityStatus.PARTIAL)

    private fun pathKey(key: String) = "['${key.replace("'", "\\'")}']"

    private fun JsonNode.first(vararg names: String): JsonNode? = names.firstNotNullOfOrNull { name ->
        path(name).takeUnless(JsonNode::isMissingNode)?.takeUnless(JsonNode::isNull)
    }

    private fun JsonNode.text(vararg names: String): String? = first(*names)?.takeIf(JsonNode::isValueNode)?.asText()
        ?.trim()?.takeIf(String::isNotEmpty)

    private fun JsonNode.int(vararg names: String): Int? = first(*names)?.let { value ->
        when {
            value.isIntegralNumber -> value.asInt()
            value.isTextual -> value.asText().toIntOrNull()
            else -> null
        }
    }

    private fun JsonNode.boolean(vararg names: String): Boolean? = first(*names)?.let { value ->
        when {
            value.isBoolean -> value.asBoolean()
            value.isTextual && value.asText().equals("true", ignoreCase = true) -> true
            value.isTextual && value.asText().equals("false", ignoreCase = true) -> false
            else -> null
        }
    }

    private fun JsonNode.stringList(name: String): List<String> = path(name).takeIf(JsonNode::isArray)
        ?.mapNotNull { it.takeIf(JsonNode::isTextual)?.asText() }.orEmpty()

    private companion object {
        val BASIC_TOKEN = Regex("^(?:额外:)?([1-5])(普|大|下|sp|SP)$")
        val WAIT_TOKEN = Regex("^额外:等待:(\\d+)$")
        val DETECTION_TOKEN = Regex("^重开:检测([1-5])号位(阵亡|退场|鹦鹉|龙气)$")
        val SLOT_DETECTION_TEXT = Regex("^([1-5])号位(阵亡|退场|鹦鹉|龙气)检测$")
        val ACTION_NODE = Regex("^回合(\\d+)行动(\\d+)$")
        val ROUND_NODE = Regex("^(?:检测回合|战斗回合)(\\d+)(?:识别)?$")
        val OLD_STAR_NODE = Regex("^第(\\d+)回合(橙|紫|蓝)星检测$")
        const val FULL_RESTART = "抄作业全灭重开"
        const val MANUAL_RESTART = "抄作业点左上角重开"
        val KNOWN_CUSTOM_ACTIONS =
            setOf("AllDownRestart", "DownRestart", "RetreatRestart", "BirdRestart", "DragonRestart", "StarRestart")
        val KNOWN_BRANCHES = setOf(
            FULL_RESTART,
            MANUAL_RESTART,
            "抄作业战斗胜利",
            "抄作业战斗胜利-check",
            "史子眇sp",
        )
    }
}
