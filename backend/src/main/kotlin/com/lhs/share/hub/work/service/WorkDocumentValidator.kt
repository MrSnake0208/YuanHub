package com.lhs.share.hub.work.service

import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.work.model.AutoBattleAction
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.CritCondition
import com.lhs.share.hub.work.model.DragonQiCondition
import com.lhs.share.hub.work.model.InteractionAction
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
import com.lhs.share.hub.work.model.WorkCondition
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkValidationIssue
import org.springframework.stereotype.Component

class WorkValidationException(val issues: List<WorkValidationIssue>) : RuntimeException("WorkDocument 校验失败")

@Component
class WorkDocumentValidator(private val levelRepository: LevelCatalogRepository) {
    fun validateOrThrow(document: WorkDocument) {
        val issues = validate(document)
        if (issues.isNotEmpty()) throw WorkValidationException(issues)
    }

    fun validate(document: WorkDocument): List<WorkValidationIssue> = buildList {
        check(document.format == "yuanhub-work", "$.format", "unsupported_format", "format 必须是 yuanhub-work")
        check(document.version == 1, "$.version", "unsupported_version", "version 必须是 1")
        check(document.game in GAMES, "$.game", "invalid_game", "game 必须是代号鸢或如鸢")
        checkText(document.stageName, "$.stage_name", 1, 256)
        checkText(document.doc.title, "$.doc.title", 1, 256)
        checkText(document.doc.details, "$.doc.details", 0, 20_000)

        document.levelId?.let { levelId ->
            checkText(levelId, "$.level_id", 1, 128)
            val level = levelRepository.findByLevelKey(levelId)
            check(level != null, "$.level_id", "unknown_level", "level_id 不存在")
            if (level != null) check(level.game == document.game, "$.level_id", "level_game_mismatch", "level_id 与 game 不匹配")
        }

        check(document.operators.size == 5, "$.operators", "invalid_operator_count", "operators 必须恰好包含 5 个槽位")
        document.operators.forEachIndexed { index, operator ->
            operator?.let { checkText(it, "$.operators[$index]", 1, 128) }
        }
        document.exec?.delaysMs?.let { delays ->
            listOf(
                "attack" to delays.attack,
                "ultimate" to delays.ultimate,
                "defense" to delays.defense,
                "sp" to delays.sp,
            ).forEach { (name, value) -> value?.let { checkRange(it, 0..600_000, "$.exec.delays_ms.$name") } }
        }
        document.exec?.extensions?.maayuan?.let { extension ->
            extension.levelType?.let {
                check(it in MAA_LEVEL_TYPES, "$.exec.extensions.maayuan.level_type", "invalid_enum", "未知 MaaYuan 关卡类型")
            }
            extension.recognitionName?.let { checkText(it, "$.exec.extensions.maayuan.recognition_name", 1, 256) }
            extension.recTargetOffset?.let {
                check(it.size == 4, "$.exec.extensions.maayuan.rec_target_offset", "invalid_array_size", "必须恰好包含 4 个整数")
            }
            extension.difficulty?.let { checkText(it, "$.exec.extensions.maayuan.difficulty", 1, 128) }
            extension.caveType?.let {
                check(it == "左" || it == "右", "$.exec.extensions.maayuan.cave_type", "invalid_enum", "cave_type 必须是左或右")
            }
        }
        document.exec?.extensions?.yuanassist?.enemyTurnWaitMs?.let {
            checkRange(it, 0..600_000, "$.exec.extensions.yuanassist.enemy_turn_wait_ms")
        }

        check(document.rounds.size in 1..50, "$.rounds", "invalid_round_count", "rounds 数量必须在 1..50")
        val seenRounds = mutableSetOf<Int>()
        var actionCount = 0
        document.rounds.forEachIndexed { roundIndex, round ->
            val path = "$.rounds[$roundIndex]"
            checkRange(round.round, 1..50, "$path.round")
            check(seenRounds.add(round.round), "$path.round", "duplicate_round", "回合号 ${round.round} 重复")
            round.remark?.let { checkText(it, "$path.remark", 0, 2_000) }
            check(round.actions.isNotEmpty(), "$path.actions", "empty_actions", "actions 不能为空")
            check(round.actions.size <= MAX_ACTIONS_PER_ROUND, "$path.actions", "too_many_actions", "单回合动作不能超过 $MAX_ACTIONS_PER_ROUND")
            actionCount += round.actions.size
            round.actions.forEachIndexed { actionIndex, action ->
                validateAction(document, action, "$path.actions[$actionIndex]")
            }
        }
        check(actionCount <= MAX_ACTIONS_TOTAL, "$.rounds", "too_many_actions", "文档动作总数不能超过 $MAX_ACTIONS_TOTAL")
    }

    private fun MutableList<WorkValidationIssue>.validateAction(document: WorkDocument, action: WorkAction, path: String) {
        when (action) {
            is SlotAction -> {
                checkRange(action.slot, 1..5, "$path.slot")
                check(action.type in SLOT_ACTIONS, "$path.type", "unknown_action", "未知基础动作 ${action.type}")
            }
            is WaitAction -> checkRange(action.durationMs, 1..600_000, "$path.duration_ms")
            is PauseAction, is AutoBattleAction, is InteractionAction, is RestartAction -> Unit
            is SwitchTargetAction -> {
                check(
                    action.direction == "left" || action.direction == "right",
                    "$path.direction",
                    "invalid_enum",
                    "direction 必须是 left 或 right",
                )
                action.count?.let { checkRange(it, 1..100, "$path.count") }
            }
            is OperatorAction -> {
                checkRange(action.slot, 1..5, "$path.slot")
                check(action.action == "switch_form", "$path.action", "unknown_operator_action", "action 必须是 switch_form")
                if (action.slot in 1..5) {
                    check(
                        !document.operators.getOrNull(action.slot - 1).isNullOrBlank(),
                        "$path.slot",
                        "empty_operator_slot",
                        "operator_action 引用的槽位不能为空",
                    )
                }
            }
            is CheckAction -> {
                check(action.onFail in ON_FAIL_ACTIONS, "$path.on_fail", "invalid_enum", "on_fail 必须是 restart、stop 或 pause")
                validateCondition(action.condition, "$path.condition")
            }
        }
    }

    private fun MutableList<WorkValidationIssue>.validateCondition(condition: WorkCondition, path: String) {
        when (condition) {
            is PartySurvivesCondition, is CritCondition -> Unit
            is OperatorAliveCondition -> checkRange(condition.slot, 1..5, "$path.slot")
            is OperatorPresentCondition -> checkRange(condition.slot, 1..5, "$path.slot")
            is OperatorCopiedCondition -> checkRange(condition.slot, 1..5, "$path.slot")
            is DragonQiCondition -> {
                condition.slot?.let { checkRange(it, 1..5, "$path.slot") }
                check(condition.operator in COMPARISON_OPERATORS, "$path.operator", "invalid_enum", "未知比较运算符")
                checkRange(condition.value, 0..999, "$path.value")
            }
            is StarCountCondition -> {
                check(condition.color in STAR_COLORS, "$path.color", "invalid_enum", "未知星颜色")
                check(condition.operator in COMPARISON_OPERATORS, "$path.operator", "invalid_enum", "未知比较运算符")
                checkRange(condition.value, 0..99, "$path.value")
            }
        }
    }

    private fun MutableList<WorkValidationIssue>.checkText(value: String, path: String, min: Int, max: Int) {
        check(value.length in min..max && (min == 0 || value.isNotBlank()), path, "invalid_length", "长度必须在 $min..$max")
    }

    private fun MutableList<WorkValidationIssue>.checkRange(value: Int, range: IntRange, path: String) {
        check(value in range, path, "out_of_range", "数值必须在 ${range.first}..${range.last}")
    }

    private fun MutableList<WorkValidationIssue>.check(valid: Boolean, path: String, code: String, message: String) {
        if (!valid) add(WorkValidationIssue(path, code, message))
    }

    private companion object {
        val GAMES = setOf("代号鸢", "如鸢")
        val SLOT_ACTIONS = setOf("attack", "ultimate", "defense", "sp")
        val ON_FAIL_ACTIONS = setOf("restart", "stop", "pause")
        val COMPARISON_OPERATORS = setOf("<", "<=", "=", ">=", ">")
        val STAR_COLORS = setOf("orange", "purple", "blue")
        val MAA_LEVEL_TYPES = setOf("主线", "洞窟", "活动", "活动有分级", "白鹄", "兰台", "其他")
        const val MAX_ACTIONS_PER_ROUND = 500
        const val MAX_ACTIONS_TOTAL = 5_000
    }
}
