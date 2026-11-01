package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document

@Document("mailbox_deliveries")
@CompoundIndex(name = "idx_mail_delivery_day", def = "{'userId':1,'accountId':1,'type':1,'day':1}", unique = true)
data class MailboxDelivery(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,
    val type: String,
    val day: String,
    val coinsPerMail: Int = 0,
    val state: String = "pending",
)
