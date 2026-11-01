package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.controller.achievement.response.AchievementCatalogResponse
import com.lhs.share.hub.controller.achievement.response.AchievementCategory
import com.lhs.share.hub.controller.achievement.response.AchievementEntry

// 合成测试数据，不代表真实游戏目录，禁止移动到 main/resources。
internal fun achievementMapper() = jacksonObjectMapper().registerModule(JavaTimeModule())
    .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

internal fun fixtureCatalog(game: String = "代号鸢", version: String = "fixture-v1"): AchievementCatalogResponse {
    val prefix = if (game == "代号鸢") "yh_fixture_dhy" else "yh_fixture_ry"
    return AchievementCatalogResponse(
        version,
        game,
        "fixture",
        "仅用于测试",
        listOf(AchievementCategory("test", "测试分类")),
        (1..3).map { index ->
            AchievementEntry(
                achievementId = "${prefix}_$index",
                game = game,
                categoryId = "test",
                name = "测试成就$index",
                condition = "测试条件",
                sort = index,
                isHidden = index == 2,
                target = if (index == 1) 10L else null,
            )
        },
    )
}

internal fun fixturePatch(json: String) = AchievementRequestDecoder.patch(achievementMapper().readTree(json))

internal fun fixtureRewardItems() = listOf(
    com.lhs.share.hub.controller.achievement.response.AchievementRewardItem("test_coin", "测试币", listOf("代号鸢", "如鸢")),
    com.lhs.share.hub.controller.achievement.response.AchievementRewardItem("test_ticket", "测试券", listOf("代号鸢", "如鸢")),
)
