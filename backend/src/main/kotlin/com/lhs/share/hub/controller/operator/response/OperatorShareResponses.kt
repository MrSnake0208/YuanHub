package com.lhs.share.hub.controller.operator.response

import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.lhs.share.hub.repository.entity.OperatorOddityNumberSerializer
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class OperatorShareResponse(
    val accountId: String,
    val active: Boolean,
    val shareCode: String?,
)

/** Public projection for a share link; identity and internal current fields are deliberately absent. */
data class OperatorShareViewResponse(
    val game: String,
    val catalogVersion: String,
    val updatedAt: Instant?,
    val entries: Map<String, OperatorShareEntryDto>,
    val tags: List<OperatorShareTag> = emptyList(),
)

data class OperatorShareTag(val id: String, val name: String, val operatorIds: List<String>)

data class OperatorShareEntryDto(
    val level: Int,
    val elite: Int,
    val starLevel: Int,
    val growthState: String,
    val discLoadouts: List<OperatorShareDiscLoadout>,
    val starStones: List<OperatorShareStarStone>,
    val combatStats: OperatorShareCombatStats?,
    val huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
    val levelBreakthroughStage: Int? = null,
    val panel: OperatorPanelResponse? = null,
    val displayPanel: OperatorDisplayPanelResponse? = null,
)

/** Resolved values and their public source labels; account/operator preferences remain private. */
data class OperatorDisplayPanelResponse(
    val attack: Long?,
    val hp: Long?,
    val attackSource: String,
    val hpSource: String,
)

/** Public combat values; observation provenance, signatures and display preferences stay private. */
data class OperatorShareCombatStats(
    val observedAttack: Long?,
    val observedHp: Long?,
    val manualAttack: Long?,
    val manualHp: Long?,
    val oddities: Map<String, OperatorShareOddityValue>,
)

data class OperatorShareDiscLoadout(
    val id: String,
    val name: String,
    val discs: List<OperatorShareDisc>,
    val status: String = "unmarked",
)

data class OperatorShareDisc(
    val otName: String,
    val abbreviation: String?,
    val color: String?,
    val desp: String?,
)

data class OperatorShareStarStone(
    val name: String?,
    val type: String,
    val level: Int,
)

data class OperatorShareOddityValue(
    @field:Schema(description = "attack/hp 为非负整数；special 最多一位有效小数；沿用原单位和图鉴上限")
    @get:JsonSerialize(using = OperatorOddityNumberSerializer::class)
    val current: Double,
)
