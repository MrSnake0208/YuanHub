package com.lhs.share.hub.repository

import org.bson.Document
import java.math.BigDecimal

/** Inspect before Mongo's converter can discard removed fields or truncate a Double target to Long. No database writes. */
object AchievementCatalogCompatibility {
    private val fields =
        setOf("achievementId", "game", "categoryId", "name", "condition", "sort", "isHidden", "rewards", "target", "linkedMetric", "_class")

    fun normalizeEntry(entry: Document, path: String, issues: MutableList<String>) {
        val id = entry.getString("achievementId") ?: "未知ID"
        entry.forEach { (key, value) ->
            val empty = value == null || value == "" || value is Collection<*> && value.isEmpty()
            val compatibleKind = key == "progressKind" && value == "integer" && entry["target"] != null
            if (key !in fields && !empty && !compatibleKind) issues += "$path/$id：旧字段 $key 非空，须核对保留方式"
        }
        entry["target"]?.let { value ->
            val number = (value as? Number)?.toString()?.toBigDecimalOrNull()
            if (number == null || number.stripTrailingZeros().scale() > 0 || number < BigDecimal.ONE ||
                number > BigDecimal("1000000000000")
            ) {
                issues += "$path/$id：旧目标 $value 无法按正整数读取，未截断原值"
                entry["target"] = null
            } else {
                entry["target"] = number.toLong()
            }
        }
    }

    fun content(content: Document, path: String, issues: MutableList<String>): Map<String, String> {
        val rewards = mutableMapOf<String, String>()
        (content["entries"] as? List<*>)?.filterIsInstance<Document>()?.forEach { entry ->
            val id = entry.getString("achievementId")
            val text = entry["reward"] as? String
            if (id != null && !text.isNullOrBlank()) rewards[id] = text
            normalizeEntry(entry, path, issues)
        }
        return rewards
    }
}
