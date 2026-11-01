package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.inventory.response.MailboxReserveResponse
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.WhiteCoinMail
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.temporal.ChronoUnit

@Service
class MailboxReserveService(
    private val accounts: SubAccountService,
    private val repository: SubAccountRepository,
    private val history: MailboxHistoryService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
    private val clock: Clock = Clock.systemUTC(),
    private val accrual: MailboxAccrualService? = null,
) {
    fun get(userId: String, accountId: String): MailboxReserveResponse = history.current(userId, accountId)

    fun sync(userId: String, accountId: String): MailboxReserveResponse {
        checkNotNull(accrual).sync(userId, accountId)
        return get(userId, accountId)
    }

    fun dailyStatus(userId: String, accountId: String, day: String): Map<String, Any?> =
        checkNotNull(accrual).dailyStatus(userId, accountId, day)

    fun save(userId: String, accountId: String, body: JsonNode): MailboxReserveResponse {
        accounts.requireAccount(userId, accountId)
        fields(
            body,
            setOf("expected_version", "white_coin_mails", "fu_chuan_mail_count") +
                setOf("white_coin_schedule", "fu_chuan_schedule").filter { body.has(it) },
        )
        val expected = body.path("expected_version")
        if (!expected.isIntegralNumber || !expected.canConvertToLong() || expected.longValue() !in 0L until 9007199254740991L) {
            invalid("储备版本不正确，请重新读取")
        }
        val rows = body.path("white_coin_mails")
        if (!rows.isArray || rows.size() > 20) invalid("白金币邮件最多填写20行")
        val mails = rows.map {
            fields(it, setOf("count", "coins_per_mail"))
            WhiteCoinMail(amount(it.path("count")), amount(it.path("coins_per_mail")))
        }
        val tickets = amount(body.path("fu_chuan_mail_count"))
        return checkNotNull(
            transactions.execute {
                val previous =
                    accrual?.settle(userId, accountId) ?: (accounts.requireAccount(userId, accountId).mailboxReserve ?: MailboxReserve())
                if (previous.version != expected.longValue()) conflict()
                val coinSchedule =
                    accrual?.schedule(body.get("white_coin_schedule"), previous.whiteCoinSchedule, true)
                        ?: if (body.has("white_coin_schedule")) null else previous.whiteCoinSchedule
                val ticketSchedule =
                    accrual?.schedule(body.get("fu_chuan_schedule"), previous.fuChuanSchedule, false)
                        ?: if (body.has("fu_chuan_schedule")) null else previous.fuChuanSchedule
                if (coinSchedule != null && mails.none { it.coinsPerMail == coinSchedule.coinsPerMail }) invalid("请保留自动累计对应的单封奖励分组，或关闭自动累计")
                if (previous.updatedAt != null && previous.whiteCoinMails == mails && previous.fuChuanMailCount == tickets &&
                    previous.whiteCoinSchedule == coinSchedule &&
                    previous.fuChuanSchedule == ticketSchedule
                ) {
                    return@execute MailboxReserveResponse.of(accountId, previous)
                }
                val now = maxOf(clock.instant().truncatedTo(ChronoUnit.MILLIS), previous.updatedAt ?: java.time.Instant.MIN)
                val reserve = MailboxReserve(mails, tickets, previous.version + 1, now, coinSchedule, ticketSchedule)
                accrual?.validateCapacity(reserve)
                val account = repository.replaceMailboxReserve(userId, accountId, previous.version, reserve) ?: conflict()
                accrual?.reduce(userId, accountId, previous, reserve, "adjusted")
                history.record(userId, accountId, previous, reserve, if (previous.updatedAt == null) "baseline" else "adjustment")
                MailboxReserveResponse.of(accountId, accrual?.settle(userId, accountId) ?: checkNotNull(account.mailboxReserve))
            },
        )
    }

    private fun conflict(): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "mailbox_reserve_conflict", "邮箱储备已变更或账号已删除，请重新读取后核对")

    private fun amount(value: JsonNode): Int {
        if (!value.isIntegralNumber || !value.canConvertToInt() || value.intValue() !in 0..1000000) {
            invalid("封数及每封奖励须为0至1000000的整数")
        }
        return value.intValue()
    }

    private fun fields(value: JsonNode, names: Set<String>) {
        if (!value.isObject || value.fieldNames().asSequence().toSet() != names) invalid("邮箱储备字段不正确")
    }

    private fun invalid(message: String): Nothing =
        throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)
}
