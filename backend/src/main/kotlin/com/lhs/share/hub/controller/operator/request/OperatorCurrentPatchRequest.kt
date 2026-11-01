package com.lhs.share.hub.controller.operator.request

import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

/**
 * Swagger 用的 PATCH 结构。Controller 使用 JSON tree 保留字段缺失与显式 null 的区别，
 * 但公开契约仍由这些类型准确描述。
 */
@Schema(name = "OperatorCurrentPatchRequest")
data class OperatorCurrentPatchRequest(
    val level: Int? = null,
    @field:Schema(description = "等级突破阶数0..9；缺失保留，显式null待确认；与等级组合校验", minimum = "0", maximum = "9", nullable = true)
    val levelBreakthroughStage: Int? = null,
    val elite: Int? = null,
    @JsonProperty("star_level") val starLevel: Int? = null,
    @field:Schema(description = "独立化极事实；缺失子字段保留；stage/awakened可显式null表示未知")
    val huaji: OperatorHuajiPatchRequest? = null,
    @JsonProperty("disc_loadouts") val discLoadouts: List<OperatorDiscLoadoutPatchRequest>? = null,
    @field:Schema(description = "六槽当前装备的完整替换；缺失保留，空数组清空；槽位仅允许 main1..main3、assist1..assist3")
    @JsonProperty("star_stones") val starStones: List<OperatorStarStonePatchRequest>? = null,
    @JsonProperty("combat_stats") val combatStats: OperatorCombatStatsPatchRequest? = null,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    @JsonProperty("expected_revision") val expectedRevision: Long,
    @field:Schema(
        requiredMode = Schema.RequiredMode.REQUIRED,
        allowableValues = ["manual_correction", "local_migration"],
    )
    val reason: String,
)

@Schema(description = "局部事实；至少一个字段。缺失保留；stage/awakened的显式null表示未知", minProperties = 1)
data class OperatorHuajiPatchRequest(
    @field:Schema(nullable = false) val owned: Boolean? = null,
    @field:Schema(nullable = true, minimum = "0", maximum = "25") val stage: Int? = null,
    @field:Schema(nullable = true) val awakened: Boolean? = null,
)

data class OperatorDiscLoadoutPatchRequest(
    val id: String,
    val name: String? = null,
    val discs: List<OperatorDiscPatchRequest> = emptyList(),
    @field:Schema(description = "缺失保留原组合标记；完美盘由用户确认", allowableValues = ["unmarked", "reroll", "perfect"])
    val status: String? = null,
    @field:Schema(description = "独立目标，最多三个合法且不重复词条；缺失保留，空数组清空")
    @JsonProperty("target_discs") val targetDiscs: List<OperatorDiscPatchRequest>? = null,
)

data class OperatorDiscPatchRequest(@JsonProperty("ot_name") val otName: String)

data class OperatorStarStonePatchRequest(
    val name: String,
    @field:Schema(allowableValues = ["main1", "main2", "main3", "assist1", "assist2", "assist3"])
    val type: String,
    @field:Schema(minimum = "0")
    val level: Int,
)

data class OperatorCombatStatsPatchRequest(
    val observedAttack: Long? = null,
    val observedHp: Long? = null,
    val manualAttack: Long? = null,
    val manualHp: Long? = null,
    val source: String? = null,
    val observedAt: Instant? = null,
    val observedStatus: String? = null,
    val combatInputSignature: String? = null,
    val observedInputs: OperatorObservedInputsPatchRequest? = null,
    @field:Schema(description = "攻击力/生命力显示偏好；内部字段按出现性合并，不参与 stale", nullable = true)
    @JsonProperty("display_mode") val displayMode: OperatorCombatDisplayModePatchRequest? = null,
    val oddities: Map<String, OperatorOddityPatchRequest>? = null,
)

data class OperatorCombatDisplayModePatchRequest(
    @field:Schema(description = "auto=优先自动计算，manual=手填或采集，null=跟随账号补全设置", nullable = true, allowableValues = ["auto", "manual"])
    val attack: String? = null,
    @field:Schema(description = "auto=优先自动计算，manual=手填或采集，null=跟随账号补全设置", nullable = true, allowableValues = ["auto", "manual"])
    val hp: String? = null,
)

data class OperatorObservedInputsPatchRequest(
    val level: Int? = null,
    val elite: Int? = null,
    val starLevel: Int? = null,
    val odditiesSignature: String? = null,
    val equippedStarStonesSignature: String? = null,
    val huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
    val levelBreakthroughStage: Int? = null,
)

data class OperatorOddityPatchRequest(
    @field:Schema(description = "按稳定键校验：attack/hp 必须为非负整数 JSON 数字；special 最多一位有效小数，0.50 等价于 0.5；沿用原单位和图鉴上限")
    val current: Double,
    @field:Schema(description = "仅作来源诊断；服务端始终使用公共图鉴 rarity 对应的上限")
    val max: Int? = null,
)
