package com.lhs.share.hub.work.adapter

import com.lhs.share.hub.work.model.AutoBattleAction
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.CompatibilityIssue
import com.lhs.share.hub.work.model.CompatibilityStatus
import com.lhs.share.hub.work.model.CritCondition
import com.lhs.share.hub.work.model.DragonQiCondition
import com.lhs.share.hub.work.model.InteractionAction
import com.lhs.share.hub.work.model.MaaYuanTargetDocument
import com.lhs.share.hub.work.model.OperatorAction
import com.lhs.share.hub.work.model.OperatorAliveCondition
import com.lhs.share.hub.work.model.OperatorCopiedCondition
import com.lhs.share.hub.work.model.OperatorPresentCondition
import com.lhs.share.hub.work.model.PartySurvivesCondition
import com.lhs.share.hub.work.model.PauseAction
import com.lhs.share.hub.work.model.RestartAction
import com.lhs.share.hub.work.model.SlotAction
import com.lhs.share.hub.work.model.StarCountCondition
import com.lhs.share.hub.work.model.SwitchTargetAction
import com.lhs.share.hub.work.model.WaitAction
import com.lhs.share.hub.work.model.WorkAction
import com.lhs.share.hub.work.model.WorkCompatibilityResponse
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkLevelSummary
import com.lhs.share.hub.work.model.WorkTarget
import com.lhs.share.hub.work.model.YuanAssistConfig
import com.lhs.share.hub.work.model.YuanAssistInstruction
import com.lhs.share.hub.work.model.YuanAssistTargetDocument
import com.lhs.share.hub.work.model.statusOf
import org.springframework.stereotype.Component

@Component
class MaaYuanWorkAdapter {
    fun check(work: WorkDocument?, sourceIssues: List<CompatibilityIssue>): WorkCompatibilityResponse {
        val issues = sourceIssues.toMutableList()
        if (work != null) {
            work.exec?.delaysMs?.let { delays ->
                if (delays.sp != null && delays.ultimate != null && delays.sp != delays.ultimate) {
                    issues += partial("delay_mismatch", "$.exec.delays_ms.sp", "delay:sp", "当前 SiMing 与大招共用 SP 延迟")
                }
            }
            work.rounds.forEachIndexed { roundIndex, round ->
                round.actions.forEachIndexed { actionIndex, action ->
                    checkAction(work, action, "$.rounds[$roundIndex].actions[$actionIndex]")?.let(issues::add)
                }
            }
        }
        val status = statusOf(issues)
        return WorkCompatibilityResponse(
            target = WorkTarget.MAAYUAN,
            status = status,
            issues = issues,
            targetDocument = work?.takeIf { status == CompatibilityStatus.EXACT }?.let(::compile),
        )
    }

    private fun checkAction(work: WorkDocument, action: WorkAction, path: String): CompatibilityIssue? = when (action) {
        is SlotAction, is WaitAction, is SwitchTargetAction, is InteractionAction, is RestartAction -> null
        is PauseAction -> unsupported("unsupported_action", path, "pause", "MaaYuan 没有稳定的暂停动作")
        is AutoBattleAction -> action.takeUnless { it.enabled }?.let {
            unsupported("unsupported_action", path, "auto_battle:false", "MaaYuan 没有稳定的关闭自动战斗动作")
        }
        is OperatorAction -> action.takeUnless { work.operators.getOrNull(it.slot - 1) == "吕布" }?.let {
            unsupported("unsupported_action", path, "operator_action:switch_form", "仅能为吕布无损编译切形态")
        }
        is CheckAction -> checkCondition(action, path)
    }

    private fun checkCondition(action: CheckAction, path: String): CompatibilityIssue? {
        if (action.onFail != "restart") {
            return unsupported("unsupported_failure_action", "$path.on_fail", "on_fail:${action.onFail}", "MaaYuan 检测仅支持失败后重开")
        }
        return when (val condition = action.condition) {
            is PartySurvivesCondition, is OperatorAliveCondition, is OperatorPresentCondition, is OperatorCopiedCondition -> null
            is DragonQiCondition -> condition.takeUnless { it.slot != null && it.operator == ">=" && it.value == 2 }?.let {
                unsupported("unsupported_condition", "$path.condition", "check:dragon_qi", "MaaYuan 仅支持指定槽位龙气 >= 2")
            }
            is StarCountCondition -> condition.takeUnless { it.operator == ">=" && it.value == 1 }?.let {
                unsupported("unsupported_condition", "$path.condition", "check:star_count", "MaaYuan 仅支持指定颜色星数 >= 1")
            }
            is CritCondition -> unsupported("unsupported_condition", "$path.condition", "check:crit", "MaaYuan 当前没有稳定的暴击检测动作")
        }
    }

    private fun compile(work: WorkDocument): MaaYuanTargetDocument = MaaYuanTargetDocument(
        roundActions = work.rounds.associate { round ->
            round.round.toString() to round.actions.flatMap { action -> compileAction(action) }.map(::listOf)
        },
        delaysMs = work.exec?.delaysMs,
        extensions = work.exec?.extensions?.maayuan,
    )

    private fun compileAction(action: WorkAction): List<String> = when (action) {
        is SlotAction -> listOf(
            "${action.slot}${mapOf("attack" to "普", "ultimate" to "大", "defense" to "下", "sp" to "sp").getValue(action.type)}",
        )
        is WaitAction -> listOf("额外:等待:${action.durationMs}")
        is SwitchTargetAction -> List(action.count ?: 1) { "额外:${if (action.direction == "left") "左" else "右"}侧目标" }
        is AutoBattleAction -> listOf("额外:开自动")
        is InteractionAction -> listOf("额外:关卡内互动")
        is OperatorAction -> listOf("额外:吕布")
        is RestartAction -> listOf("重开:左上角")
        is CheckAction -> listOf(compileCheck(action))
        is PauseAction -> error("Compatibility check must reject pause")
    }

    private fun compileCheck(action: CheckAction): String = when (val condition = action.condition) {
        is PartySurvivesCondition -> "重开:全灭"
        is OperatorAliveCondition -> "重开:检测${condition.slot}号位阵亡"
        is OperatorPresentCondition -> "重开:检测${condition.slot}号位退场"
        is OperatorCopiedCondition -> "重开:检测${condition.slot}号位鹦鹉"
        is DragonQiCondition -> "重开:检测${condition.slot}号位龙气"
        is StarCountCondition -> "重开:无${mapOf("orange" to "橙", "purple" to "紫", "blue" to "蓝").getValue(condition.color)}星"
        is CritCondition -> error("Compatibility check must reject crit")
    }
}

@Component
class YuanAssistWorkAdapter {
    fun check(work: WorkDocument?, level: WorkLevelSummary?, sourceIssues: List<CompatibilityIssue>): WorkCompatibilityResponse {
        val issues = sourceIssues.toMutableList()
        if (work != null) {
            checkConfig(work, issues)
            work.rounds.forEachIndexed { roundIndex, round ->
                round.actions.forEachIndexed { actionIndex, action ->
                    checkAction(action, level, actionIndex, "$.rounds[$roundIndex].actions[$actionIndex]")?.let(issues::add)
                }
            }
            if (statusOf(issues) == CompatibilityStatus.EXACT) {
                checkInstructionOrder(work)?.let(issues::add)
            }
        }
        val status = statusOf(issues)
        return WorkCompatibilityResponse(
            target = WorkTarget.YUANASSIST,
            status = status,
            issues = issues,
            targetDocument = work?.takeIf { status == CompatibilityStatus.EXACT }?.let(::compile),
        )
    }

    private fun checkConfig(work: WorkDocument, issues: MutableList<CompatibilityIssue>) {
        val delays = work.exec?.delaysMs
        if (delays?.attack == null) {
            issues += missingConfig("$.exec.delays_ms.attack", "intervalAttack")
        }
        if (delays?.ultimate == null) {
            issues += missingConfig("$.exec.delays_ms.ultimate", "intervalSkill")
        }
        if (work.exec?.extensions?.yuanassist?.enemyTurnWaitMs == null) {
            issues += missingConfig("$.exec.extensions.yuanassist.enemy_turn_wait_ms", "waitTurn")
        }
        if (delays?.sp != null && work.rounds.any { round -> round.actions.any { it is SlotAction && it.type == "sp" } }) {
            issues += partial(
                "unsupported_sp_delay",
                "$.exec.delays_ms.sp",
                "delay:sp",
                "YuanAssist 圈/SP 的基础延时规则尚未确认，无法保留显式 SP 延时",
            )
        }
    }

    private fun checkAction(action: WorkAction, level: WorkLevelSummary?, actionIndex: Int, path: String): CompatibilityIssue? =
        when (action) {
            is SlotAction, is WaitAction, is PauseAction, is SwitchTargetAction -> null
            is AutoBattleAction -> unsupported("unsupported_action", path, "auto_battle", "YuanAssist 当前没有稳定的自动战斗开关指令")
            is InteractionAction -> unsupported("unsupported_action", path, "interaction", "YuanAssist 当前没有等价互动指令")
            is OperatorAction -> unsupported("unsupported_action", path, "operator_action:switch_form", "YuanAssist 当前没有等价切形态指令")
            is RestartAction -> unsupported("unsupported_action", path, "restart", "YuanAssist 当前没有等价立即重开指令")
            is CheckAction -> checkCondition(action, level, actionIndex, path)
        }

    private fun checkCondition(action: CheckAction, level: WorkLevelSummary?, actionIndex: Int, path: String): CompatibilityIssue? {
        if (action.onFail != "restart") {
            return unsupported("unsupported_failure_action", "$path.on_fail", "on_fail:${action.onFail}", "YuanAssist 尚未实现该检测失败行为")
        }
        return when (val condition = action.condition) {
            is PartySurvivesCondition -> if (actionIndex == 0) {
                null
            } else {
                unsupported(
                    "unsupported_check_position",
                    path,
                    "check:party_survives:position",
                    "YuanAssist 全灭检测固定在回合开始，无法保留当前动作位置",
                )
            }
            is OperatorPresentCondition -> unsupported(
                "unsupported_condition",
                "$path.condition",
                "check:operator_present",
                "YuanAssist 当前没有退场检测",
            )
            is DragonQiCondition -> if (condition.slot != null) {
                unsupported("unsupported_condition", "$path.condition.slot", "check:dragon_qi:slot", "YuanAssist 龙气检测不携带槽位")
            } else {
                restartNavigationIssue(level, path)
            }
            is StarCountCondition -> if (condition.color == "blue") {
                unsupported("unsupported_condition", "$path.condition.color", "check:blue_star", "YuanAssist 当前没有蓝星检测")
            } else if (condition.operator != ">=" || condition.value != 1) {
                unsupported("unsupported_condition", "$path.condition", "check:star_count", "YuanAssist 星检测仅支持存在橙星或紫星")
            } else {
                restartNavigationIssue(level, path)
            }
            is OperatorAliveCondition, is OperatorCopiedCondition, is CritCondition -> restartNavigationIssue(level, path)
        }
    }

    private fun restartNavigationIssue(level: WorkLevelSummary?, path: String): CompatibilityIssue = partial(
        "restart_navigation_unavailable",
        "$path.on_fail",
        "restart_navigation",
        if (level == null) "缺少可靠 Level Catalog 关联，无法生成失败后的自动导航" else "Level Catalog 尚无可靠的 YuanAssist 导航编码",
    )

    private fun checkInstructionOrder(work: WorkDocument): CompatibilityIssue? {
        val defenseDelta = work.exec?.delaysMs?.let { delays ->
            delays.defense?.minus(delays.attack ?: return@let null)?.takeIf { it != 0 }
        }
        work.rounds.forEachIndexed { roundIndex, round ->
            val positions = mutableSetOf<Int>()
            var step = 0
            round.actions.forEach { action ->
                val instructionStep = when (action) {
                    is SlotAction -> (++step).takeIf { action.type == "defense" && defenseDelta != null }
                    is WaitAction, is PauseAction, is SwitchTargetAction -> step
                    is CheckAction -> when (action.condition) {
                        is PartySurvivesCondition, is OperatorAliveCondition, is StarCountCondition -> 0
                        else -> step
                    }
                    else -> null
                }
                if (instructionStep != null && !positions.add(instructionStep)) {
                    return partial(
                        "unconfirmed_instruction_order",
                        "$.rounds[$roundIndex].actions",
                        "instruction_order",
                        "同一 turn + step 的多条 YuanAssist 指令执行顺序尚未确认",
                    )
                }
            }
        }
        return null
    }

    private fun compile(work: WorkDocument): YuanAssistTargetDocument {
        val delays = checkNotNull(work.exec?.delaysMs)
        val attackDelay = checkNotNull(delays.attack)
        val ultimateDelay = checkNotNull(delays.ultimate)
        val waitTurn = checkNotNull(work.exec.extensions?.yuanassist?.enemyTurnWaitMs)
        val instructions = mutableListOf<YuanAssistInstruction>()
        val rounds = work.rounds.associateBy { it.round }
        val script = (1..work.rounds.maxOf { it.round }).joinToString("\n") { turn ->
            val slots = List(5) { StringBuilder() }
            var step = 0
            rounds[turn]?.actions?.forEach { action ->
                when (action) {
                    is SlotAction -> {
                        step += 1
                        slots[action.slot - 1].append(step).append(actionSymbol(action.type))
                        if (action.type == "defense") {
                            delays.defense?.minus(attackDelay)?.takeIf { it != 0 }?.let { delta ->
                                instructions += delayInstruction(turn, step, delta)
                            }
                        }
                    }
                    is WaitAction -> instructions += YuanAssistInstruction(turn, step, "DELAY_ADD", action.durationMs)
                    is PauseAction -> instructions += YuanAssistInstruction(turn, step, "PAUSE", 0)
                    is SwitchTargetAction -> instructions += YuanAssistInstruction(
                        turn,
                        step,
                        if (action.direction == "left") "TARGET_SWITCH_LEFT" else "TARGET_SWITCH_RIGHT",
                        action.count ?: 1,
                    )
                    is CheckAction -> instructions += compileCheck(action, turn, step)
                    is AutoBattleAction, is InteractionAction, is OperatorAction, is RestartAction ->
                        error("Compatibility check must reject unsupported YuanAssist actions")
                }
            }
            "${turn}回合\t${slots.joinToString("\t")}"
        }
        return YuanAssistTargetDocument(
            scriptContent = script,
            instructions = instructions,
            config = YuanAssistConfig(
                intervalAttack = attackDelay,
                intervalSkill = ultimateDelay,
                waitTurn = waitTurn,
            ),
        )
    }

    private fun compileCheck(action: CheckAction, turn: Int, step: Int): YuanAssistInstruction = when (val condition = action.condition) {
        is PartySurvivesCondition -> YuanAssistInstruction(turn, 0, "ALL_WIPE_CHECK", 0)
        is OperatorAliveCondition -> YuanAssistInstruction(turn, 0, "DEATH_CHECK", condition.slot)
        is OperatorCopiedCondition -> YuanAssistInstruction(turn, step, "PANG_TONG_COPY_CHECK", condition.slot)
        is CritCondition -> YuanAssistInstruction(turn, step, "CRIT_CHECK", 0)
        is DragonQiCondition -> YuanAssistInstruction(turn, step, "DRAGON_QI_CHECK", encodeDragonQi(condition))
        is StarCountCondition -> YuanAssistInstruction(
            turn,
            0,
            if (condition.color == "orange") "ORANGE_STAR_CHECK" else "PURPLE_STAR_CHECK",
            0,
        )
        is OperatorPresentCondition -> error("Compatibility check must reject operator-present checks")
    }

    private fun actionSymbol(type: String) = mapOf(
        "attack" to "A",
        "ultimate" to "↑",
        "defense" to "↓",
        "sp" to "圈",
    ).getValue(type)

    private fun delayInstruction(turn: Int, step: Int, delta: Int) = YuanAssistInstruction(
        turn,
        step,
        if (delta > 0) "DELAY_ADD" else "DELAY_SUBTRACT",
        kotlin.math.abs(delta),
    )
}

internal fun encodeDragonQi(condition: DragonQiCondition): Int {
    val (value, operatorIndex) = when (condition.operator) {
        ">=" -> condition.value to 0
        "=" -> condition.value to 1
        "<" -> condition.value to 2
        ">" -> condition.value + 1 to 0
        "<=" -> condition.value + 1 to 2
        else -> error("Unsupported dragon-qi operator: ${condition.operator}")
    }
    return value * 3 + operatorIndex
}

private fun missingConfig(path: String, field: String) = partial(
    "missing_yuanassist_config",
    path,
    "config:$field",
    "缺少生成 YuanAssist $field 所需的可靠配置值",
)

private fun unsupported(code: String, path: String, feature: String, message: String) =
    CompatibilityIssue(code, path, feature, message, CompatibilityStatus.UNSUPPORTED)

private fun partial(code: String, path: String, feature: String, message: String) =
    CompatibilityIssue(code, path, feature, message, CompatibilityStatus.PARTIAL)
