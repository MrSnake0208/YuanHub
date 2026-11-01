package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/**
 * PATCH 校正审计。它与 v2 交换流水分开，删除 v2 record 后可按实际接收顺序重放，
 * 不需要把 v3 字段塞进 version=2 的交换文档。
 */
@Document("operator_correction_records")
@CompoundIndex(
    name = "idx_op_correction_user_account_game_created",
    def = "{'userId': 1, 'accountId': 1, 'game': 1, 'createdAt': 1}",
)
data class OperatorCorrectionRecord(
    @Id val id: String? = null,
    @Indexed val userId: String,
    val accountId: String,
    val game: String,
    val operatorId: String,
    val reason: String,
    val fields: Set<String>,
    val level: Int? = null,
    val elite: Int? = null,
    val starLevel: Int? = null,
    val discLoadouts: List<OperatorDiscLoadout>? = null,
    val starStones: List<OperatorStarStone>? = null,
    val combatStats: OperatorCombatStats? = null,
    val huaji: OperatorHuaji? = null,
    val huajiLegacy: OperatorHuajiLegacy? = null,
    val createdAt: Instant = Instant.now(),
    val levelBreakthroughStage: Int? = null,
)
