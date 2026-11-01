package com.lhs.share.hub.work.model

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonValue
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.deser.std.StdDeserializer
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import java.time.LocalDateTime

enum class CompatibilityStatus(@get:JsonValue val value: String) {
    EXACT("exact"),
    PARTIAL("partial"),
    UNSUPPORTED("unsupported"),
}

data class CompatibilityIssue(
    val code: String,
    val path: String,
    val feature: String,
    val message: String,
    val severity: CompatibilityStatus,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkDocument(
    val format: String,
    val version: Int,
    val game: String,
    val levelId: String? = null,
    val stageName: String,
    val doc: WorkDoc,
    val operators: List<String?>,
    val exec: WorkExec? = null,
    val rounds: List<WorkRound>,
)

data class WorkDoc(val title: String, val details: String)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkExec(
    val delaysMs: WorkDelays? = null,
    val extensions: WorkExtensions? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkDelays(
    val attack: Int? = null,
    val ultimate: Int? = null,
    val defense: Int? = null,
    val sp: Int? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkExtensions(
    val maayuan: MaaYuanExtension? = null,
    val yuanassist: YuanAssistExtension? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MaaYuanExtension(
    val levelType: String? = null,
    val recognitionName: String? = null,
    val recTargetOffset: List<Int>? = null,
    val difficulty: String? = null,
    val caveType: String? = null,
    val lantaiNav: Boolean? = null,
)

data class YuanAssistExtension(val enemyTurnWaitMs: Int? = null)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkRound(val round: Int, val remark: String? = null, val actions: List<WorkAction>)

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes(
    JsonSubTypes.Type(value = SlotAction::class, name = "attack"),
    JsonSubTypes.Type(value = SlotAction::class, name = "ultimate"),
    JsonSubTypes.Type(value = SlotAction::class, name = "defense"),
    JsonSubTypes.Type(value = SlotAction::class, name = "sp"),
    JsonSubTypes.Type(value = WaitAction::class, name = "wait"),
    JsonSubTypes.Type(value = PauseAction::class, name = "pause"),
    JsonSubTypes.Type(value = SwitchTargetAction::class, name = "switch_target"),
    JsonSubTypes.Type(value = AutoBattleAction::class, name = "auto_battle"),
    JsonSubTypes.Type(value = InteractionAction::class, name = "interaction"),
    JsonSubTypes.Type(value = OperatorAction::class, name = "operator_action"),
    JsonSubTypes.Type(value = CheckAction::class, name = "check"),
    JsonSubTypes.Type(value = RestartAction::class, name = "restart"),
)
sealed interface WorkAction

data class SlotAction(val slot: Int, val type: String) : WorkAction
data class WaitAction(val type: String = "wait", val durationMs: Int) : WorkAction
data class PauseAction(val type: String = "pause") : WorkAction

@JsonInclude(JsonInclude.Include.NON_NULL)
data class SwitchTargetAction(val type: String = "switch_target", val direction: String, val count: Int? = null) : WorkAction
data class AutoBattleAction(val type: String = "auto_battle", val enabled: Boolean) : WorkAction
data class InteractionAction(val type: String = "interaction") : WorkAction
data class OperatorAction(
    val type: String = "operator_action",
    val slot: Int,
    val action: String,
) : WorkAction {
    constructor(slot: Int) : this(slot = slot, action = "switch_form")
}

data class CheckAction(
    val type: String = "check",
    val condition: WorkCondition,
    val onFail: String,
) : WorkAction {
    constructor(condition: WorkCondition) : this(condition = condition, onFail = "restart")
}
data class RestartAction(val type: String = "restart") : WorkAction

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes(
    JsonSubTypes.Type(value = PartySurvivesCondition::class, name = "party_survives"),
    JsonSubTypes.Type(value = OperatorAliveCondition::class, name = "operator_alive"),
    JsonSubTypes.Type(value = OperatorPresentCondition::class, name = "operator_present"),
    JsonSubTypes.Type(value = OperatorCopiedCondition::class, name = "operator_copied"),
    JsonSubTypes.Type(value = DragonQiCondition::class, name = "dragon_qi"),
    JsonSubTypes.Type(value = StarCountCondition::class, name = "star_count"),
    JsonSubTypes.Type(value = CritCondition::class, name = "crit"),
)
sealed interface WorkCondition

data class PartySurvivesCondition(val type: String = "party_survives") : WorkCondition
data class OperatorAliveCondition(val type: String = "operator_alive", val slot: Int) : WorkCondition
data class OperatorPresentCondition(val type: String = "operator_present", val slot: Int) : WorkCondition
data class OperatorCopiedCondition(val type: String = "operator_copied", val slot: Int) : WorkCondition

@JsonInclude(JsonInclude.Include.NON_NULL)
data class DragonQiCondition(
    val type: String = "dragon_qi",
    val slot: Int? = null,
    val operator: String,
    val value: Int,
) : WorkCondition

data class StarCountCondition(
    val type: String = "star_count",
    val color: String,
    val operator: String,
    val value: Int,
) : WorkCondition

data class CritCondition(val type: String = "crit") : WorkCondition

data class WorkLevelSummary(
    val id: String,
    val game: String,
    val name: String,
    val levelId: String,
    val stageId: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkMetadata(
    val id: String,
    val title: String,
    val uploaderId: String?,
    val uploadTime: LocalDateTime?,
    val views: Long,
    val hotScore: Double,
    val likeCount: Long,
    val ownerId: String? = null,
    val status: WorkStatus? = null,
    val revision: Long? = null,
    val createdAt: LocalDateTime? = null,
    val updatedAt: LocalDateTime? = null,
    val publishedAt: LocalDateTime? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkListItem(
    val id: String,
    val title: String,
    val stageName: String?,
    val game: String?,
    val level: WorkLevelSummary?,
    val uploaderId: String?,
    val uploadTime: LocalDateTime?,
    val views: Long,
    val hotScore: Double,
    val conversionStatus: CompatibilityStatus,
    val issueCount: Int,
    val ownerId: String? = null,
    val status: WorkStatus? = null,
    val revision: Long? = null,
    val updatedAt: LocalDateTime? = null,
)

data class WorkPageResponse(
    val page: Int,
    val limit: Int,
    val total: Long,
    val hasNext: Boolean,
    val items: List<WorkListItem>,
)

data class WorkConversion(val status: CompatibilityStatus, val issues: List<CompatibilityIssue>)
@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkSource(val type: String = "maayuan_legacy", val id: String, val rawContent: String? = null)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkDetailResponse(
    val metadata: WorkMetadata,
    val level: WorkLevelSummary?,
    val conversion: WorkConversion,
    val work: WorkDocument?,
    val source: WorkSource,
)

enum class WorkTarget { MAAYUAN, YUANASSIST }

enum class WorkStatus { DRAFT, PUBLIC }

data class WorkValidationIssue(val path: String, val code: String, val message: String)

data class WorkDocumentRequest(@param:JsonDeserialize(using = StrictWorkDocumentDeserializer::class) val document: WorkDocument)

data class WorkReplaceRequest(
    val expectedRevision: Long,
    @param:JsonDeserialize(using = StrictWorkDocumentDeserializer::class) val document: WorkDocument,
)

data class WorkRevisionRequest(val expectedRevision: Long)

data class WorkRevisionConflict(val currentRevision: Long)

class StrictWorkDocumentDeserializer : StdDeserializer<WorkDocument>(WorkDocument::class.java) {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): WorkDocument {
        val mapper = (parser.codec as ObjectMapper).copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        return mapper.treeToValue(parser.codec.readTree(parser), WorkDocument::class.java)
    }
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WorkCompatibilityResponse(
    val target: WorkTarget,
    val status: CompatibilityStatus,
    val issues: List<CompatibilityIssue>,
    val targetDocument: Any? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MaaYuanTargetDocument(
    val roundActions: Map<String, List<List<String>>>,
    val delaysMs: WorkDelays? = null,
    val extensions: MaaYuanExtension? = null,
)

data class YuanAssistTargetDocument(
    @get:JsonProperty("scriptContent") val scriptContent: String,
    val instructions: List<YuanAssistInstruction>,
    val config: YuanAssistConfig,
)

data class YuanAssistInstruction(
    val turn: Int,
    val step: Int,
    val type: String,
    val value: Int,
)

data class YuanAssistConfig(
    @get:JsonProperty("intervalAttack") val intervalAttack: Int,
    @get:JsonProperty("intervalSkill") val intervalSkill: Int,
    @get:JsonProperty("waitTurn") val waitTurn: Int,
)

fun statusOf(issues: List<CompatibilityIssue>): CompatibilityStatus = when {
    issues.any { it.severity == CompatibilityStatus.UNSUPPORTED } -> CompatibilityStatus.UNSUPPORTED
    issues.isNotEmpty() -> CompatibilityStatus.PARTIAL
    else -> CompatibilityStatus.EXACT
}
