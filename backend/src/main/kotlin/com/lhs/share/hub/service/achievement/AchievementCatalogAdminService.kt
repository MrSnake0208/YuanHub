package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Only administrative data is returned here; never include an achievement archive.
data class CatalogAdminView(
    val revision: Long,
    val published: CatalogPublication,
    val draft: CatalogContent,
    val history: List<CatalogPublication>,
    val compatibilityIssues: List<String> = emptyList(),
    val rewardItems: List<com.lhs.share.hub.controller.achievement.response.AchievementRewardItem> = emptyList(),
)
data class CatalogChange(val achievementId: String, val name: String, val kind: String)
data class CatalogPublishPreview(
    val expectedRevision: Long,
    val changes: List<CatalogChange>,
    val categoryChanges: List<String>,
    val errors: List<String>,
    val progressChanges: List<String>,
    val restoredFrom: String? = null,
    val settingsChanged: Boolean = false,
)
data class CatalogImportItem(val index: Int, val achievementId: String?, val outcome: String, val message: String)
data class CatalogImportPreview(
    val expectedRevision: Long,
    val strategy: String,
    val items: List<CatalogImportItem>,
    val previewToken: String,
)

@Service
class AchievementCatalogAdminService(
    private val catalog: AchievementCatalogService,
    private val repository: AchievementCatalogRepository,
    private val mapper: ObjectMapper,
) {
    private data class PendingImport(
        val actor: String,
        val game: String,
        val revision: Long,
        val strategy: String,
        val document: JsonNode,
        val expires: Instant,
    )
    private val imports = ConcurrentHashMap<String, PendingImport>()

    fun read(game: String) = view(catalog.load(game))
    fun legacyExport(game: String) = repository.raw(game) ?: invalid("目录不存在")

    fun save(game: String, revision: Long, content: CatalogContent): CatalogAdminView {
        val current = current(game, revision)
        if (content.game != game) invalid("草稿游戏不匹配")
        if (content.entries.any { it.achievementId !in current.issuedIds } ||
            content.categories.any { it.categoryId !in current.categoryIds }
        ) {
            invalid("新成就和分类必须使用系统生成的 ID；批量新增请省略 ID")
        }
        if (content.entries.any {
                it.achievementId in current.identities &&
                    current.draft.entries.none { old -> old.achievementId == it.achievementId }
            }
        ) {
            invalid("历史 ID 不得重新分配；恢复原资料请使用历史回滚")
        }
        validate(content, false)
        return persist(current, current.copy(draft = withCoverage(content.copy(catalogVersion = ""))))
    }

    fun addEntry(game: String, revision: Long, categoryId: String): CatalogAdminView {
        val current = current(game, revision)
        if (current.draft.categories.none { it.categoryId == categoryId && it.enabled }) invalid("请先选择启用中的分类")
        val id = newId(game)
        val entry = AchievementEntry(id, game, categoryId, "", "", current.draft.entries.size)
        val next = current.copy(draft = current.draft.copy(entries = current.draft.entries + entry), issuedIds = current.issuedIds + id)
        validate(next.draft, false)
        return persist(current, next)
    }

    /** Called by suggestion acceptance inside the Hub transaction; one complete entry, one CAS. */
    fun appendReviewedEntry(candidate: com.lhs.share.hub.repository.entity.AchievementCandidate, revision: Long): AchievementEntry {
        val current = current(candidate.game, revision)
        AchievementSuggestionValidation.candidate(candidate, current.draft)
        val entry = candidate.entry(newId(candidate.game), current.draft.entries.size)
        val next = current.copy(
            draft = withCoverage(current.draft.copy(entries = current.draft.entries + entry, catalogVersion = "")),
            issuedIds = current.issuedIds + entry.achievementId,
        )
        validate(next.draft, false)
        persist(current, next)
        return entry
    }

    fun addCategory(game: String, revision: Long, name: String): CatalogAdminView {
        val current = current(game, revision)
        val id = "cat_${UUID.randomUUID().toString().replace("-", "")}"
        val next = current.copy(
            draft = current.draft.copy(categories = current.draft.categories + CatalogCategory(id, name, current.draft.categories.size)),
            categoryIds = current.categoryIds + id,
        )
        validate(next.draft, false)
        return persist(current, next)
    }

    fun discard(game: String, revision: Long): CatalogAdminView {
        val current = current(game, revision)
        return persist(current, current.copy(draft = current.published.content))
    }

    fun preview(game: String, revision: Long, restore: String? = null): CatalogPublishPreview {
        val current = current(game, revision)
        val content = candidate(current, restore)
        val before = current.published.content.publicCatalog(current.published.version).entries.associateBy { it.achievementId }
        val after = content.publicCatalog("").entries.associateBy { it.achievementId }
        val changes = (before.keys + after.keys).mapNotNull { id ->
            val old = before[id]
            val next = after[id]
            val kind = when {
                old == null -> "add"
                next == null -> "retire"
                old != next -> "update"
                else -> null
            }
            kind?.let { CatalogChange(id, next?.name ?: old!!.name, it) }
        }
        val oldCategories = current.published.content.categories.associateBy { it.categoryId }
        val newCategories = content.categories.associateBy { it.categoryId }
        fun categoryDescription(c: CatalogCategory?) = c?.let { "${it.name}（顺序${it.sort}，${if (it.enabled) "启用" else "停用"}）" } ?: "未收录"
        val categoryChanges = (oldCategories.keys + newCategories.keys).mapNotNull { id ->
            if (oldCategories[id] == newCategories[id]) {
                null
            } else {
                "$id：${categoryDescription(oldCategories[id])} → ${categoryDescription(newCategories[id])}"
            }
        }
        val compatibility = AchievementCatalogRules.compatibility(content, current.identities)
        val progress = content.entries.mapNotNull { e ->
            val old = current.identities[e.achievementId]
            if (old != null && old.target != e.target) {
                "${e.achievementId}：${old.target} → ${e.target}"
            } else {
                null
            }
        }
        return CatalogPublishPreview(
            revision,
            changes,
            categoryChanges,
            AchievementCatalogRules.errors(content, true) + compatibility,
            progress,
            restore,
            content.rewardItems != current.published.content.rewardItems ||
                content.pointTracks != current.published.content.pointTracks ||
                content.rewardFilterKeys != current.published.content.rewardFilterKeys,
        )
    }

    fun publish(game: String, revision: Long, actor: String, restore: String? = null): CatalogAdminView {
        val current = current(game, revision)
        val content = candidate(current, restore)
        validate(content, true)
        val errors = AchievementCatalogRules.compatibility(content, current.identities)
        if (errors.isNotEmpty()) invalid(errors.joinToString("；"))
        val publication = CatalogPublication(
            "catalog-${revision + 1}-${UUID.randomUUID()}",
            content,
            Instant.now().truncatedTo(ChronoUnit.MILLIS),
            actor,
            restore,
        )
        return persist(
            current,
            current.copy(
                published = publication,
                draft = content,
                history = (listOf(current.published) + current.history).take(5),
                identities =
                current.identities + content.entries.filter { it.achievementId !in content.retiredIds }.associateBy { it.achievementId },
            ),
        )
    }

    private fun candidate(current: AchievementCatalog, restore: String?): CatalogContent {
        if (restore == null) return withCoverage(current.draft)
        if (current.draft != current.published.content) conflict("存在未发布草稿；请先导出保留并明确放弃草稿后再回滚")
        return withCoverage(current.history.firstOrNull { it.version == restore }?.content ?: invalid("历史版本不存在或已超出保留范围"))
    }

    private fun withCoverage(content: CatalogContent): CatalogContent {
        val empty = content.entries.none { it.achievementId !in content.retiredIds }
        val status = when {
            empty -> "empty"
            content.dataStatus == "empty" -> "partial"
            else -> content.dataStatus
        }
        val coverage = if (content.coverage.isBlank() || status != content.dataStatus) {
            if (empty) "当前目录暂无成就。" else "当前收录的成就资料。"
        } else {
            content.coverage
        }
        return content.copy(dataStatus = status, coverage = coverage)
    }

    fun importPreview(game: String, revision: Long, actor: String, document: JsonNode, strategy: String): CatalogImportPreview {
        val current = current(game, revision)
        val plan = importPlan(current, document, strategy)
        imports.entries.removeIf { it.value.expires.isBefore(Instant.now()) }
        if (imports.size >= 100) invalid("导入预览过多，请稍后重试")
        val token = UUID.randomUUID().toString()
        imports[token] = PendingImport(actor, game, revision, strategy, document.deepCopy(), Instant.now().plusSeconds(900))
        return CatalogImportPreview(revision, strategy, plan.second, token)
    }

    fun importConfirm(game: String, revision: Long, actor: String, document: JsonNode, strategy: String, token: String): CatalogAdminView {
        val pending = imports[token] ?: conflict("导入预览已失效，请重新预览")
        if (pending.actor != actor || pending.game != game || pending.revision != revision || pending.strategy != strategy ||
            pending.document != document || pending.expires.isBefore(Instant.now())
        ) {
            conflict("预览与当前导入不一致，请重新预览")
        }
        val current = current(game, revision)
        val (content, items) = importPlan(current, document, strategy)
        if (items.any { it.outcome == "invalid" }) invalid("导入存在非法条目；未写入任何数据")
        validate(content, false)
        val result = persist(
            current,
            current.copy(
                draft = content,
                issuedIds = current.issuedIds + content.entries.map { it.achievementId },
                categoryIds = current.categoryIds + content.categories.map { it.categoryId },
            ),
        )
        imports.remove(token)
        return result
    }

    private fun importPlan(
        current: AchievementCatalog,
        document: JsonNode,
        strategy: String,
    ): Pair<CatalogContent, List<CatalogImportItem>> {
        if (strategy !in setOf("keep", "update")) invalid("strategy 只允许 keep 或 update")
        val data = if (document.has("format")) {
            if (document.path("format").asText() != "yuanhub-achievement-catalog" ||
                !document.path("schema_version").isIntegralNumber || !document.path("schema_version").canConvertToInt() ||
                document.path("schema_version").intValue() != 1
            ) {
                invalid("不支持的目录导入格式")
            }
            document.path("catalog")
        } else {
            document
        }
        if (!data.isObject || data.path("game").asText() != current.game) invalid("导入目录的目标游戏不匹配")
        val rows =
            data["entries"]?.takeIf { it.isArray && it.size() <= AchievementCatalogRules.MAX_ENTRIES } ?: invalid("entries 必须是最多5000条的数组")
        val categoryRows = data["categories"]?.takeIf { it.isArray && it.size() <= 100 } ?: invalid("categories 必须是最多100项的数组")
        val categories = current.draft.categories.associateBy { it.categoryId }.toMutableMap()
        val items = mutableListOf<CatalogImportItem>()
        val categoryMap = mutableMapOf<String, String>()
        val seenCategories = mutableSetOf<String>()
        categoryRows.forEachIndexed { index, row ->
            try {
                val c = AchievementCatalogDecoder.category(row, mapper)
                if (!seenCategories.add(c.categoryId)) invalid("分类 ID 重复")
                val old = categories[c.categoryId]
                when {
                    old != null -> {
                        categoryMap[c.categoryId] = c.categoryId
                        if (old != c) items += CatalogImportItem(-index - 1, c.categoryId, "conflict", "分类变更：${c.name}")
                        if (strategy == "update") categories[c.categoryId] = c
                    }
                    c.categoryId in current.categoryIds || c.categoryId.startsWith("cat_") ->
                        items +=
                            CatalogImportItem(-index - 1, c.categoryId, "unmatched", "历史分类 ID 不复用")
                    else -> {
                        val id = "cat_${UUID.randomUUID().toString().replace("-", "")}"
                        categories[id] = c.copy(categoryId = id)
                        categoryMap[c.categoryId] = id
                        items += CatalogImportItem(-index - 1, c.categoryId, "add", "新增分类：${c.name}；由系统分配稳定 ID")
                    }
                }
            } catch (e: InventoryApiException) {
                items += CatalogImportItem(-index - 1, null, "invalid", e.message)
            }
        }
        val settingsNode = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(
            current.draft.copy(categories = categories.values.toList(), entries = emptyList()),
        )
        for (field in listOf("reward_items", "point_tracks", "reward_filter_keys")) {
            if (data.has(field) && (strategy == "update" || settingsNode.path(field).isEmpty)) {
                settingsNode.set<JsonNode>(field, data[field].deepCopy())
            }
        }
        settingsNode.path("point_tracks").forEach { track ->
            if (track is com.fasterxml.jackson.databind.node.ObjectNode) {
                categoryMap[track.path("category_id").asText()]?.let { track.put("category_id", it) }
            }
        }
        val settings = AchievementCatalogDecoder.content(settingsNode, mapper)
        val entries = current.draft.entries.associateBy { it.achievementId }.toMutableMap()
        val seen = mutableSetOf<String>()
        rows.forEachIndexed { index, row ->
            val supplied = row.path("achievement_id").takeIf { it.isTextual && it.asText().isNotBlank() }?.asText()
            try {
                if (!row.isObject) invalid("成就必须是对象")
                if (row.has("achievement_id") && !row.path("achievement_id").isTextual) invalid("achievement_id 必须是文本或省略")
                if (supplied != null && !seen.add(supplied)) invalid("文件中存在重复 ID")
                val node = row.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
                val id = supplied ?: newId(current.game)
                node.put("achievement_id", id)
                if (!node.has("condition")) node.put("condition", "")
                if (!node.has("sort")) node.put("sort", index)
                val parsed = AchievementCatalogDecoder.entry(node, mapper)
                val entry = parsed.copy(categoryId = categoryMap[parsed.categoryId] ?: parsed.categoryId)
                validate(
                    settings.copy(entries = listOf(entry), retiredIds = emptySet()),
                    false,
                )
                if (supplied != null && supplied !in entries) {
                    items += CatalogImportItem(index, supplied, "unmatched", "未知或历史 ID，不按名称合并；新建请省略 achievement_id")
                } else {
                    val old = entries[id]
                    val outcome = when {
                        old == null -> "add"
                        old == entry -> "same"
                        else -> "conflict"
                    }
                    if (old == null || strategy == "update" && outcome == "conflict") {
                        entries[id] = entry
                    }
                    items += CatalogImportItem(
                        index,
                        supplied,
                        outcome,
                        when (outcome) {
                            "add" -> "新增成就草稿（系统发号）"
                            "same" -> "无变化"
                            else -> "资料冲突；${if (strategy == "keep") "保留当前" else "更新草稿"}"
                        },
                    )
                }
            } catch (e: InventoryApiException) {
                items += CatalogImportItem(index, supplied, "invalid", e.message)
            }
        }
        val content = withCoverage(settings.copy(entries = entries.values.toList()))
        AchievementCatalogRules.errors(content, false).forEach { items += CatalogImportItem(-101, null, "invalid", it) }
        return content to items
    }

    private fun validate(content: CatalogContent, publishing: Boolean) {
        val errors = AchievementCatalogRules.errors(content, publishing)
        if (errors.isNotEmpty()) invalid(errors.joinToString("；"))
    }
    private fun current(game: String, revision: Long) = catalog.load(game).also {
        if (it.compatibilityIssues.isNotEmpty()) conflict("旧目录需要离线核对，未写入任何内容：" + it.compatibilityIssues.take(5).joinToString("；"))
        if (it.revision !=
            revision
        ) {
            conflict("目录已被其他管理员修改，请保留本地编辑并重新读取")
        }
    }
    private fun persist(old: AchievementCatalog, next: AchievementCatalog): CatalogAdminView {
        val retained =
            next.identities.keys + next.draft.entries.map { it.achievementId } + next.published.content.entries.map { it.achievementId } +
                next.history.flatMap { snapshot -> snapshot.content.entries.map { it.achievementId } }
        if (retained.size > AchievementCatalogRules.MAX_ENTRIES) invalid("目录含历史身份最多5000条，请保留原系统ID；不会按名称合并")
        val value = next.copy(revision = old.revision + 1)
        if (mapper.writeValueAsBytes(value).size > AchievementCatalogRules.MAX_DOCUMENT_BYTES) invalid("目录和历史超过12MiB安全上限，请减少长文本")
        if (!repository.replace(value, old.revision)) {
            if (old.revision != 0L) conflict("目录版本冲突，未覆盖其他管理员的修改")
            try {
                repository.insert(value)
            } catch (_: DuplicateKeyException) {
                conflict("目录版本冲突，未覆盖其他管理员的修改")
            }
        }
        return view(value)
    }
    private fun view(value: AchievementCatalog) =
        CatalogAdminView(value.revision, value.published, value.draft, value.history, value.compatibilityIssues, value.draft.rewardItems)
    private fun newId(game: String) = "yh_${if (game == "代号鸢") "dhy" else "ry"}_${UUID.randomUUID().toString().replace("-", "")}"
    private fun conflict(message: String): Nothing =
        throw InventoryApiException(HttpStatus.CONFLICT, "achievement_catalog_conflict", message)
}
