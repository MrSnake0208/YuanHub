package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("mailbox_reserve_history")
@CompoundIndex(name = "idx_mailbox_history_version", def = "{'userId':1,'accountId':1,'version':1}", unique = true)
@CompoundIndex(name = "idx_mailbox_history_time", def = "{'userId':1,'accountId':1,'effectiveAt':1,'version':1}")
data class MailboxReserveHistory(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val version: Long,
    val effectiveAt: Instant,
    val kind: String,
    val whiteCoinMails: List<WhiteCoinMail>,
    val fuChuanMailCount: Int,
    val recordId: String? = null,
)
