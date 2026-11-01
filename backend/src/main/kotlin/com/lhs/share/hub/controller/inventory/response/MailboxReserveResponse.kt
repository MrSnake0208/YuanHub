package com.lhs.share.hub.controller.inventory.response

import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.MailboxSchedule
import com.lhs.share.hub.repository.entity.WhiteCoinMail
import java.time.Instant

data class MailboxReserveResponse(
    val accountId: String,
    val whiteCoinMails: List<WhiteCoinMail>,
    val fuChuanMailCount: Int,
    val version: Long,
    val updatedAt: Instant?,
    val inventoryRevision: Long? = null,
    val inventoryRecordCount: Long? = null,
    val whiteCoinSchedule: MailboxSchedule? = null,
    val fuChuanSchedule: MailboxSchedule? = null,
) {
    companion object {
        fun of(accountId: String, reserve: MailboxReserve) = MailboxReserveResponse(
            accountId,
            reserve.whiteCoinMails,
            reserve.fuChuanMailCount,
            reserve.version,
            reserve.updatedAt,
            whiteCoinSchedule = reserve.whiteCoinSchedule,
            fuChuanSchedule = reserve.fuChuanSchedule,
        )
    }
}
