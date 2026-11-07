package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/** 配队与操作图云草稿；slot 唯一索引让每个游戏账号的草稿数上限在并发创建下也成立。 */
@Document("battle_drafts")
@CompoundIndex(name = "battle_draft_slot", def = "{'userId':1,'accountId':1,'slot':1}", unique = true)
data class BattleDraft(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val slot: Int,
    val title: String,
    val game: String,
    val payloadJson: String,
    val revision: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
)
