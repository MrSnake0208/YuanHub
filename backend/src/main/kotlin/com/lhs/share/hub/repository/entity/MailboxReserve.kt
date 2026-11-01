package com.lhs.share.hub.repository.entity

import java.time.Instant

data class WhiteCoinMail(val count: Int, val coinsPerMail: Int)

data class MailboxSchedule(
    val startDate: String,
    val endDate: String,
    val coinsPerMail: Int = 0,
    val throughDate: String? = null,
)

data class MailboxReserve(
    val whiteCoinMails: List<WhiteCoinMail> = emptyList(),
    val fuChuanMailCount: Int = 0,
    val version: Long = 0,
    val updatedAt: Instant? = null,
    val whiteCoinSchedule: MailboxSchedule? = null,
    val fuChuanSchedule: MailboxSchedule? = null,
)
