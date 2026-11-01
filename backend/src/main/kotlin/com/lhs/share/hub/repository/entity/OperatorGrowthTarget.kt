package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_growth_target")
@CompoundIndex(
    name = "idx_operator_growth_target_owner_unique",
    def = "{'userId': 1, 'accountId': 1, 'operatorId': 1}",
    unique = true,
)
data class OperatorGrowthTarget(
    @Id val id: String? = null,
    @Indexed val userId: String,
    val accountId: String,
    val operatorId: String,
    val targetLevel: Int? = null,
    val targetElite: Int? = null,
    val targetStarLevel: Int? = null,
    val targetHeartPaper: Int? = null,
    val targetHuaji: OperatorHuaji? = null,
    val revision: Long = 1,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
)
