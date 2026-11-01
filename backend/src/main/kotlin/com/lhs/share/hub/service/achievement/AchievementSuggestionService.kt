package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionAcceptRequest
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionRejectRequest
import com.lhs.share.hub.controller.achievement.request.AchievementSuggestionSubmitRequest
import com.lhs.share.hub.controller.achievement.response.AchievementSuggestionOptions
import com.lhs.share.hub.controller.achievement.response.AchievementSuggestionPage
import com.lhs.share.hub.controller.achievement.response.AchievementSuggestionResponse
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.AchievementSuggestionRepository
import com.lhs.share.hub.repository.entity.AchievementCandidate
import com.lhs.share.hub.repository.entity.AchievementSuggestion
import com.lhs.share.hub.repository.entity.AchievementSuggestionStatus
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.net.URI
import java.time.Instant
import java.util.UUID

object AchievementSuggestionValidation {
    fun candidate(value: AchievementCandidate, catalog: CatalogContent) {
        if (value.game != catalog.game ||
            catalog.categories.none { it.categoryId == value.categoryId && it.enabled }
        ) {
            invalid("请选择该游戏启用中的分类")
        }
        if (value.name.isBlank()) invalid("成就名称必填")
        val errors = AchievementCatalogRules.errors(
            catalog.copy(entries = listOf(value.entry("yh_candidate", 0)), retiredIds = emptySet()),
            false,
        )
        if (errors.isNotEmpty()) invalid(errors.joinToString("；"))
    }
}

@Service
class AchievementSuggestionService(
    private val repository: AchievementSuggestionRepository,
    private val catalogs: AchievementCatalogRepository,
    private val admin: AchievementCatalogAdminService,
    private val authorization: AdminAuthorizationService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun options(game: String): AchievementSuggestionOptions {
        requireGame(game)
        val published = catalogs.published(game) ?: notReady()
        return AchievementSuggestionOptions(
            published.content.publicCatalog(published.version),
            published.content.rewardItems.filter { item ->
                game in item.games && published.content.entries.any { entry ->
                    entry.achievementId !in published.content.retiredIds && entry.rewards.orEmpty().any { it.itemKey == item.itemKey }
                }
            },
        )
    }

    fun reviewOptions(actor: String, game: String): CatalogAdminView {
        requireEditor(actor)
        requireGame(game)
        val value = catalogs.find(game) ?: notReady()
        return CatalogAdminView(
            value.revision,
            value.published,
            value.draft,
            value.history,
            value.compatibilityIssues,
            value.draft.rewardItems,
        )
    }

    fun submit(actor: String, request: AchievementSuggestionSubmitRequest): AchievementSuggestionResponse {
        if (!Regex("[A-Za-z0-9_-]{1,128}").matches(request.clientRequestId)) invalid("client_request_id 须为1至128位字母、数字、下划线或短横线")
        val source = source(request.sourceUrl)
        val note = note(request.submissionNote)
        requireGame(request.candidate.game)
        fun reuse(existing: AchievementSuggestion): AchievementSuggestionResponse {
            if (existing.original != request.candidate || existing.sourceUrl != source ||
                existing.submissionNote != note
            ) {
                conflict("同一请求标识的资料不同，请使用新的提交标识")
            }
            return response(existing)
        }
        // Completed submissions remain retryable even if their original category was later disabled.
        repository.findRequest(actor, request.clientRequestId)?.let { return reuse(it) }
        AchievementSuggestionValidation.candidate(request.candidate, catalogs.published(request.candidate.game)?.content ?: notReady())
        val value =
            AchievementSuggestion(
                "achs_${UUID.randomUUID()}",
                actor,
                request.clientRequestId,
                Instant.now(),
                request.candidate,
                source,
                note,
            )
        return try {
            response(repository.insert(value))
        } catch (e: DuplicateKeyException) {
            reuse(repository.findRequest(actor, request.clientRequestId) ?: throw e)
        }
    }

    fun detail(actor: String, id: String): AchievementSuggestionResponse {
        val value = find(id)
        if (value.submitterId != actor) notFound()
        return response(value)
    }
    fun mine(actor: String, status: String?, page: Int, size: Int) = list(actor, status, null, page, size)
    fun queue(actor: String, status: String?, game: String?, page: Int, size: Int): AchievementSuggestionPage {
        requireEditor(actor)
        return list(null, status, game, page, size)
    }
    fun adminDetail(actor: String, id: String): AchievementSuggestionResponse {
        requireEditor(actor)
        return response(find(id))
    }
    private fun list(actor: String?, status: String?, game: String?, page: Int, size: Int): AchievementSuggestionPage {
        if (page < 1 || size !in 1..100) invalid("page须大于0，page_size须为1至100")
        game?.let(::requireGame)
        val filter = status?.let { s -> AchievementSuggestionStatus.entries.find { it.name == s } ?: invalid("不支持的投稿状态") }
        val (items, total) = repository.list(actor, filter, game, page, size)
        val published = items.filter { it.achievementId != null }.map { it.original.game }.distinct().associateWith(::publishedIds)
        return AchievementSuggestionPage(
            items.map { value ->
                AchievementSuggestionResponse(value, value.achievementId?.let { published[value.original.game]?.contains(it) })
            },
            total,
            page,
            size,
        )
    }

    fun accept(actor: String, id: String, request: AchievementSuggestionAcceptRequest): AchievementSuggestionResponse {
        requireEditor(actor)
        version(request.expectedVersion)
        version(request.expectedCatalogRevision)
        val current = find(id)
        if (current.status == AchievementSuggestionStatus.ACCEPTED) return response(current)
        pending(current, request.expectedVersion)
        if (request.candidate.game != current.original.game) invalid("审核不能改变投稿游戏")
        val note = note(request.reviewNote)
        val accepted = try {
            transactions.execute {
                val value = find(id)
                if (value.status == AchievementSuggestionStatus.ACCEPTED) return@execute value
                pending(value, request.expectedVersion)
                if (!repository.lockPending(id, request.expectedVersion)) conflict("投稿版本冲突，请保留修正并刷新状态")
                val entry = admin.appendReviewedEntry(request.candidate, request.expectedCatalogRevision)
                repository.accept(id, request.expectedVersion + 1, actor, note, entry) ?: conflict("投稿版本冲突")
            } ?: error("Acceptance transaction returned no result")
        } catch (error: RuntimeException) {
            val competition =
                error is InventoryApiException && error.status == HttpStatus.CONFLICT ||
                    generateSequence<Throwable>(error) { it.cause }.any {
                        it is MongoException &&
                            (
                                it.code == 112 || it.code == 251 || it.hasErrorLabel("TransientTransactionError") ||
                                    it.hasErrorLabel("UnknownTransactionCommitResult")
                                )
                    }
            if (!competition) throw error
            val result = repository.find(id)
            if (result?.status == AchievementSuggestionStatus.ACCEPTED) return response(result)
            conflict("投稿或目录版本冲突，请保留修正并刷新状态")
        }
        return response(accepted)
    }

    fun reject(actor: String, id: String, request: AchievementSuggestionRejectRequest): AchievementSuggestionResponse {
        requireEditor(actor)
        version(request.expectedVersion)
        val reason = note(request.reviewNote) ?: invalid("不采纳原因必填")
        pending(find(id), request.expectedVersion)
        return response(repository.reject(id, request.expectedVersion, actor, reason) ?: conflict("投稿状态或版本已改变"))
    }
    fun requireEditor(actor: String) {
        if (!authorization.hasPermission(actor, AdminPermission.ACHIEVEMENT_CATALOG_WRITE)) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "achievement_suggestion_forbidden", "需要成就目录管理权限")
        }
    }
    private fun response(value: AchievementSuggestion): AchievementSuggestionResponse = AchievementSuggestionResponse(
        value,
        value.achievementId?.let { publishedIds(value.original.game)?.contains(it) },
    )
    private fun publishedIds(game: String): Set<String>? = catalogs.published(game)?.let {
        it.content.publicCatalog(it.version).entries.map { entry -> entry.achievementId }.toSet()
    }
    private fun find(id: String) = repository.find(id) ?: notFound()
    private fun pending(value: AchievementSuggestion, version: Long) {
        if (value.status != AchievementSuggestionStatus.PENDING || value.version != version) conflict("投稿状态或版本已改变，请保留修正并刷新状态")
    }
    private fun version(value: Long) {
        if (value !in 0 until Long.MAX_VALUE) invalid("版本须为非负整数")
    }
    private fun requireGame(game: String) {
        if (game !in SubAccountService.SUPPORTED_GAMES) invalid("不支持的游戏")
    }
    private fun note(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }?.also {
        if (it.length >
            1000
        ) {
            invalid("说明最多1000字")
        }
    }
    private fun source(value: String): String {
        val text = value.trim()
        val uri = try {
            URI(text)
        } catch (_: java.net.URISyntaxException) {
            invalid("来源链接无效")
        }
        if (text.length > 2048 || uri.scheme?.lowercase() !in setOf("http", "https") ||
            uri.host.isNullOrBlank()
        ) {
            invalid("来源须为不超过2048字符的http/https链接")
        }
        return text
    }
    private fun notReady(): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "achievement_catalog_not_ready", "目录尚未就绪，请联系维护者")
    private fun notFound(): Nothing = throw InventoryApiException(HttpStatus.NOT_FOUND, "achievement_suggestion_not_found", "投稿不存在")
    private fun conflict(message: String): Nothing =
        throw InventoryApiException(HttpStatus.CONFLICT, "achievement_suggestion_conflict", message)
}
