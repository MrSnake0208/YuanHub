package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent

/** Reject coercion at the JSON boundary without changing the application's shared mapper. */
object AchievementCatalogDecoder {
    private fun fields(
        node: JsonNode,
        strings: Set<String>,
        numbers: Set<String> = emptySet(),
        booleans: Set<String> = emptySet(),
        arrays: Set<String> = emptySet(),
    ) {
        if (!node.isObject) invalid("条目必须是 JSON 对象")
        node.fields().forEach { (key, value) ->
            if (key !in strings + numbers + booleans + arrays) invalid("不支持字段：$key")
            if (!value.isNull && when (key) {
                    in strings -> !value.isTextual
                    in numbers -> !value.isNumber || !value.doubleValue().isFinite()
                    in booleans -> !value.isBoolean
                    else -> !value.isArray
                }
            ) {
                invalid("字段类型不正确：$key")
            }
        }
    }
    private fun integer(node: JsonNode, key: String) {
        node[key]?.let { if (!it.isIntegralNumber || !it.canConvertToInt()) invalid("$key 必须是整数") }
    }
    private fun <T> decode(node: JsonNode, type: Class<T>, mapper: ObjectMapper): T = try {
        mapper.treeToValue(node, type)
    } catch (_: JsonProcessingException) {
        invalid("缺少必填字段或字段类型非法")
    }

    fun category(node: JsonNode, mapper: ObjectMapper): CatalogCategory {
        fields(node, setOf("category_id", "name"), setOf("sort"), setOf("enabled"))
        integer(node, "sort")
        if (node["enabled"]?.isNull == true) invalid("enabled 不能是 null")
        return decode(node, CatalogCategory::class.java, mapper)
    }

    fun entry(node: JsonNode, mapper: ObjectMapper): AchievementEntry {
        fields(
            node,
            setOf("achievement_id", "game", "category_id", "name", "condition", "linked_metric"),
            setOf("sort", "target"),
            setOf("is_hidden"),
            setOf("rewards"),
        )
        integer(node, "sort")
        node["target"]?.takeUnless { it.isNull }?.let {
            if (!it.isIntegralNumber || !it.canConvertToLong()) invalid("target 必须是正整数或 null")
        }
        node["rewards"]?.takeUnless { it.isNull }?.forEach {
            fields(it, setOf("item_key", "name"), setOf("quantity"))
            val quantity = it["quantity"]
            if (quantity == null || !quantity.isIntegralNumber || !quantity.canConvertToLong()) invalid("奖励数量必须是正整数")
        }
        return decode(node, AchievementEntry::class.java, mapper)
    }

    fun content(node: JsonNode, mapper: ObjectMapper): CatalogContent {
        fields(
            node,
            setOf("game", "data_status", "coverage", "catalog_version"),
            arrays = setOf("categories", "entries", "retired_ids", "reward_items", "point_tracks", "reward_filter_keys"),
        )
        node["categories"]?.forEach { category(it, mapper) }
        node["entries"]?.forEach { entry(it, mapper) }
        node["retired_ids"]?.forEach { if (!it.isTextual) invalid("退役 ID 必须是文本") }
        node["reward_items"]?.forEach { item ->
            fields(item, setOf("item_key", "name"), arrays = setOf("games"))
            item["games"]?.forEach { if (!it.isTextual) invalid("奖励游戏必须是文本") }
        }
        node["reward_filter_keys"]?.forEach { if (!it.isTextual) invalid("奖励筛选键必须是文本") }
        node["point_tracks"]?.forEach { track ->
            fields(track, setOf("category_id", "item_key"), arrays = setOf("tiers"))
            track["tiers"]?.forEach { tier ->
                fields(tier, setOf("name", "icon"), numbers = setOf("at", "quantity"))
                for (key in listOf("at", "quantity")) {
                    val number = tier[key]
                    if (number == null || !number.isIntegralNumber || !number.canConvertToLong()) invalid("积分档位数值必须是整数")
                }
            }
        }
        return decode(node, CatalogContent::class.java, mapper)
    }
}
