package com.lhs.share.hub.work

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.work.model.AutoBattleAction
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.DragonQiCondition
import com.lhs.share.hub.work.model.InteractionAction
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
import com.lhs.share.hub.work.parser.MaaYuanLegacyParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MaaYuanLegacyParserTest {
    private val parser = MaaYuanLegacyParser(jacksonObjectMapper())

    @Test
    fun `parses current SiMing nodes and every phase-one token`() {
        val result = parser.parse(
            content(
                """
                "回合1行动1":{"text_doc":"1普"},
                "回合1行动2":{"text_doc":"2大"},
                "回合1行动3":{"text_doc":"3下"},
                "回合1行动4":{"text_doc":"4sp"},
                "回合1行动5":{"text_doc":"等待","post_delay":1200},
                "回合1行动6":{"text_doc":"左侧目标"},
                "回合1行动7":{"text_doc":"右侧目标"},
                "回合1行动8":{"action":"Custom","custom_action":"AllDownRestart","custom_action_param":{"node":"回合1行动8"}},
                "回合1行动9":{"text_doc":"左上角重开"},
                "回合2行动1":{"action":"Custom","custom_action":"DownRestart","custom_action_param":{"position":1}},
                "回合2行动2":{"action":"Custom","custom_action":"RetreatRestart","custom_action_param":{"position":2}},
                "回合2行动3":{"action":"Custom","custom_action":"BirdRestart","custom_action_param":{"position":3}},
                "回合2行动4":{"action":"Custom","custom_action":"DragonRestart","custom_action_param":{"position":4}},
                "回合2行动5":{"action":"Custom","custom_action":"StarRestart","custom_action_param":{"expect":"橙","invert":true}},
                "回合2行动6":{"action":"Custom","custom_action":"StarRestart","custom_action_param":{"expect":"紫","invert":true}},
                "回合2行动7":{"action":"Custom","custom_action":"StarRestart","custom_action_param":{"expect":"蓝","invert":true}},
                "回合3行动1":{"text_doc":"额外:史子眇sp"},
                "回合3行动2":{"text_doc":"吕布"},
                "回合3行动3":{"text_doc":"开自动"},
                "回合3行动4":{"text_doc":"关卡内互动"}
                """.trimIndent(),
            ),
        )

        assertTrue(result.issues.isEmpty(), result.issues.toString())
        val actions = result.draft!!.rounds.flatMap { it.actions }
        assertEquals(
            listOf("attack", "ultimate", "defense", "sp"),
            actions.take(4).map { (it as SlotAction).type },
        )
        assertEquals(1200, (actions[4] as WaitAction).durationMs)
        assertEquals(listOf("left", "right"), actions.slice(5..6).map { (it as SwitchTargetAction).direction })
        assertTrue((actions[7] as CheckAction).condition is PartySurvivesCondition)
        assertTrue(actions[8] is RestartAction)
        assertTrue((actions[9] as CheckAction).condition is OperatorAliveCondition)
        assertTrue((actions[10] as CheckAction).condition is OperatorPresentCondition)
        assertTrue((actions[11] as CheckAction).condition is OperatorCopiedCondition)
        assertEquals(4, ((actions[12] as CheckAction).condition as DragonQiCondition).slot)
        assertEquals(
            listOf("orange", "purple", "blue"),
            actions.slice(13..15).map { ((it as CheckAction).condition as StarCountCondition).color },
        )
        assertEquals(SlotAction(1, "sp"), actions[16])
        assertEquals(2, (actions[17] as OperatorAction).slot)
        assertTrue(actions[18] is AutoBattleAction)
        assertTrue(actions[19] is InteractionAction)
    }

    @Test
    fun `parses old next restart and star graph`() {
        val result = parser.parse(
            content(
                """
                "检测回合1":{"next":["第1回合橙星检测"]},
                "第1回合橙星检测":{"next":["回合1行动1"]},
                "回合1行动1":{"text_doc":"2普","next":["抄作业全灭重开","抄作业点左上角重开"]}
                """.trimIndent(),
            ),
        )

        val actions = result.draft!!.rounds.single().actions
        assertEquals("orange", ((actions[0] as CheckAction).condition as StarCountCondition).color)
        assertEquals("attack", (actions[1] as SlotAction).type)
        assertTrue((actions[2] as CheckAction).condition is PartySurvivesCondition)
        assertTrue(actions[3] is RestartAction)
        assertTrue(result.issues.isEmpty(), result.issues.toString())
    }

    @Test
    fun `unknown reachable Pipeline semantics are reported with source path`() {
        val result = parser.parse(
            content(
                """
                "回合1行动1":{"action":"Custom","custom_action":"UserMagic","next":["用户分支"]}
                """.trimIndent(),
            ),
        )

        assertTrue(result.issues.any { it.code == "unsupported_source_node" && it.path.contains("回合1行动1") })
        assertTrue(result.issues.any { it.feature == "pipeline_branch:用户分支" })
    }

    @Test
    fun `Custom action without custom action name is never inferred from text`() {
        val result = parser.parse(
            content(
                """
                "回合1行动1":{"action":"Custom","text_doc":"1普"}
                """.trimIndent(),
            ),
        )

        assertTrue(result.issues.any { it.feature == "custom_action:missing" })
        assertTrue(result.draft!!.rounds.isEmpty())
    }

    private fun content(actions: String) =
        """
        {
          "game":"如鸢",
          "stage_name":"测试关卡",
          "doc":{"title":"真实 token 作业","details":""},
          "opers":[{"name":"史子眇"},{"name":"吕布"},{"name":"王粲"},{"name":"郭嘉"},{"name":"杨修"}],
          "actions":{$actions}
        }
        """.trimIndent()
}
