package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.request.AchievementImportRequest
import com.lhs.share.hub.controller.achievement.response.AchievementPreviewResponse
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

@Component
class AchievementImportPreviews {
    private data class Binding(
        val userId: String,
        val accountId: String,
        val game: String,
        val revision: Long,
        val catalogVersion: String,
        val strategy: String,
        val documentDigest: String,
        val expiresAt: Instant,
    )

    // shortcut: 与现有招募预览一致，只在本进程保留10分钟；多实例上线时采用粘性路由或共享预览存储。
    private val bindings = LinkedHashMap<String, Binding>()

    @Synchronized
    fun issue(owner: SubAccount, request: AchievementImportRequest, preview: AchievementPreviewResponse): String {
        val now = Instant.now()
        bindings.entries.removeIf { !it.value.expiresAt.isAfter(now) }
        bindings.entries.removeIf { it.value.userId == owner.userId && it.value.accountId == owner.accountId }
        if (bindings.size >= 512) bindings.remove(bindings.keys.first())
        val token = "achievement_preview_${UUID.randomUUID()}"
        bindings[token] =
            Binding(
                owner.userId,
                owner.accountId,
                owner.game,
                preview.expectedRevision,
                preview.catalogVersion,
                request.strategy,
                digest(request),
                now.plusSeconds(600),
            )
        return token
    }

    @Synchronized
    fun requireMatch(owner: SubAccount, request: AchievementImportRequest) {
        val value = bindings[request.previewToken]
        if (value == null || !value.expiresAt.isAfter(Instant.now()) ||
            value.userId != owner.userId || value.accountId != owner.accountId || value.game != owner.game ||
            value.revision != request.expectedRevision || value.catalogVersion != request.catalogVersion ||
            value.strategy != request.strategy || value.documentDigest != digest(request)
        ) {
            throw InventoryApiException(HttpStatus.CONFLICT, "achievement_preview_changed", "预览过期或账号、文件、策略已变化，请重新预览")
        }
    }

    @Synchronized
    fun deleteAccount(userId: String, accountId: String) {
        bindings.entries.removeIf { it.value.userId == userId && it.value.accountId == accountId }
    }

    // 用32字节摘要替代在预览缓存中保留最多1MiB私人文件，同时拒绝确认时换文件。
    private fun digest(request: AchievementImportRequest) = MessageDigest.getInstance("SHA-256")
        .digest(request.document.toString().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
