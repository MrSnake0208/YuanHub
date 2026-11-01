package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import org.springframework.data.mongodb.core.mapping.Field
import java.time.Instant

@Document("operator_records")
@CompoundIndex(name = "idx_op_user_account_record_unique", def = "{'userId': 1, 'accountId': 1, 'recordId': 1}", unique = true)
@CompoundIndex(name = "idx_op_user_account_effective", def = "{'userId': 1, 'accountId': 1, 'effectiveAt': 1}")
@CompoundIndex(name = "idx_op_user_account_game_effective", def = "{'userId': 1, 'accountId': 1, 'game': 1, 'effectiveAt': 1}")
data class OperatorRecord(
    @Id val id: String? = null,
    val recordId: String,
    @Indexed val userId: String,
    val accountId: String,
    val recordType: String,
    val game: String? = null,
    val snapshotScope: String,
    val effectiveAt: Instant,
    val receivedAt: Instant = Instant.now(),
    val producer: ProducerInfo,
    val entries: List<OperatorRecordEntry>,
    val snapshotEffect: String = "applied",
    val effectiveAtPrecision: String? = null,
)

data class OperatorRecordEntry(
    @Field("id") val id: String,
    val name: String? = null,
    val alias: String? = null,
    val rarity: Int? = null,
    val prof: List<String>? = null,
    val subProf: List<String>? = null,
    val games: List<String>? = null,
    val elite: Int,
    val starLevel: Int,
    val level: Int,
    val discs: List<OperatorDisc> = emptyList(),
    val starStones: List<OperatorStarStone> = emptyList(),
)
