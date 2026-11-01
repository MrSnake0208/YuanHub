package com.lhs.share.hub.work

import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.work.model.CheckAction
import com.lhs.share.hub.work.model.OperatorAction
import com.lhs.share.hub.work.model.OperatorAliveCondition
import com.lhs.share.hub.work.model.SlotAction
import com.lhs.share.hub.work.model.WaitAction
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkRound
import com.lhs.share.hub.work.service.WorkDocumentValidator
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class WorkDocumentValidatorTest {
    private val levels = mockk<LevelCatalogRepository>()
    private val validator = WorkDocumentValidator(levels)

    @Test
    fun `valid document accepts matching level`() {
        every { levels.findByLevelKey("level-1") } returns level("如鸢")

        assertTrue(validator.validate(work()).isEmpty())
    }

    @Test
    fun `invalid semantic input reports every precise path`() {
        every { levels.findByLevelKey("level-1") } returns level("代号鸢")
        val invalid = work().copy(
            operators = listOf(null, "二"),
            rounds = listOf(
                WorkRound(
                    0,
                    actions = listOf(
                        SlotAction(6, "attack"),
                        WaitAction(durationMs = 0),
                        OperatorAction(slot = 1),
                        CheckAction(condition = OperatorAliveCondition(slot = 7)),
                    ),
                ),
                WorkRound(0, actions = listOf(SlotAction(1, "attack"))),
            ),
        )

        val issues = validator.validate(invalid)

        assertEquals("level_game_mismatch", issues.single { it.path == "$.level_id" }.code)
        assertTrue(issues.any { it.path == "$.operators" && it.code == "invalid_operator_count" })
        assertTrue(issues.any { it.path == "$.rounds[0].actions[0].slot" })
        assertTrue(issues.any { it.path == "$.rounds[0].actions[1].duration_ms" })
        assertTrue(issues.any { it.path == "$.rounds[0].actions[2].slot" && it.code == "empty_operator_slot" })
        assertTrue(issues.any { it.path == "$.rounds[0].actions[3].condition.slot" })
        assertTrue(issues.any { it.path == "$.rounds[1].round" && it.code == "duplicate_round" })
    }

    private fun work() = WorkDocument(
        format = "yuanhub-work",
        version = 1,
        game = "如鸢",
        levelId = "level-1",
        stageName = "测试关卡",
        doc = WorkDoc("测试", ""),
        operators = listOf("一", "二", "三", "四", "五"),
        rounds = listOf(WorkRound(1, actions = listOf(SlotAction(1, "attack")))),
    )

    private fun level(game: String) = LevelCatalogEntity(
        levelKey = "level-1",
        game = game,
        catOne = "活动",
        catTwo = "测试",
        catThree = "",
        name = "测试关卡",
        levelId = "level-1",
        stageId = "stage-1",
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        createdBy = "test",
        updatedBy = "test",
    )
}
