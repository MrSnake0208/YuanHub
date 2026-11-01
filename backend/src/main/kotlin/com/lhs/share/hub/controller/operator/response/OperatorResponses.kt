package com.lhs.share.hub.controller.operator.response

import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscCatalog
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorRecordEntry
import com.lhs.share.hub.repository.entity.OperatorStarStone
import com.lhs.share.hub.repository.entity.OperatorStarStoneCatalog
import com.lhs.share.hub.repository.entity.normalized
import com.lhs.share.hub.service.operator.OperatorHuajiRules
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class OperatorCurrentResponse(
    val userId: String,
    val accountId: String,
    val game: String,
    val fullBaselineAt: Instant?,
    val entries: Map<String, OperatorCurrentEntryDto>,
    val updatedAt: Instant,
) {
    companion object {
        fun of(c: OperatorCurrent) = OperatorCurrentResponse(
            c.userId,
            c.accountId,
            c.game,
            c.fullBaselineAt,
            c.entries.mapValues { (_, e) ->
                OperatorCurrentEntryDto.of(e)
            },
            c.updatedAt,
        )
    }
}

data class OperatorCurrentEntryDto(
    val elite: Int,
    val starLevel: Int,
    val level: Int,
    val discs: List<OperatorDisc>,
    val starStones: List<OperatorStarStone>,
    @field:Schema(description = "最多两套命盘；没有 active/当前盘语义")
    val discLoadouts: List<OperatorDiscLoadout>,
    val combatStats: OperatorCombatStats?,
    val revision: Long,
    val listedBaselineAt: Instant?,
    val updatedAt: Instant?,
    val huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
    val huajiLegacy: com.lhs.share.hub.repository.entity.OperatorHuajiLegacy? = null,
    val levelBreakthroughStage: Int? = null,
) {
    companion object {
        fun of(entry: com.lhs.share.hub.repository.entity.OperatorEntry): OperatorCurrentEntryDto {
            val normalized = entry.normalized()
            return OperatorCurrentEntryDto(
                normalized.elite,
                normalized.starLevel,
                normalized.level,
                normalized.discs,
                normalized.starStones,
                normalized.discLoadouts,
                normalized.combatStats,
                normalized.revision,
                normalized.listedBaselineAt,
                normalized.updatedAt,
                normalized.huaji,
                normalized.huajiLegacy,
                com.lhs.share.hub.service.operator.OperatorLevelBreakthroughRules.read(normalized.level, normalized.levelBreakthroughStage),
            )
        }
    }
}

data class OperatorImportResult(val accepted: Int, val duplicates: Int, val superseded: Int, val warnings: List<String> = emptyList())

data class OperatorExportResponse(
    val format: String = "myshare-operator-exchange",
    val version: Int = 2,
    val exportedAt: Instant,
    val catalogVersion: String,
    val producer: ProducerDto,
    val accounts: List<OperatorExportAccountDto>,
    val records: List<OperatorExportRecordDto>,
)

data class OperatorExportAccountDto(val id: String, val name: String)

data class OperatorExportRecordDto(
    val accountId: String,
    val recordId: String,
    val recordType: String = "operator_snapshot",
    val game: String?,
    val effectiveAt: Instant,
    val snapshotScope: String = "full",
    val entries: List<com.lhs.share.hub.controller.operator.request.OperatorEntryRequest>,
)

data class OperatorRecordPageResponse(val items: List<OperatorRecordListItemDto>, val nextCursor: String?)

data class OperatorRecordListItemDto(
    val accountId: String,
    val recordId: String,
    val recordType: String,
    val game: String?,
    val snapshotScope: String,
    val effectiveAt: Instant,
    val receivedAt: Instant,
    val snapshotEffect: String,
    val entries: List<OperatorRecordEntry>,
)

/**
 * 公共图鉴（GET /v1/operator/catalog）的单条密探：只回答"有哪些密探、长什么样"。
 * 不含 starStones —— 星石槽位是用户养成档案字段（见 current/records），
 * 且目录里每个密探都是同一份 "主星石/辅星石" 模板，放进公共目录只会误导前端当真实养成数据展示。
 */
data class OperatorCatalogEntryResponse(
    val id: String,
    val name: String,
    val alias: String?,
    val rarity: Int,
    @field:Schema(nullable = true, description = "第三项奇闻展示名称；图鉴待维护时为 null")
    val specialOddityName: String?,
    @field:Schema(description = "attack / hp / special 三个稳定键及服务端按 rarity 派生的上限")
    val odditySchema: OperatorOdditySchemaResponse,
    @field:Schema(description = "当前缺失的目录字段；缺第三项名称时仅含 special_oddity_name")
    val incompleteFields: List<String>,
    val prof: List<String>,
    val subProf: List<String>,
    val games: List<String>,
    val discs: List<OperatorDiscCatalog>,
    // SP 形态指向其"本体"密探 id（如 史子眇·赴烛 -> 史子眇）；普通密探为 null。
    val spOf: String? = null,
    // 密探头像相对路径（如 "/avatar/char_001_yangxiu.webp"），前端拼 baseURL；未上传为 null。
    val avatar: String? = null,
    val huajiCapabilities: OperatorHuajiCapabilities? = null,
) {
    companion object {
        fun of(e: OperatorCatalogEntity) = OperatorCatalogEntryResponse(
            e.operatorId,
            e.name,
            e.alias,
            e.rarity,
            OperatorOddityRules.normalizedSpecialName(e.specialOddityName),
            OperatorOddityRules.schema(e.rarity, e.specialOddityName),
            OperatorOddityRules.incompleteFields(e.specialOddityName),
            e.prof,
            e.subProf,
            e.games,
            e.discs,
            e.spOf,
            e.avatar,
            OperatorHuajiCapabilities(
                maxStage = OperatorHuajiRules.maximum(e),
                hasNodes = e.spOf == null,
                awakeningSupported = OperatorHuajiRules.awakeningSupported(e),
                awakeningUpgradeSupported = e.spOf == null && e.rarity in 4..5,
            ),
        )
    }
}

data class OperatorOdditySchemaResponse(
    val attack: OperatorOddityDefinitionResponse,
    val hp: OperatorOddityDefinitionResponse,
    val special: OperatorOddityDefinitionResponse,
)

data class OperatorOddityDefinitionResponse(
    val name: String,
    val max: Int,
)

/** 管理端目录响应：保留旧管理字段，同时只读附加服务端派生的奇闻定义。 */
data class AdminOperatorCatalogResponse(
    val id: String,
    val name: String,
    val alias: String?,
    val rarity: Int,
    val specialOddityName: String?,
    val odditySchema: OperatorOdditySchemaResponse,
    val incompleteFields: List<String>,
    val prof: List<String>,
    val subProf: List<String>,
    val games: List<String>,
    val discs: List<OperatorDiscCatalog>,
    val starStones: List<OperatorStarStoneCatalog>,
    val spOf: String?,
    val avatar: String?,
    val catalogVersion: String,
    val createdAt: Instant,
) {
    companion object {
        fun of(e: OperatorCatalogEntity) = AdminOperatorCatalogResponse(
            id = e.operatorId,
            name = e.name,
            alias = e.alias,
            rarity = e.rarity,
            specialOddityName = OperatorOddityRules.normalizedSpecialName(e.specialOddityName),
            odditySchema = OperatorOddityRules.schema(e.rarity, e.specialOddityName),
            incompleteFields = OperatorOddityRules.incompleteFields(e.specialOddityName),
            prof = e.prof,
            subProf = e.subProf,
            games = e.games,
            discs = e.discs,
            starStones = e.starStones,
            spOf = e.spOf,
            avatar = e.avatar,
            catalogVersion = e.catalogVersion,
            createdAt = e.createdAt,
        )
    }
}

object OperatorOddityRules {
    const val MISSING_SPECIAL_NAME = "第三属性（图鉴待维护）"

    fun normalizedSpecialName(value: String?): String? = value?.trim()?.takeIf(String::isNotEmpty)

    fun schema(rarity: Int, specialOddityName: String?): OperatorOdditySchemaResponse {
        val limits = when (rarity) {
            3 -> Triple(300, 1560, 9)
            4 -> Triple(350, 1820, 11)
            5 -> Triple(500, 2600, 15)
            else -> throw IllegalArgumentException("Unsupported operator rarity: $rarity")
        }
        return OperatorOdditySchemaResponse(
            attack = OperatorOddityDefinitionResponse("攻击力", limits.first),
            hp = OperatorOddityDefinitionResponse("生命值", limits.second),
            special = OperatorOddityDefinitionResponse(normalizedSpecialName(specialOddityName) ?: MISSING_SPECIAL_NAME, limits.third),
        )
    }

    fun incompleteFields(specialOddityName: String?): List<String> =
        if (normalizedSpecialName(specialOddityName) == null) listOf("special_oddity_name") else emptyList()
}

data class OperatorCatalogResponse(
    val format: String = "myshare-operator-catalog",
    val version: Int = 1,
    val catalogVersion: String,
    val operators: List<OperatorCatalogEntryResponse>,
)

data class OperatorErrorResponse(val error: OperatorError)

data class OperatorError(
    val code: String,
    val message: String,
    val recordId: String? = null,
    val entryId: String? = null,
    val operatorId: String? = null,
    val fieldPath: String? = null,
)

data class OperatorHuajiCapabilities(
    val maxStage: Int,
    val hasNodes: Boolean,
    val awakeningSupported: Boolean,
    val awakeningUpgradeSupported: Boolean = false,
)
