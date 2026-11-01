package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackCategoryCatalogRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackCategoryCatalog
import com.lhs.share.hub.repository.entity.FeedbackSpace
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.util.Locale
import java.util.UUID

@Service
class FeedbackCategoryService(private val repository: FeedbackCategoryCatalogRepository) {
    fun list(): List<FeedbackCategory> = snapshot().categories

    fun keys(): Set<String> = list().mapTo(linkedSetOf()) { it.key }

    fun spaces(): List<FeedbackSpace> = snapshot().spaces

    fun requireSpace(id: String, forSubmission: Boolean = false): FeedbackSpace {
        val space = spaces().find { it.id == id }
            ?: throw ApiResultException(404, "反馈专区不存在")
        if (forSubmission && !space.active) throw ApiResultException(409, "该反馈专区已停用，仍可查看历史反馈")
        return space
    }

    fun inSpace(spaceId: String): List<FeedbackCategory> = list().filter { it.spaceId == spaceId }

    fun requireInSpace(key: String, spaceId: String): String {
        val normalized = requireValid(key)
        if (list().none { it.key == normalized && it.spaceId == spaceId }) {
            throw ApiResultException(400, "反馈板块不属于当前专区")
        }
        return normalized
    }

    fun createSpace(id: String, label: String): FeedbackSpace {
        if (!id.matches(Regex("[a-z][a-z0-9-]{1,39}")) || id == FeedbackSpaces.ALL) {
            throw ApiResultException(400, "专区标识需为 2–40 位小写字母、数字或连字符，并以字母开头")
        }
        val current = snapshot()
        if (current.spaces.any { it.id == id }) throw ApiResultException(409, "专区标识已存在")
        val space = FeedbackSpace(id, validateSpaceLabel(label, current.spaces))
        val category =
            FeedbackCategory("CUSTOM_${UUID.randomUUID().toString().replace("-", "").uppercase(Locale.ROOT)}", "其他问题", spaceId = id)
        save(current.copy(spaces = current.spaces + space, categories = current.categories + category))
        return space
    }

    fun updateSpace(id: String, label: String, active: Boolean): FeedbackSpace {
        val current = snapshot()
        requireSpace(id)
        if (id == FeedbackSpaces.DEFAULT && !active) throw ApiResultException(400, "YuanHub 默认专区不能停用")
        val space = FeedbackSpace(id, validateSpaceLabel(label, current.spaces.filterNot { it.id == id }), active)
        save(current.copy(spaces = current.spaces.map { if (it.id == id) space else it }))
        return space
    }

    private fun validateSpaceLabel(label: String, others: List<FeedbackSpace>): String {
        val value = label.trim()
        if (value.isEmpty() || value.length > 24) throw ApiResultException(400, "专区名称需为 1–24 个字符")
        if (others.any { it.label.equals(value, ignoreCase = true) }) throw ApiResultException(409, "专区名称已存在")
        return value
    }

    fun label(key: String): String? = list().find { it.key == key }?.label

    fun requireValid(key: String): String {
        val normalized = key.trim().uppercase(Locale.ROOT)
        if (normalized !in keys()) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的反馈板块: $key")
        return normalized
    }

    fun create(label: String, spaceId: String = FeedbackSpaces.DEFAULT): FeedbackCategory {
        requireSpace(spaceId)
        val current = snapshot()
        val normalized = validateLabel(label, current.categories.filter { it.spaceId == spaceId })
        val category =
            FeedbackCategory(
                "CUSTOM_${UUID.randomUUID().toString().replace("-", "").uppercase(Locale.ROOT)}",
                normalized,
                spaceId = spaceId,
            )
        save(current.copy(categories = current.categories + category))
        return category
    }

    fun rename(key: String, label: String): Pair<FeedbackCategory, FeedbackCategory> {
        val current = snapshot()
        val existing = current.categories.find { it.key == key }
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "反馈板块不存在: $key")
        val normalized = validateLabel(label, current.categories.filter { it.key != key && it.spaceId == existing.spaceId })
        val renamed = existing.copy(label = normalized)
        if (renamed != existing) save(current.copy(categories = current.categories.map { if (it.key == key) renamed else it }))
        return existing to renamed
    }

    fun setHidden(key: String, hidden: Boolean): Pair<FeedbackCategory, FeedbackCategory> {
        val current = snapshot()
        val existing = current.categories.find { it.key == key }
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "反馈板块不存在: $key")
        val updated = existing.copy(hidden = hidden)
        if (updated != existing) save(current.copy(categories = current.categories.map { if (it.key == key) updated else it }))
        return existing to updated
    }

    fun reorder(
        keys: List<String>,
        expectedKeys: List<String>,
        spaceId: String? = null,
    ): Pair<List<FeedbackCategory>, List<FeedbackCategory>> {
        val current = snapshot()
        val selected = current.categories.filter { spaceId == null || it.spaceId == spaceId }
        val currentKeys = selected.map { it.key }
        if (expectedKeys != currentKeys) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "反馈板块顺序已更新，请刷新后重试")
        }
        if (keys.size != currentKeys.size || keys.toSet().size != keys.size || keys.toSet() != currentKeys.toSet()) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "排序必须包含全部反馈板块且不能重复")
        }
        val byKey = current.categories.associateBy { it.key }
        val reordered = keys.map { byKey.getValue(it) }
        if (keys != currentKeys) {
            val iterator = reordered.iterator()
            save(
                current.copy(
                    categories = current.categories.map {
                        if (spaceId == null ||
                            it.spaceId == spaceId
                        ) {
                            iterator.next()
                        } else {
                            it
                        }
                    },
                ),
            )
        }
        return selected to reordered
    }

    private fun snapshot(): FeedbackCategoryCatalog {
        val current = repository.findById("feedback").orElseGet {
            FeedbackCategoryCatalog(categories = FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) })
        }
        // 只补缺失日历；复用已建同名板块，不改历史标识、授权，也不在读取时写库。
        val defaults = current.categories.filter { it.spaceId == FeedbackSpaces.DEFAULT }
        val calendar = defaults.find { it.key == FeedbackArea.CALENDAR || it.builtinKey == FeedbackArea.CALENDAR }
            ?: defaults.find { it.label.trim() == FeedbackArea.labels.getValue(FeedbackArea.CALENDAR) }
        if (calendar != null) {
            if (calendar.key == FeedbackArea.CALENDAR || calendar.builtinKey == FeedbackArea.CALENDAR) return current
            val registered = calendar.copy(builtinKey = FeedbackArea.CALENDAR)
            return current.copy(categories = current.categories.map { if (it == calendar) registered else it })
        }
        val added = FeedbackCategory(FeedbackArea.CALENDAR, FeedbackArea.labels.getValue(FeedbackArea.CALENDAR))
        return current.copy(categories = current.categories + added)
    }

    private fun validateLabel(label: String, others: List<FeedbackCategory>): String {
        val normalized = label.trim()
        if (normalized.isEmpty() || normalized.length > 24) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "反馈板块名称需为 1–24 个字符")
        }
        if (others.any { it.label.lowercase(Locale.ROOT) == normalized.lowercase(Locale.ROOT) }) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "反馈板块名称已存在")
        }
        return normalized
    }

    private fun save(catalog: FeedbackCategoryCatalog) {
        try {
            repository.save(catalog)
        } catch (e: OptimisticLockingFailureException) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "反馈板块目录已更新，请刷新后重试")
        } catch (e: DuplicateKeyException) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "反馈板块目录已更新，请刷新后重试")
        }
    }
}
