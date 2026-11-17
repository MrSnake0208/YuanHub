package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.BondCatalogRepository
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.BondCatalog
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.service.achievement.AchievementCatalogRules
import com.lhs.share.hub.service.bond.BondRules
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Service
class CatalogGameLinkService(
    private val operators: OperatorCatalogRepository,
    private val bonds: BondCatalogRepository,
    private val achievements: AchievementCatalogRepository,
    private val mapper: ObjectMapper,
) {
    fun supportedIds(game: String): Set<String> = operators.findAllByOrderByOperatorIdAsc()
        .filter { game in it.games }.map { it.operatorId }.toSet()

    fun available(ids: List<String>, game: String): Boolean = ids.all { game in operators.findByOperatorId(it)?.games.orEmpty() }

    fun errors(content: CatalogContent, publishing: Boolean): List<String> = content.entries.flatMap { entry ->
        buildList {
            if (entry.operatorIds.size > 100 || entry.operatorIds.distinct().size != entry.operatorIds.size ||
                entry.operatorIds.any { operators.findByOperatorId(it) == null }
            ) {
                add("${entry.achievementId}：关联密探不存在、重复或超过100个")
            }
            if (publishing && entry.achievementId !in content.retiredIds && !available(entry.operatorIds, content.game)) {
                add("${entry.achievementId}：关联密探尚未全部支持${content.game}，保留草稿")
            }
        }
    }

    // Runs within the caller's Hub transaction: a conflict rolls back the initiating edit too.
    @Transactional(transactionManager = "hubTransactionManager")
    fun sync(operatorId: String? = null) {
        syncBonds(operatorId)
        syncAchievements(operatorId)
    }

    private fun syncBonds(operatorId: String?) {
        val source = bonds.find("代号鸢") ?: return
        val stored = bonds.find("如鸢")
        val old = stored ?: BondCatalog("如鸢", published = BondPublication("bonds-empty-如鸢", "如鸢"))
        val supported = supportedIds("如鸢")
        val sources = old.syncedSources.toMutableMap()
        val additions = source.published.entries.filter {
            it.status == "active" && (operatorId == null || operatorId in it.members) &&
                supported.containsAll(it.members)
        }
            .mapNotNull { entry ->
                if (entry.bondId in sources) return@mapNotNull null
                val existing = old.identities.find {
                    it.members.sorted() == entry.members.sorted() && it.action == entry.action &&
                        it.weather == entry.weather
                }
                val id = existing?.bondId ?: "bond_${UUID.randomUUID().toString().replace("-", "")}"
                sources[entry.bondId] = id
                if (existing != null) null else entry.copy(bondId = id, game = "如鸢")
            }
        if (sources == old.syncedSources) return
        val next = old.copy(
            revision = old.revision + 1,
            draft = old.draft + additions,
            identities = old.identities + additions,
            syncedSources = sources,
        )
        BondRules.validate(next.draft, "如鸢")
        if (next.identities.size > BondRules.MAX_RECORDS) fail("如鸢羁绊目录身份数量已达上限")
        checkSize(next)
        if (stored == null) {
            bonds.insert(next)
        } else if (!bonds.replace(next, old.revision)) {
            fail("如鸢羁绊目录已变化，请重新保存")
        }
    }

    private fun syncAchievements(operatorId: String?) {
        val source = achievements.find("代号鸢") ?: return
        val stored = achievements.find("如鸢")
        val old = stored ?: AchievementCatalog(
            "如鸢",
            published = CatalogPublication("achievement-empty-如鸢", CatalogContent("如鸢"), Instant.EPOCH, ""),
            draft = CatalogContent("如鸢"),
        )
        val supported = supportedIds("如鸢")
        val candidates = source.published.content.entries.filter {
            it.achievementId !in source.published.content.retiredIds && it.operatorIds.isNotEmpty() &&
                (operatorId == null || operatorId in it.operatorIds) && supported.containsAll(it.operatorIds) &&
                it.achievementId !in old.syncedSources
        }
        if (candidates.isEmpty()) return
        if (old.compatibilityIssues.isNotEmpty() || source.compatibilityIssues.isNotEmpty()) fail("成就目录需先处理旧资料兼容问题")
        val sources = old.syncedSources.toMutableMap()
        val categories = old.draft.categories.toMutableList()
        val rewards = old.draft.rewardItems.toMutableList()
        val categoryMap = mutableMapOf<String, String>()
        val additions = candidates.map { entry ->
            val categoryId = categoryMap.getOrPut(entry.categoryId) {
                val sourceCategory = source.published.content.categories.first { it.categoryId == entry.categoryId }
                val categoryKey = "category:${entry.categoryId}"
                val mapped = sources[categoryKey]
                val target = if (mapped != null) {
                    categories.find { it.categoryId == mapped }
                        ?: fail("如鸢已同步分类被移除，请先恢复分类")
                } else {
                    categories.find { it.name == sourceCategory.name }
                }
                if (target != null && !target.enabled) fail("如鸢对应成就分类已停用")
                val category =
                    target
                        ?: sourceCategory.copy(categoryId = "cat_${UUID.randomUUID().toString().replace("-", "")}").also {
                            categories.add(it)
                        }
                sources[categoryKey] = category.categoryId
                category.categoryId
            }
            entry.rewards.orEmpty().forEach { reward ->
                val existing = rewards.find { it.itemKey == reward.itemKey }
                if (existing != null) {
                    if (existing.name != reward.name || "如鸢" !in existing.games) fail("如鸢奖励定义冲突：${reward.itemKey}")
                } else {
                    val item = source.published.content.rewardItems.find { it.itemKey == reward.itemKey } ?: fail("来源奖励定义缺失")
                    rewards.add(item.copy(games = (item.games + "如鸢").distinct()))
                }
            }
            val id = "yh_ry_${UUID.randomUUID().toString().replace("-", "")}"
            sources[entry.achievementId] = id
            entry.copy(achievementId = id, game = "如鸢", categoryId = categoryId)
        }
        val content = old.draft.copy(
            entries = old.draft.entries + additions,
            categories = categories,
            rewardItems = rewards,
            dataStatus = if (old.draft.dataStatus == "empty") "partial" else old.draft.dataStatus,
            coverage = if (old.draft.dataStatus == "empty") "当前收录的成就资料。" else old.draft.coverage,
        )
        val errors = AchievementCatalogRules.errors(content, false)
        if (errors.isNotEmpty()) fail(errors.joinToString("；"))
        val next = old.copy(
            revision = old.revision + 1,
            draft = content,
            syncedSources = sources,
            issuedIds = old.issuedIds + additions.map {
                it.achievementId
            },
            categoryIds = old.categoryIds + categories.map { it.categoryId },
        )
        if ((next.issuedIds + next.identities.keys).size > AchievementCatalogRules.MAX_ENTRIES) fail("如鸢成就目录身份数量已达上限")
        checkSize(next)
        if (stored == null) {
            achievements.insert(next)
        } else if (!achievements.replace(next, old.revision)) {
            fail("如鸢成就目录已变化，请重新保存")
        }
    }

    private fun checkSize(value: Any) {
        if (mapper.writeValueAsBytes(value).size > AchievementCatalogRules.MAX_DOCUMENT_BYTES) fail("同步后目录超过12MiB，请先整理目录")
    }

    private fun fail(message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "catalog_sync_conflict", message)
}
