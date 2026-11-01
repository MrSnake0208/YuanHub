package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.MailboxReserve
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat

@Service
class MailboxClaimService(
    private val accounts: SubAccountRepository,
    private val records: InventoryRecordRepository,
    private val deleted: InventoryDeletedRecordRepository,
    private val inventory: InventoryService,
    private val history: MailboxHistoryService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
    private val accrual: MailboxAccrualService? = null,
) {
    fun claim(userId: String, accountId: String, body: JsonNode): MailboxReserveResponse {
        val version = body.path("expected_version")
        val operation = body.path("operation_id")
        val selection = body.get("selection")
        val fields = setOf("expected_version", "operation_id") + if (selection != null) setOf("selection") else emptySet()
        if (!body.isObject || body.fieldNames().asSequence().toSet() != fields ||
            !version.isIntegralNumber || !version.canConvertToLong() || version.longValue() !in 0L until 9007199254740991L ||
            !operation.isTextual || !Regex("[A-Za-z0-9._-]{1,64}").matches(operation.textValue())
        ) {
            invalid("邮件领取参数无效，请重新读取储备")
        }
        if (selection != null && (
                !selection.isObject || selection.fieldNames().asSequence().toSet() != setOf(
                    "white_coin_mail_counts",
                    "fu_chuan_mail_count",
                ) ||
                    !selection.path("white_coin_mail_counts").isArray || selection.path("white_coin_mail_counts").size() > 20 ||
                    selection.path("white_coin_mail_counts").any { !validCount(it) } || !validCount(selection.path("fu_chuan_mail_count"))
                )
        ) {
            invalid("请选择正确的邮件领取封数")
        }
        val chosenCoins = selection?.path("white_coin_mail_counts")?.map { it.intValue() }
        val chosenTickets = selection?.path("fu_chuan_mail_count")?.intValue()
        // Selection is part of the receipt ID, so changing a timed-out request cannot falsely confirm another claim.
        val suffix = if (chosenCoins == null) {
            ""
        } else {
            ":" + HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest((chosenCoins.joinToString(",") + ":" + chosenTickets).toByteArray()),
                0,
                16,
            )
        }
        val recordId = "yuanhub:mail:${version.longValue()}:${operation.textValue()}$suffix"
        return checkNotNull(
            transactions.execute {
                val account = accounts.findByUserIdAndAccountId(userId, accountId)
                    ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "游戏账号不存在")
                val reserve = accrual?.settle(userId, accountId) ?: (account.mailboxReserve ?: MailboxReserve())
                if (records.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId) != null) {
                    return@execute MailboxReserveResponse.of(accountId, reserve)
                }
                if (deleted.findByUserIdAndAccountIdAndRecordId(userId, accountId, recordId) != null) {
                    conflict("领取记录已删除，请到最近记录恢复，不要重新领取")
                }
                if (reserve.version != version.longValue()) conflict("邮件储备已变更，请重新读取后核对")
                val coinCounts = chosenCoins ?: reserve.whiteCoinMails.map { it.count }
                val ticketCount = chosenTickets ?: reserve.fuChuanMailCount
                if (coinCounts.size != reserve.whiteCoinMails.size ||
                    coinCounts.zip(reserve.whiteCoinMails).any { (count, row) -> count > row.count } ||
                    ticketCount > reserve.fuChuanMailCount
                ) {
                    invalid("领取封数不能超过已保存储备")
                }
                val coins = coinCounts.zip(reserve.whiteCoinMails).sumOf { (count, row) -> count.toLong() * row.coinsPerMail }
                val tickets = ticketCount.toLong() * 3
                if (coins > Int.MAX_VALUE || tickets > Int.MAX_VALUE) invalid("邮件奖励超过支持上限，请分批维护储备")
                val entries = buildList {
                    if (coins > 0) add(InventoryEntryRequest("baijinbi", "白金币", coins))
                    if (tickets > 0) add(InventoryEntryRequest("fuchuan", "符传", tickets))
                }
                if (entries.isEmpty()) invalid("没有可记录领取的邮件奖励")
                val now = maxOf(Instant.now().truncatedTo(ChronoUnit.MILLIS), reserve.updatedAt ?: Instant.MIN)
                val cleared = reserve.copy(
                    whiteCoinMails = reserve.whiteCoinMails.mapIndexed { index, row -> row.copy(count = row.count - coinCounts[index]) },
                    fuChuanMailCount = reserve.fuChuanMailCount - ticketCount,
                    version = reserve.version + 1,
                    updatedAt = now,
                )
                val saved = accounts.replaceMailboxReserve(userId, accountId, reserve.version, cleared)
                    ?: conflict("邮件储备已变更或账号已删除，请重新读取")
                accrual?.reduce(userId, accountId, reserve, cleared, "claimed")
                inventory.import(
                    userId,
                    accountId,
                    InventoryImportRequest(
                        format = "myshare-inventory-exchange",
                        version = 2,
                        exportedAt = now.toString(),
                        producer = ProducerDto("yuanhub"),
                        records = listOf(
                            InventoryRecordRequest(
                                accountId = accountId,
                                recordId = recordId,
                                recordType = "reward_delta",
                                entityType = "item",
                                acquisitionChannel = "邮件领取",
                                effectiveAt = now.toString(),
                                entries = entries,
                            ),
                        ),
                    ),
                )
                history.record(userId, accountId, reserve, cleared, "claim", recordId)
                MailboxReserveResponse.of(accountId, checkNotNull(saved.mailboxReserve))
            },
        )
    }

    private fun validCount(value: JsonNode): Boolean = value.isIntegralNumber && value.canConvertToInt() && value.intValue() in 0..1000000

    private fun invalid(message: String): Nothing =
        throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)

    private fun conflict(message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "mailbox_claim_conflict", message)
}
