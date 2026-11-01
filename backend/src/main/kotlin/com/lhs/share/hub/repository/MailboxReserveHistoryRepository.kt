package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.MailboxReserveHistory
import org.springframework.data.mongodb.repository.MongoRepository

interface MailboxReserveHistoryRepository : MongoRepository<MailboxReserveHistory, String> {
    fun findByUserIdAndAccountIdAndVersion(userId: String, accountId: String, version: Long): MailboxReserveHistory?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
