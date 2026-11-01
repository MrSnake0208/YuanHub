package com.lhs.share.hub.work

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.exc.InvalidTypeIdException
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
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
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkRound
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class WorkDocumentJsonTest {
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

    @Test
    fun `all action and condition variants round trip without reordering`() {
        val document = WorkDocument(
            format = "yuanhub-work",
            version = 1,
            game = "如鸢",
            stageName = "测试关卡",
            doc = WorkDoc("测试", ""),
            operators = listOf("一", "二", "三", "四", "五"),
            rounds = listOf(
                WorkRound(
                    1,
                    actions = listOf(
                        SlotAction(1, "attack"),
                        SlotAction(2, "ultimate"),
                        SlotAction(3, "defense"),
                        SlotAction(4, "sp"),
                        WaitAction(durationMs = 100),
                        PauseAction(),
                        SwitchTargetAction(direction = "left", count = 2),
                        AutoBattleAction(enabled = true),
                        InteractionAction(),
                        OperatorAction(slot = 5),
                        CheckAction(condition = PartySurvivesCondition()),
                        CheckAction(condition = OperatorAliveCondition(slot = 1)),
                        CheckAction(condition = OperatorPresentCondition(slot = 2)),
                        CheckAction(condition = OperatorCopiedCondition(slot = 3)),
                        CheckAction(condition = DragonQiCondition(slot = 4, operator = ">=", value = 2)),
                        CheckAction(condition = StarCountCondition(color = "orange", operator = ">=", value = 1)),
                        CheckAction(condition = CritCondition()),
                        RestartAction(),
                    ),
                ),
            ),
        )

        val decoded = mapper.readValue<WorkDocument>(mapper.writeValueAsString(document))

        assertEquals(document, decoded)
        assertEquals(document.rounds.single().actions, decoded.rounds.single().actions)
    }

    @Test
    fun `unknown action type fails fast`() {
        val json = mapper.writeValueAsString(
            WorkDocument(
                format = "yuanhub-work",
                version = 1,
                game = "如鸢",
                stageName = "测试关卡",
                doc = WorkDoc("测试", ""),
                operators = listOf("一", "二", "三", "四", "五"),
                rounds = listOf(WorkRound(1, actions = listOf(PauseAction()))),
            ),
        ).replace("\"pause\"", "\"unknown\"")

        assertThrows(InvalidTypeIdException::class.java) { mapper.readValue<WorkDocument>(json) }
    }
}
