package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.response.PublicFeedbackDetail
import com.lhs.share.hub.controller.report.response.PublicFeedbackListItem
import com.lhs.share.hub.controller.report.response.PublicFeedbackPage
import com.lhs.share.hub.repository.FeedbackSupportRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.FeedbackSupport
import com.lhs.share.hub.repository.entity.FeedbackTicket
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.SecureRandom

/**
 * 公开反馈服务:反馈广场列表/详情、提交前相似查重、支持与取消支持。
 *
 * 隐私约束:所有公开查询在数据库层强制 visibility=PUBLIC;PRIVATE 工单对外表现为"不存在"(404),
 * 不泄露标题、正文或存在性。历史工单缺少 visibility 字段时按 PRIVATE 处理。
 */
@Service
class FeedbackPublicService(
    private val ticketRepository: FeedbackTicketRepository,
    private val queryRepository: FeedbackTicketQueryRepository,
    private val supportRepository: FeedbackSupportRepository,
    private val categories: FeedbackCategoryService,
) {
    private val random = SecureRandom()

    companion object {
        private const val MAX_PAGE_SIZE = 50
        private const val DEFAULT_SIMILAR_LIMIT = 5
        private const val MAX_SIMILAR_LIMIT = 5
        private const val SIMILAR_CANDIDATE_LIMIT = 40
        private const val MAX_SIMILAR_TOKENS = 12
        private const val MIN_SIMILAR_TITLE_LENGTH = 2
        private const val MAX_MERGE_HOPS = 50
        private val VALID_SORTS = setOf("hot", "latest", "updated")
    }

    fun list(
        currentUserId: String?,
        page: Int,
        pageSize: Int,
        type: String?,
        status: String?,
        keyword: String?,
        completedVersionId: String?,
        sort: String,
        spaceId: String = FeedbackSpaces.DEFAULT,
    ): PublicFeedbackPage {
        categories.requireSpace(spaceId)
        if (page < 1) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "page 必须大于等于 1")
        }
        if (pageSize !in 1..MAX_PAGE_SIZE) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "pageSize 必须在 1..$MAX_PAGE_SIZE 之间")
        }
        val normalizedSort = sort.trim().lowercase().ifEmpty { "latest" }
        if (normalizedSort !in VALID_SORTS) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的排序: $sort, 可选: $VALID_SORTS")
        }
        val normalizedType = normalizeTypeFilter(type)
        val normalizedStatus = PublicFeedbackStatus.normalizeOrNull(status)

        val result = queryRepository.publicSearch(
            type = normalizedType,
            publicStatus = normalizedStatus,
            keyword = keyword?.trim()?.takeIf { it.isNotEmpty() },
            completedVersionId = completedVersionId?.trim()?.takeIf { it.isNotEmpty() },
            sort = normalizedSort,
            pageable = PageRequest.of(page - 1, pageSize),
            spaceId = spaceId,
        )
        val supported = supportedIds(currentUserId, result.content.mapNotNull { it.id })
        return PublicFeedbackPage(
            items = toListItems(result.content, supported),
            total = result.totalElements,
            page = page,
            pageSize = pageSize,
        )
    }

    fun getById(currentUserId: String?, ticketId: String, spaceId: String? = null): PublicFeedbackDetail {
        val ticket = requirePublicTicket(ticketId)
        if (spaceId != null && FeedbackSpaces.id(ticket) != spaceId) throw ApiResultException(404, "反馈不存在")
        return toDetail(ticket, currentUserId)
    }

    /**
     * 相似反馈提示。只搜索 PUBLIC 且未合并的反馈,最多返回 limit 条;仅作提示,不阻断提交。
     */
    fun similar(
        currentUserId: String?,
        title: String,
        type: String?,
        limit: Int?,
        spaceId: String = FeedbackSpaces.DEFAULT,
    ): List<PublicFeedbackListItem> {
        categories.requireSpace(spaceId)
        val effectiveLength = title.count { it.isLetterOrDigit() || it.code in 0x4E00..0x9FFF }
        if (effectiveLength < MIN_SIMILAR_TITLE_LENGTH) return emptyList()
        val tokens = tokenize(title)
        if (tokens.isEmpty()) return emptyList()
        val normalizedType = normalizeTypeFilter(type)
        val take = (limit ?: DEFAULT_SIMILAR_LIMIT).coerceIn(1, MAX_SIMILAR_LIMIT)
        val ranked = queryRepository.searchPublicSimilar(tokens, SIMILAR_CANDIDATE_LIMIT, spaceId)
            .map { it to score(it, tokens, normalizedType) }
            .filter { it.second > 0.0 }
            .sortedWith(
                compareByDescending<Pair<FeedbackTicket, Double>> { it.second }
                    .thenByDescending { it.first.supportCount }
                    .thenByDescending { it.first.publishedAt },
            )
            .take(take)
            .map { it.first }
        val supported = supportedIds(currentUserId, ranked.mapNotNull { it.id })
        return toListItems(ranked, supported)
    }

    /** 支持;重复支持幂等,不重复加票。 */
    fun support(currentUserId: String, ticketId: String): PublicFeedbackDetail {
        val main = requirePublicMain(ticketId)
        val mainId = checkNotNull(main.id)
        var updated: FeedbackTicket? = null
        if (!supportRepository.existsByFeedbackIdAndUserId(mainId, currentUserId)) {
            try {
                supportRepository.save(FeedbackSupport(id = generateSupportId(), feedbackId = mainId, userId = currentUserId))
                updated = queryRepository.incrementSupportCount(mainId)
            } catch (_: DuplicateKeyException) {
                // 并发下已被同一用户抢先记录,视为已支持,不再加票。
            }
        }
        val refreshed = updated ?: ticketRepository.findById(mainId).orElse(main)
        return toDetail(refreshed, currentUserId)
    }

    /** 取消支持;不存在记录时不减票,计数不会为负。 */
    fun unsupport(currentUserId: String, ticketId: String): PublicFeedbackDetail {
        val main = requirePublicMain(ticketId)
        val mainId = checkNotNull(main.id)
        val deleted = supportRepository.deleteByFeedbackIdAndUserId(mainId, currentUserId)
        val updated = if (deleted > 0) queryRepository.decrementSupportCount(mainId) else null
        val refreshed = updated ?: ticketRepository.findById(mainId).orElse(main)
        return toDetail(refreshed, currentUserId)
    }

    // ========== 内部方法 ==========

    private fun isPublicTicket(ticket: FeedbackTicket): Boolean =
        FeedbackVisibility.isPublic(ticket.visibility) && !FeedbackType.isReport(ticket.type, ticket.category)

    private fun requirePublicTicket(ticketId: String): FeedbackTicket {
        val ticket = ticketRepository.findById(ticketId).orElse(null)
        if (ticket == null || !isPublicTicket(ticket)) {
            // 不区分"不存在"和"私有",避免通过公开接口探测 PRIVATE 反馈。
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "反馈不存在")
        }
        return ticket
    }

    private fun requirePublicMain(ticketId: String): FeedbackTicket {
        val ticket = requirePublicTicket(ticketId)
        val main = resolveMain(ticket)
        if (main == null || !isPublicTicket(main)) {
            throw ApiResultException(HttpStatus.NOT_FOUND.value(), "反馈不存在")
        }
        return main
    }

    /** 沿 mergedIntoId 解析最终主反馈;检测到环或断链返回 null。 */
    private fun resolveMain(ticket: FeedbackTicket): FeedbackTicket? {
        var current = ticket
        val visited = mutableSetOf<String>()
        var hops = 0
        while (true) {
            val nextId = current.mergedIntoId ?: return current
            if (hops++ >= MAX_MERGE_HOPS || !visited.add(nextId)) return null
            current = ticketRepository.findById(nextId).orElse(null) ?: return null
            if (FeedbackSpaces.id(current) != FeedbackSpaces.id(ticket)) return null
        }
    }

    private fun supportedIds(userId: String?, feedbackIds: List<String>): Set<String> {
        if (userId.isNullOrBlank() || feedbackIds.isEmpty()) return emptySet()
        return supportRepository.findByUserIdAndFeedbackIdIn(userId, feedbackIds).map { it.feedbackId }.toSet()
    }

    private fun toListItems(tickets: List<FeedbackTicket>, supported: Set<String>): List<PublicFeedbackListItem> {
        if (tickets.isEmpty()) return emptyList()
        val labels = categories.list().associate { it.key to it.label }
        return tickets.map { toListItem(it, it.id in supported, labels[FeedbackWorkflow.area(it)]) }
    }

    private fun toListItem(ticket: FeedbackTicket, supported: Boolean, categoryLabel: String?): PublicFeedbackListItem =
        PublicFeedbackListItem(
            id = checkNotNull(ticket.id),
            spaceId = FeedbackSpaces.id(ticket),
            publicTitle = ticket.publicTitle,
            publicSummary = ticket.publicSummary,
            type = publicType(ticket),
            category = FeedbackWorkflow.area(ticket),
            categoryLabel = categoryLabel,
            publicStatus = ticket.publicStatus,
            supportCount = ticket.supportCount.coerceAtLeast(0),
            supportedByCurrentUser = supported,
            publishedAt = ticket.publishedAt,
            publicUpdatedAt = ticket.publicUpdatedAt ?: ticket.publishedAt,
            targetVersionLabel = ticket.targetVersionLabel,
            completedVersionLabel = ticket.completedVersionLabel,
        )

    private fun toDetail(ticket: FeedbackTicket, currentUserId: String?): PublicFeedbackDetail {
        val mergedInto = ticket.mergedIntoId?.let { targetId ->
            val target = ticketRepository.findById(targetId).orElse(null)
            if (target == null || !isPublicTicket(target)) {
                null
            } else {
                PublicFeedbackDetail.MergedInto(id = checkNotNull(target.id), publicTitle = target.publicTitle)
            }
        }
        val supported = if (currentUserId.isNullOrBlank()) {
            false
        } else {
            supportRepository.existsByFeedbackIdAndUserId(checkNotNull(ticket.id), currentUserId)
        }
        return PublicFeedbackDetail(
            id = checkNotNull(ticket.id),
            spaceId = FeedbackSpaces.id(ticket),
            publicTitle = ticket.publicTitle,
            publicSummary = ticket.publicSummary,
            type = publicType(ticket),
            category = FeedbackWorkflow.area(ticket),
            categoryLabel = categories.label(FeedbackWorkflow.area(ticket)),
            publicStatus = ticket.publicStatus,
            supportCount = ticket.supportCount.coerceAtLeast(0),
            supportedByCurrentUser = supported,
            publishedAt = ticket.publishedAt,
            publicUpdatedAt = ticket.publicUpdatedAt ?: ticket.publishedAt,
            completedAt = ticket.completedAt,
            targetVersionLabel = ticket.targetVersionLabel,
            completedVersionLabel = ticket.completedVersionLabel,
            mergedInto = mergedInto,
        )
    }

    private fun normalizeTypeFilter(type: String?): String? {
        val normalized = type?.trim()?.uppercase()?.takeIf { it.isNotEmpty() } ?: return null
        if (normalized != FeedbackType.LEGACY_FEEDBACK && normalized !in FeedbackType.all) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的反馈类型: $type, 可选: ${FeedbackType.all}")
        }
        return normalized
    }

    /** 解析旧数据中 type=FEEDBACK、category 存放真实类型的兼容语义。 */
    private fun publicType(ticket: FeedbackTicket): String {
        val rawType = ticket.type.trim().uppercase()
        if (rawType != FeedbackType.LEGACY_FEEDBACK) return rawType
        val category = ticket.category?.trim()?.uppercase()
        return if (category != null && category in FeedbackType.all) category else FeedbackType.LEGACY_FEEDBACK
    }

    /** 关键词近似分词:拉丁/数字按连续串,CJK 按 2-gram。 */
    private fun tokenize(text: String): List<String> {
        val tokens = linkedSetOf<String>()
        val latin = StringBuilder()
        val cjk = StringBuilder()
        fun flushLatin() {
            if (latin.length >= 2) tokens += latin.toString()
            latin.setLength(0)
        }
        fun flushCjk() {
            val run = cjk.toString()
            if (run.length >= 2) {
                for (index in 0 until run.length - 1) tokens += run.substring(index, index + 2)
            }
            if (run.length in 2..4) tokens += run
            cjk.setLength(0)
        }
        for (ch in text.lowercase()) {
            when {
                ch in 'a'..'z' || ch in '0'..'9' -> {
                    flushCjk()
                    latin.append(ch)
                }
                ch.code in 0x4E00..0x9FFF -> {
                    flushLatin()
                    cjk.append(ch)
                }
                else -> {
                    flushLatin()
                    flushCjk()
                }
            }
        }
        flushLatin()
        flushCjk()
        return tokens.filter { it.length >= 2 }.take(MAX_SIMILAR_TOKENS).toList()
    }

    private fun score(ticket: FeedbackTicket, tokens: List<String>, type: String?): Double {
        val title = ticket.publicTitle.orEmpty().lowercase()
        val summary = ticket.publicSummary.orEmpty().lowercase()
        var score = 0.0
        for (token in tokens) {
            if (title.contains(token)) {
                score += 2.0
            } else if (summary.contains(token)) {
                score += 1.0
            }
        }
        if (type != null && publicType(ticket) == type) score += 1.5
        return score
    }

    private fun generateSupportId(): String {
        val bytes = ByteArray(8)
        random.nextBytes(bytes)
        val digits = "0123456789abcdef"
        val hex = bytes.joinToString("") { b ->
            val v = b.toInt() and 0xFF
            "" + digits[v shr 4] + digits[v and 0x0F]
        }
        return "sup_" + hex
    }
}
