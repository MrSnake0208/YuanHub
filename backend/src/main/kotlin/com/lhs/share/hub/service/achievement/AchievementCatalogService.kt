package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.response.AchievementCatalogResponse
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class AchievementCatalogService(private val mapper: ObjectMapper, private val repository: AchievementCatalogRepository) {
    fun catalog(game: String): AchievementCatalogResponse {
        requireGame(game)
        val published = repository.published(game) ?: load(game).published
        return published.content.publicCatalog(published.version)
    }

    private fun requireGame(game: String) {
        if (game !in SubAccountService.SUPPORTED_GAMES) invalid("game 只允许代号鸢或如鸢")
    }

    fun load(game: String): AchievementCatalog {
        requireGame(game)
        repository.find(game)?.let { return it }
        val content = CatalogContent(game)
        return AchievementCatalog(
            game = game,
            published = CatalogPublication("achievement-empty-$game", content, Instant.EPOCH, ""),
            draft = content,
        )
    }
}
