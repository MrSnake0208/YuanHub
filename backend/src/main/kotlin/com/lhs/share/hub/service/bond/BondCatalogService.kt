package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.BondCatalogRepository
import com.lhs.share.hub.repository.entity.BondCatalog
import com.lhs.share.hub.repository.entity.BondEntry
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.service.bond.BondRules.conflict
import com.lhs.share.hub.service.bond.BondRules.invalid
import com.lhs.share.hub.service.operator.OperatorCatalogService
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

data class BondPublishPreview(val expectedRevision: Long, val changes: List<BondEntry>, val errors: List<String>)

@Service
class BondCatalogService(
    private val repository: BondCatalogRepository,
    private val operators: OperatorCatalogService,
    private val mapper: ObjectMapper,
    private val achievements: AchievementCatalogRepository,
) {
    fun read(game: String): BondCatalog {
        BondRules.game(game)
        return repository.find(game) ?: BondCatalog(game, published = BondPublication("bonds-empty-$game", game))
    }
    fun catalog(game: String): BondPublication {
        val published = achievements.published(game)?.content
        val targets = published?.entries.orEmpty().filter {
            it.achievementId !in published!!.retiredIds && it.linkedMetric == "yuan_bond_variants"
        }.mapNotNull { it.target?.takeIf { target -> target > 0 } }.distinct().sorted()
        return read(game).published.copy(publishedBy = null, achievementTargets = targets)
    }

    fun fence(game: String, version: String) {
        if (!repository.fence(game, version)) conflict("目录已变化，请重新读取或预览")
    }

    fun decode(node: JsonNode, game: String): List<BondEntry> {
        if (!node.isArray || node.size() > BondRules.MAX_RECORDS) invalid("entries 必须是最多5000条的数组")
        return node.map { row ->
            BondRules.fields(row, setOf("bond_id", "game", "members", "action", "weather", "effect", "status"))
            val members =
                row["members"]?.takeIf { it.isArray && it.all(JsonNode::isTextual) }?.map { it.textValue() }
                    ?: invalid("members 必须是密探 ID 数组")
            BondEntry(
                if (row.has("bond_id")) BondRules.text(row, "bond_id") else "bond_${UUID.randomUUID().toString().replace("-", "")}",
                BondRules.text(row, "game"),
                members.sorted(),
                BondRules.text(row, "action"),
                BondRules.text(row, "weather"),
                BondRules.text(row, "effect"),
                BondRules.text(row, "status"),
            )
        }.also { BondRules.validate(it, game) }
    }

    fun save(game: String, revision: Long, entries: List<BondEntry>): BondCatalog {
        val old = current(game, revision)
        val canonical = entries.map { it.copy(members = it.members.sorted()) }
        BondRules.validate(canonical, game)
        val identities = old.identities.associateBy { it.bondId }
        val foreign = read(if (game == "如鸢") "代号鸢" else "如鸢").identities.map { it.bondId }.toSet()
        val operatorIds = operators.catalog().operators.map { it.id }.toSet()
        canonical.forEach { next ->
            if (next.bondId in foreign) invalid("羁绊ID属于另一游戏，请分别生成身份")
            val previous = identities[next.bondId]
            if (previous != null && BondRules.identity(previous) != BondRules.identity(next)) invalid("已分配 ID 不得更换成员、行动或天气：${next.bondId}")
            if (identities.values.any { it.bondId != next.bondId && BondRules.identity(it) == BondRules.identity(next) }) {
                invalid("该成员、行动、天气已有稳定 ID，请保留原 ID")
            }
            if (next.members.any { it !in operatorIds }) invalid("存在未知密探 ID")
        }
        return persist(old, old.copy(draft = canonical, identities = (identities + canonical.associateBy { it.bondId }).values.toList()))
    }

    fun discard(game: String, revision: Long): BondCatalog {
        val old = current(game, revision)
        return persist(old, old.copy(draft = old.published.entries))
    }

    private fun candidate(old: BondCatalog, restore: String?): List<BondEntry> {
        val selected = if (restore == null) old.draft else old.history.find { it.catalogVersion == restore }?.entries ?: invalid("历史版本不存在")
        val ids = selected.map { it.bondId }.toSet()
        return selected +
            old.published.entries.filter { it.bondId !in ids }.map { if (it.status == "invalid") it else it.copy(status = "retired") }
    }

    fun preview(game: String, revision: Long, restore: String? = null): BondPublishPreview {
        val old = current(game, revision)
        val entries = candidate(old, restore)
        BondRules.validate(entries, game)
        val operatorMap = operators.catalog().operators.associateBy { it.id }
        val errors = entries.filter { it.status == "active" }.flatMap { e ->
            e.members.mapNotNull { id ->
                val op = operatorMap[id]
                if (op == null || game !in op.games) "${e.bondId}：${op?.name ?: id} 未确认在${game}可用，保留草稿" else null
            }
        }
        return BondPublishPreview(revision, entries.filter { next -> old.published.entries.none { it == next } }, errors)
    }

    fun publish(game: String, revision: Long, actor: String, restore: String? = null): BondCatalog {
        val old = current(game, revision)
        val preview = preview(game, revision, restore)
        if (preview.errors.isNotEmpty()) invalid(preview.errors.joinToString("；"))
        val entries = candidate(old, restore)
        val publication = BondPublication("bonds-${UUID.randomUUID()}", game, entries, Instant.now().truncatedTo(ChronoUnit.MILLIS), actor)
        return persist(old, old.copy(published = publication, draft = entries, history = (listOf(old.published) + old.history).take(5)))
    }

    private fun current(game: String, revision: Long) = read(game).also {
        if (revision < 0 || it.revision != revision) conflict("目录已被修改，请保留编辑并重新读取")
    }
    private fun persist(old: BondCatalog, next: BondCatalog): BondCatalog {
        if (next.identities.size > BondRules.MAX_RECORDS ||
            mapper.writeValueAsBytes(next).size > 12 * 1024 * 1024
        ) {
            invalid("目录含历史身份最多5000条、12MiB")
        }
        val value = next.copy(revision = old.revision + 1)
        if (old.revision == 0L) {
            try {
                repository.insert(value)
            } catch (_: DuplicateKeyException) {
                conflict("目录版本冲突，未覆盖修改")
            }
        } else if (!repository.replace(value, old.revision)) {
            conflict("目录版本冲突，未覆盖修改")
        }
        return value
    }
}
