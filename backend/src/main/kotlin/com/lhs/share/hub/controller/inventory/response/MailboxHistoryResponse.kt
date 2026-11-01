package com.lhs.share.hub.controller.inventory.response

import com.lhs.share.hub.repository.entity.WhiteCoinMail
import java.time.Instant

data class MailboxHistoryEntry(
    val version: Long,
    val effectiveAt: Instant,
    val kind: String,
    val whiteCoinMails: List<WhiteCoinMail>,
    val fuChuanMailCount: Int,
    val recordId: String?,
    val claimDeleted: Boolean,
)

data class MailboxHistoryResponse(
    val accountId: String,
    val entries: List<MailboxHistoryEntry>,
    val nextCursor: String?,
    val version: Long,
    val inventoryRevision: Long,
    val inventoryRecordCount: Long,
)
