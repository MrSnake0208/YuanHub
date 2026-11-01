package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.BondEntry
import com.lhs.share.hub.repository.entity.BondRecord
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import java.time.Instant

data class BondSummary(val triggeredCount: Int, val availableTotal: Int, val activeTriggeredCount: Int)

object BondRules {
    val actions = linkedMapOf(
        "arson" to "纵火",
        "rumor" to "传谣",
        "poison" to "下毒",
        "undercover" to "卧底",
        "gather" to "搜集",
        "extinguish" to "灭火",
        "purify" to "净水",
        "rescue" to "营救",
    )
    val weathers = linkedMapOf(
        "sunny" to "晴天",
        "rain" to "雨天",
        "fog" to "大雾",
        "wind" to "狂风",
        "light_snow" to "小雪",
        "heavy_snow" to "大雪",
        "hurricane" to "飓风",
        "thunder" to "雷鸣",
    )
    val games = setOf("代号鸢", "如鸢")
    const val MAX_RECORDS = 5000
    const val NATIVE_BYTES = 2 * 1024 * 1024
    const val LEGACY_BYTES = 8 * 1024 * 1024

    fun invalid(message: String): Nothing = throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_bond_request", message)
    fun conflict(message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "bond_conflict", message)
    fun game(game: String) {
        if (game !in games) invalid("game 只允许代号鸢或如鸢")
    }
    fun fields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in allowed }) invalid("对象包含不支持的字段")
    }
    fun text(node: JsonNode, key: String): String =
        node[key]?.takeIf { it.isTextual && it.textValue().isNotBlank() && it.textValue().length <= 200 }
            ?.textValue() ?: invalid("$key 必须是非空文本，最多200字")
    fun revision(node: JsonNode) = node["expected_revision"]?.takeIf { it.isIntegralNumber && it.canConvertToLong() && it.longValue() >= 0 }
        ?.longValue() ?: invalid("expected_revision 必须是非负整数")
    fun identity(entry: BondEntry) = listOf(entry.game, entry.members.sorted().joinToString("\u0000"), entry.action, entry.weather)

    fun validate(entries: List<BondEntry>, game: String) {
        game(game)
        if (entries.size > MAX_RECORDS) invalid("含历史身份的目录最多5000条")
        if (entries.map { it.bondId }.distinct().size != entries.size || entries.map(::identity).distinct().size != entries.size) {
            invalid("目录 ID 或成员＋行动＋天气重复")
        }
        entries.forEach { e ->
            if (!e.bondId.matches(Regex("bond_[0-9a-f]{32}")) || e.game != game) invalid("羁绊ID或游戏非法")
            if (e.members.size !in 2..3 || e.members.distinct().size != e.members.size ||
                e.members.any { it.isBlank() }
            ) {
                invalid("需要2或3名不同密探")
            }
            if (e.action !in actions || e.weather !in weathers || e.effect !in setOf("positive", "negative") ||
                e.status !in setOf("active", "retired", "invalid")
            ) {
                invalid("行动、天气、效果或状态非法")
            }
        }
    }

    fun summary(entries: List<BondEntry>, records: List<BondRecord>): BondSummary {
        val byId = entries.associateBy { it.bondId }
        if (records.any { it.bondId !in byId }) conflict("档案含缺失历史身份，请维护目录后重试；未生成零进度")
        val triggered = records.filter { it.triggered }.map { it.bondId }.toSet()
        return BondSummary(
            triggered.count { byId.getValue(it).status != "invalid" },
            entries.count { it.status == "active" },
            triggered.count { byId.getValue(it).status == "active" },
        )
    }

    fun apply(records: List<BondRecord>, changes: List<Pair<String, Boolean>>, source: String, now: Instant): List<BondRecord> {
        val next = records.associateBy { it.bondId }.toMutableMap()
        changes.forEach { (id, triggered) ->
            if (next[id]?.triggered != triggered) next[id] = BondRecord(id, triggered, source, now)
        }
        return next.values.toList()
    }
}
