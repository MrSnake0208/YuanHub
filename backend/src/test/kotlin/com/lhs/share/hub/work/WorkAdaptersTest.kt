package com.lhs.share.hub.work

import com.lhs.share.hub.work.adapter.MaaYuanWorkAdapter
import com.lhs.share.hub.work.adapter.YuanAssistWorkAdapter
import com.lhs.share.hub.work.model.AutoBattleAction
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.CompatibilityStatus
import com.lhs.share.hub.work.model.CritCondition
import com.lhs.share.hub.work.model.DragonQiCondition
import com.lhs.share.hub.work.model.InteractionAction
import com.lhs.share.hub.work.model.MaaYuanTargetDocument
import com.lhs.share.hub.work.model.OperatorAction
import com.lhs.share.hub.work.model.OperatorPresentCondition
import com.lhs.share.hub.work.model.PartySurvivesCondition
import com.lhs.share.hub.work.model.PauseAction
import com.lhs.share.hub.work.model.RestartAction
import com.lhs.share.hub.work.model.SlotAction
import com.lhs.share.hub.work.model.StarCountCondition
import com.lhs.share.hub.work.model.SwitchTargetAction
import com.lhs.share.hub.work.model.WaitAction
import com.lhs.share.hub.work.model.WorkDelays
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkExec
import com.lhs.share.hub.work.model.WorkExtensions
import com.lhs.share.hub.work.model.WorkRound
import com.lhs.share.hub.work.model.YuanAssistExtension
import com.lhs.share.hub.work.model.YuanAssistInstruction
import com.lhs.share.hub.work.model.YuanAssistTargetDocument
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WorkAdaptersTest {
    @Test
    fun `MAAYUAN compiles only exact work to standard round actions`() {
        val adapter = MaaYuanWorkAdapter()
        val result = adapter.check(work(), emptyList())

        assertEquals(CompatibilityStatus.EXACT, result.status)
        val target = result.targetDocument as MaaYuanTargetDocument
        assertEquals(listOf(listOf("2普"), listOf("重开:无橙星")), target.roundActions.getValue("1"))

        val unsupported = adapter.check(
            work(CheckAction(condition = DragonQiCondition(slot = 2, operator = ">", value = 1))),
            emptyList(),
        )
        assertEquals(CompatibilityStatus.UNSUPPORTED, unsupported.status)
        assertNull(unsupported.targetDocument)

        val unsupportedActions = adapter.check(
            work(PauseAction(), CheckAction(condition = CritCondition())),
            emptyList(),
        )
        assertTrue(unsupportedActions.issues.any { it.feature == "pause" })
        assertTrue(unsupportedActions.issues.any { it.feature == "check:crit" })
    }

    @Test
    fun `YUANASSIST compiles exact native document preserving steps instructions and sparse rounds`() {
        val actions = listOf(CheckAction(condition = PartySurvivesCondition())) +
            List(10) { SlotAction(1, "attack") } + listOf(
                WaitAction(durationMs = 250),
                SlotAction(2, "defense"),
            )
        val result = YuanAssistWorkAdapter().check(
            configuredWork(
                WorkRound(1, actions = actions),
                WorkRound(3, actions = listOf(SlotAction(3, "sp"), SlotAction(4, "ultimate"))),
            ),
            null,
            emptyList(),
        )

        assertEquals(CompatibilityStatus.EXACT, result.status)
        val target = result.targetDocument as YuanAssistTargetDocument
        assertEquals(
            "1回合\t1A2A3A4A5A6A7A8A9A10A\t11↓\t\t\t\n2回合\t\t\t\t\t\n3回合\t\t\t1圈\t2↑\t",
            target.scriptContent,
        )
        assertEquals(
            listOf(
                YuanAssistInstruction(1, 0, "ALL_WIPE_CHECK", 0),
                YuanAssistInstruction(1, 10, "DELAY_ADD", 250),
                YuanAssistInstruction(1, 11, "DELAY_ADD", 500),
            ),
            target.instructions,
        )
        assertEquals(1000, target.config.intervalAttack)
        assertEquals(2000, target.config.intervalSkill)
        assertEquals(8000, target.config.waitTurn)
    }

    @Test
    fun `YUANASSIST compiles single flow instructions but gates shared positions`() {
        val adapter = YuanAssistWorkAdapter()
        val exact = adapter.check(
            configuredWork(
                WorkRound(1, actions = listOf(WaitAction(durationMs = 250), SlotAction(1, "attack"))),
                WorkRound(2, actions = listOf(SwitchTargetAction(direction = "left", count = 2), SlotAction(1, "attack"))),
                WorkRound(3, actions = listOf(SwitchTargetAction(direction = "right"), SlotAction(1, "attack"))),
                WorkRound(4, actions = listOf(PauseAction(), SlotAction(1, "attack"))),
            ),
            null,
            emptyList(),
        )
        val ambiguous = adapter.check(
            configuredWork(
                WorkRound(
                    1,
                    actions = listOf(WaitAction(durationMs = 250), SwitchTargetAction(direction = "left"), SlotAction(1, "attack")),
                ),
            ),
            null,
            emptyList(),
        )

        assertEquals(CompatibilityStatus.EXACT, exact.status)
        assertEquals(
            listOf(
                YuanAssistInstruction(1, 0, "DELAY_ADD", 250),
                YuanAssistInstruction(2, 0, "TARGET_SWITCH_LEFT", 2),
                YuanAssistInstruction(3, 0, "TARGET_SWITCH_RIGHT", 1),
                YuanAssistInstruction(4, 0, "PAUSE", 0),
            ),
            (exact.targetDocument as YuanAssistTargetDocument).instructions,
        )
        assertEquals(CompatibilityStatus.PARTIAL, ambiguous.status)
        assertTrue(ambiguous.issues.any { it.code == "unconfirmed_instruction_order" })
        assertNull(ambiguous.targetDocument)
    }

    @Test
    fun `YUANASSIST only accepts party survives check at round start`() {
        val adapter = YuanAssistWorkAdapter()
        val exact = adapter.check(
            configuredWork(
                WorkRound(
                    1,
                    actions = listOf(CheckAction(condition = PartySurvivesCondition()), SlotAction(1, "attack")),
                ),
            ),
            null,
            emptyList(),
        )
        val moved = adapter.check(
            configuredWork(
                WorkRound(
                    1,
                    actions = listOf(SlotAction(1, "attack"), CheckAction(condition = PartySurvivesCondition())),
                ),
            ),
            null,
            emptyList(),
        )

        assertEquals(CompatibilityStatus.EXACT, exact.status)
        assertTrue(exact.targetDocument is YuanAssistTargetDocument)
        assertEquals(CompatibilityStatus.UNSUPPORTED, moved.status)
        assertTrue(moved.issues.any { it.code == "unsupported_check_position" })
        assertNull(moved.targetDocument)
    }

    @Test
    fun `YUANASSIST omits target document when config or semantics are not exact`() {
        val missingConfig = YuanAssistWorkAdapter().check(
            work(SlotAction(1, "attack")).copy(exec = null),
            null,
            emptyList(),
        )
        assertEquals(CompatibilityStatus.PARTIAL, missingConfig.status)
        assertEquals(3, missingConfig.issues.count { it.code == "missing_yuanassist_config" })
        assertNull(missingConfig.targetDocument)

        val result = YuanAssistWorkAdapter().check(
            work(
                CheckAction(condition = OperatorPresentCondition(slot = 2)),
                CheckAction(condition = DragonQiCondition(slot = 2, operator = ">=", value = 2)),
                CheckAction(condition = StarCountCondition(color = "blue", operator = ">=", value = 1)),
                AutoBattleAction(enabled = true),
                InteractionAction(),
                OperatorAction(slot = 2),
                RestartAction(),
            ),
            null,
            emptyList(),
        )

        assertEquals(CompatibilityStatus.UNSUPPORTED, result.status)
        assertTrue(result.issues.any { it.feature == "check:operator_present" })
        assertTrue(result.issues.any { it.feature == "check:dragon_qi:slot" })
        assertTrue(result.issues.any { it.feature == "check:blue_star" })
        assertTrue(result.issues.any { it.feature == "auto_battle" })
        assertTrue(result.issues.any { it.feature == "interaction" })
        assertTrue(result.issues.any { it.feature == "operator_action:switch_form" })
        assertTrue(result.issues.any { it.feature == "restart" })
        assertNull(result.targetDocument)
    }

    @Test
    fun `YUANASSIST normalizes all Work dragon qi comparisons`() {
        assertEquals(12, com.lhs.share.hub.work.adapter.encodeDragonQi(DragonQiCondition(operator = ">=", value = 4)))
        assertEquals(7, com.lhs.share.hub.work.adapter.encodeDragonQi(DragonQiCondition(operator = "=", value = 2)))
        assertEquals(11, com.lhs.share.hub.work.adapter.encodeDragonQi(DragonQiCondition(operator = "<", value = 3)))
        assertEquals(15, com.lhs.share.hub.work.adapter.encodeDragonQi(DragonQiCondition(operator = ">", value = 4)))
        assertEquals(17, com.lhs.share.hub.work.adapter.encodeDragonQi(DragonQiCondition(operator = "<=", value = 4)))
    }

    @Test
    fun `YUANASSIST rejects explicit SP delay until its base delay is known`() {
        val work = configuredWork(WorkRound(1, actions = listOf(SlotAction(1, "sp")))).copy(
            exec = WorkExec(
                delaysMs = WorkDelays(attack = 1000, ultimate = 2000, defense = 1500, sp = 2500),
                extensions = WorkExtensions(yuanassist = YuanAssistExtension(8000)),
            ),
        )

        val result = YuanAssistWorkAdapter().check(work, null, emptyList())

        assertEquals(CompatibilityStatus.PARTIAL, result.status)
        assertTrue(result.issues.any { it.code == "unsupported_sp_delay" })
        assertNull(result.targetDocument)
    }

    private fun configuredWork(vararg rounds: WorkRound) = WorkDocument(
        format = "yuanhub-work",
        version = 1,
        game = "如鸢",
        stageName = "测试关卡",
        doc = WorkDoc("测试", ""),
        operators = listOf("一", "二", "三", "四", "五"),
        exec = WorkExec(
            delaysMs = WorkDelays(attack = 1000, ultimate = 2000, defense = 1500),
            extensions = WorkExtensions(yuanassist = YuanAssistExtension(8000)),
        ),
        rounds = rounds.toList(),
    )

    private fun work(vararg extra: com.lhs.share.hub.work.model.WorkAction) = WorkDocument(
        format = "yuanhub-work",
        version = 1,
        game = "如鸢",
        stageName = "测试关卡",
        doc = WorkDoc("测试", ""),
        operators = listOf("一", "二", "三", "四", "五"),
        rounds = listOf(
            WorkRound(
                1,
                actions = listOf(SlotAction(2, "attack")) +
                    (
                        extra.toList().ifEmpty {
                            listOf(CheckAction(condition = StarCountCondition(color = "orange", operator = ">=", value = 1)))
                        }
                        ),
            ),
        ),
    )
}
