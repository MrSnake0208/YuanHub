package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.controller.inventory.response.MailboxHistoryEntry
import com.lhs.share.hub.controller.inventory.response.MailboxHistoryResponse
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.repository.MailboxReserveHistoryRepository
import com.lhs.share.hub.repository.entity.InventoryDeletedRecord
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.MailboxReserveHistory
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.Base64

@Service
class MailboxHistoryService(
    private val accounts: SubAccountService,
    private val history: MailboxReserveHistoryRepository,
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun current(userId: String, accountId: String): MailboxReserveResponse = checkNotNull(
        transactions.execute {
            val reserve = accounts.requireAccount(userId, accountId).mailboxReserve ?: MailboxReserve()
            val revision = template.findOne(owner(userId, accountId), InventoryRevision::class.java)?.revision ?: 0L
            // Historical-only imports need not bump the stock revision; their append changes the count.
            val count = template.count(owner(userId, accountId), InventoryRecord::class.java)
            MailboxReserveResponse.of(accountId, reserve).copy(inventoryRevision = revision, inventoryRecordCount = count)
        },
    )

    // Called inside the same transaction as the current-reserve CAS and optional inventory import.
    fun record(userId: String, accountId: String, before: MailboxReserve, after: MailboxReserve, kind: String, recordId: String? = null) {
        if (before.updatedAt != null && before.version > 0 &&
            history.findByUserIdAndAccountIdAndVersion(userId, accountId, before.version) == null
        ) {
            history.insert(snapshot(userId, accountId, before, "baseline"))
        }
        history.insert(snapshot(userId, accountId, after, kind, recordId))
    }

    fun list(userId: String, accountId: String, from: Instant, to: Instant, cursor: String?, limit: Int): MailboxHistoryResponse {
        if (from >= to || limit !in 1..100) invalid()
        val context = listOf(userId, accountId, from.toString(), to.toString())
        val after = cursor?.let {
            try {
                if (it.length > 2048) invalid()
                val parts = String(Base64.getUrlDecoder().decode(it), Charsets.UTF_8).split("\n")
                if (parts.size != 6 || parts.take(4) != context) invalid()
                val time = Instant.parse(parts[4])
                val version = parts[5].toLong()
                if (time < from || time >= to || version < 0) invalid()
                time to version
            } catch (_: Exception) {
                invalid()
            }
        }
        return checkNotNull(
            transactions.execute {
                val state = current(userId, accountId)
                val criteria = Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId).and("effectiveAt").gte(from).lt(to)
                if (after != null) {
                    criteria.andOperator(
                        Criteria().orOperator(
                            Criteria.where("effectiveAt").gt(after.first),
                            Criteria.where("effectiveAt").`is`(after.first).and("version").gt(after.second),
                        ),
                    )
                }
                val rows = template.find(
                    Query(criteria).with(Sort.by("effectiveAt", "version")).limit(limit + 1),
                    MailboxReserveHistory::class.java,
                ).toMutableList()
                val reserve = MailboxReserve(state.whiteCoinMails, state.fuChuanMailCount, state.version, state.updatedAt)
                val time = reserve.updatedAt
                if (time != null && reserve.version > 0 && time >= from && time < to &&
                    (after == null || time > after.first || time == after.first && reserve.version > after.second) &&
                    history.findByUserIdAndAccountIdAndVersion(userId, accountId, reserve.version) == null
                ) {
                    rows.add(snapshot(userId, accountId, reserve, "baseline"))
                }
                val ordered = rows.sortedWith(compareBy<MailboxReserveHistory> { it.effectiveAt }.thenBy { it.version })
                val page = ordered.take(limit)
                val ids = page.mapNotNull { it.recordId }
                val deleted = if (ids.isEmpty()) {
                    emptySet()
                } else {
                    template.find(
                        owner(userId, accountId).addCriteria(Criteria.where("recordId").`in`(ids)),
                        InventoryDeletedRecord::class.java,
                    ).map { it.recordId }.toSet()
                }
                val next = if (ordered.size <= limit) {
                    null
                } else {
                    page.last().let {
                        Base64.getUrlEncoder().withoutPadding().encodeToString(
                            (
                                context + listOf(
                                    it.effectiveAt.toString(),
                                    it.version.toString(),
                                )
                                ).joinToString("\n").toByteArray(Charsets.UTF_8),
                        )
                    }
                }
                MailboxHistoryResponse(
                    accountId,
                    page.map {
                        MailboxHistoryEntry(
                            it.version,
                            it.effectiveAt,
                            it.kind,
                            it.whiteCoinMails,
                            it.fuChuanMailCount,
                            it.recordId,
                            it.recordId in deleted,
                        )
                    },
                    next,
                    state.version,
                    checkNotNull(state.inventoryRevision),
                    checkNotNull(state.inventoryRecordCount),
                )
            },
        )
    }

    private fun snapshot(userId: String, accountId: String, reserve: MailboxReserve, kind: String, recordId: String? = null) =
        MailboxReserveHistory(
            userId = userId,
            accountId = accountId,
            version = reserve.version,
            effectiveAt = checkNotNull(reserve.updatedAt),
            kind = kind,
            whiteCoinMails = reserve.whiteCoinMails,
            fuChuanMailCount = reserve.fuChuanMailCount,
            recordId = recordId,
        )

    private fun owner(userId: String, accountId: String) = Query(Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId))
    private fun invalid(): Nothing =
        throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_mailbox_history_query", "邮件历史查询参数无效")
}
