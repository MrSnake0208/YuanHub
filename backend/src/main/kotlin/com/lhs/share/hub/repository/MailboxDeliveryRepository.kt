package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.MailboxDelivery
import org.springframework.data.mongodb.repository.MongoRepository

interface MailboxDeliveryRepository : MongoRepository<MailboxDelivery, String> {
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
