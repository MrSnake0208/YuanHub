package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.repository.entity.CatalogContent

object AchievementCatalogRules {
    const val MAX_ENTRIES = 5000
    const val MAX_TARGET = 1000000000000L
    const val MAX_DOCUMENT_BYTES = 12 * 1024 * 1024

    fun errors(value: CatalogContent, publishing: Boolean): List<String> = buildList {
        fun require(ok: Boolean, message: String) {
            if (!ok) add(message)
        }
        require(value.game in setOf("代号鸢", "如鸢"), "游戏不支持")
        require(value.rewardItems.size <= AchievementRewards.MAX_ITEMS, "奖励字典过大")
        require(value.rewardItems.map { it.itemKey }.distinct().size == value.rewardItems.size, "奖励物品键重复")
        value.rewardItems.forEach { item ->
            require(item.itemKey.matches(Regex("[a-z][a-z0-9_]{0,99}")), "奖励物品键格式非法")
            require(item.name.isNotBlank() && item.name.length <= 200, "奖励物品名称必填且最多200字")
            require(
                item.games.isNotEmpty() && item.games.distinct().size == item.games.size &&
                    item.games.all { it in setOf("代号鸢", "如鸢") },
                "奖励适用游戏非法",
            )
        }
        val rewardsByKey = value.rewardItems.associateBy { it.itemKey }
        require(value.rewardFilterKeys.size <= 20 && value.rewardFilterKeys.distinct().size == value.rewardFilterKeys.size, "奖励筛选重复或过多")
        require(value.rewardFilterKeys.all { value.game in rewardsByKey[it]?.games.orEmpty() }, "奖励筛选引用未知物品")
        require(
            value.pointTracks.size <= 100 && value.pointTracks.map {
                it.categoryId
            }.distinct().size == value.pointTracks.size,
            "积分配置分类重复或过多",
        )
        value.pointTracks.forEach { track ->
            require(value.categories.any { it.categoryId == track.categoryId }, "积分配置引用未知分类")
            require(value.game in rewardsByKey[track.itemKey]?.games.orEmpty(), "积分配置引用未知物品")
            require(track.tiers.isNotEmpty() && track.tiers.size <= 20, "积分档位须为1至20项")
            require(track.tiers.zipWithNext().all { (a, b) -> a.at < b.at }, "积分档位必须递增且不重复")
            track.tiers.forEach { tier ->
                require(
                    tier.at in 1..AchievementRewards.MAX_SAFE_INTEGER && tier.quantity in 1..AchievementRewards.MAX_SAFE_INTEGER,
                    "积分目标与奖励数量须为正安全整数",
                )
                require(tier.name.isNotBlank() && tier.name.length <= 200, "积分奖励名称必填且最多200字")
                require(tier.icon in setOf("coins", "ticket", "title", "frame"), "积分奖励图标非法")
            }
        }
        require(value.dataStatus in setOf("empty", "partial", "complete"), "资料范围状态非法")
        require(value.coverage.length <= 2000, "范围说明过长")
        require(value.categories.size <= 100 && value.entries.size <= MAX_ENTRIES, "分类最多100个，成就最多5000条（含退役）")
        require(value.categories.map { it.categoryId }.distinct().size == value.categories.size, "分类 ID 重复")
        require(value.entries.map { it.achievementId }.distinct().size == value.entries.size, "成就 ID 重复")
        require(value.retiredIds.all { id -> value.entries.any { it.achievementId == id } }, "退役 ID 必须存在于草稿")
        value.categories.forEach {
            require(it.categoryId.matches(Regex("[a-zA-Z0-9_-]{1,100}")), "分类 ID 非法")
            require(it.name.isNotBlank() && it.name.length <= 100, "分类名称必填且最多100字")
        }
        val categories = value.categories.associateBy { it.categoryId }
        val active = value.entries.filter { it.achievementId !in value.retiredIds }
        if (publishing) require((value.dataStatus == "empty") == active.isEmpty(), "空目录必须标记 empty，非空目录请选择 partial 或 complete")
        value.entries.forEach { entry ->
            val id = entry.achievementId
            require(id.matches(Regex("yh_[a-z0-9_]{1,96}")), "$id：成就 ID 非法")
            require(entry.game == value.game, "$id：游戏不匹配")
            require(categories.containsKey(entry.categoryId), "$id：分类不存在")
            if (id !in value.retiredIds) require(categories[entry.categoryId]?.enabled == true, "$id：分类已停用，请先迁移或退役该分类下的成就")
            require(entry.name.length <= 200 && entry.condition.length <= 4000, "$id：名称或条件过长")
            require(entry.target == null || entry.target in 1..MAX_TARGET, "$id：目标必须是1到1e12的正整数")
            require(
                entry.linkedMetric == null ||
                    entry.linkedMetric == "yuan_bond_variants" && entry.target != null && entry.target in 1..MAX_TARGET,
                "$id：联动指标仅支持 yuan_bond_variants，目标须为正整数",
            )
            entry.rewards?.let { rewards ->
                require(rewards.size <= AchievementRewards.MAX_ITEMS, "$id：奖励物品过多")
                require(rewards.map { it.itemKey }.distinct().size == rewards.size, "$id：奖励物品键重复")
                var total = 0L
                rewards.forEach { reward ->
                    val item = rewardsByKey[reward.itemKey]
                    require(item != null && item.name == reward.name && entry.game in item.games, "$id：奖励物品键、名称或适用游戏不匹配")
                    val valid = reward.quantity in 1..AchievementRewards.MAX_SAFE_INTEGER
                    require(valid, "$id：奖励数量必须是正安全整数")
                    if (valid) {
                        require(total <= AchievementRewards.MAX_SAFE_INTEGER - reward.quantity, "$id：奖励数量合计超过安全整数")
                        total = (total + reward.quantity).coerceAtMost(AchievementRewards.MAX_SAFE_INTEGER)
                    }
                }
            }
            if (publishing && id !in value.retiredIds) require(entry.name.isNotBlank(), "$id：成就名称必填")
        }
    }

    fun compatibility(value: CatalogContent, identities: Map<String, AchievementEntry>): List<String> = value.entries.mapNotNull { entry ->
        val old = identities[entry.achievementId] ?: return@mapNotNull null
        if (old.target != null && (entry.target == null || entry.target < old.target)) {
            "${entry.achievementId}：已发布目标仅可增加，不可降低或清空；请保留原 ID 的口径"
        } else {
            null
        }
    }
}
