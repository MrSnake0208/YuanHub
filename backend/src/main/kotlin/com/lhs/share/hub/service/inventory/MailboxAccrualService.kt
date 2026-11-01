package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.MailboxDelivery
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.MailboxSchedule
import com.lhs.share.hub.repository.entity.WhiteCoinMail
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

@Service
class MailboxAccrualService(
    private val accounts: SubAccountRepository,
    private val records: InventoryRecordRepository,
    private val deleted: InventoryDeletedRecordRepository,
    private val history: MailboxHistoryService,
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun today(): LocalDate = clock.instant().atZone(ZONE).minusHours(5).toLocalDate()

    fun schedule(node: JsonNode?, previous: MailboxSchedule?, coins: Boolean): MailboxSchedule? {
        if (node == null) return previous
        if (node.isNull) return null
        val fields = setOf("start_date", "end_date") + if (coins) setOf("coins_per_mail") else emptySet()
        if (!node.isObject || node.fieldNames().asSequence().toSet() != fields) invalid("自动累计设置无效")
        val start = date(node.path("start_date").asText())
        val end = date(node.path("end_date").asText())
        val amount = if (coins) node.path("coins_per_mail") else null
        if (amount != null && (!amount.isIntegralNumber || !amount.canConvertToInt() || amount.intValue() !in 1..1000000)) {
            invalid("自动累计的单封奖励须为1至1000000的整数")
        }
        if (end < start || end > today().plusYears(10)) invalid("截止日期须不早于首次日期，且不超过未来10年")
        if (previous == null || start.toString() != previous.startDate) {
            if (start < today()) invalid("首次累计日期不能早于当前业务日")
        }
        val through = if (previous != null && date(previous.endDate) < today() && end > date(previous.endDate)) {
            maxOf(previous.throughDate ?: previous.startDate, today().minusDays(1).toString())
        } else {
            previous?.throughDate
        }
        return MailboxSchedule(start.toString(), end.toString(), amount?.intValue() ?: 0, through)
    }

    fun validateCapacity(value: MailboxReserve) {
        fun remaining(schedule: MailboxSchedule): Long =
            (ChronoUnit.DAYS.between(next(schedule), date(schedule.endDate)) + 1).coerceAtLeast(0)
        value.whiteCoinSchedule?.let { schedule ->
            val count = value.whiteCoinMails.firstOrNull { it.coinsPerMail == schedule.coinsPerMail }?.count ?: 0
            if (count + remaining(schedule) > LIMIT) invalid("当前封数与剩余累计封数超过上限，请减少封数或缩短截止日期")
        }
        value.fuChuanSchedule?.let { schedule ->
            if (value.fuChuanMailCount + remaining(schedule) > LIMIT) invalid("当前封数与剩余累计封数超过上限，请减少封数或缩短截止日期")
        }
    }

    fun sync(user: String, account: String): MailboxReserve {
        repeat(3) { attempt ->
            try {
                return checkNotNull(transactions.execute { settle(user, account) })
            } catch (error: RuntimeException) {
                val transient = generateSequence<Throwable>(error) { it.cause }.any {
                    it is com.mongodb.MongoException && it.hasErrorLabel("TransientTransactionError") ||
                        it is org.springframework.dao.DuplicateKeyException
                }
                if (!transient) throw error
                if (attempt == 2) conflict("邮件正在更新，请重新读取")
            }
        }
        error("unreachable")
    }

    // Callers share the Hub transaction, including the inventory import/claim transaction.
    fun settle(user: String, account: String): MailboxReserve {
        var reserve = reserve(user, account)
        val schedules = listOfNotNull(reserve.whiteCoinSchedule, reserve.fuChuanSchedule)
        val first = schedules.mapNotNull { next(it).takeIf { day -> day <= today() && day <= date(it.endDate) } }.minOrNull()
            ?: return reserve
        var day = first
        while (day <= today() && schedules.any { day <= date(it.endDate) }) {
            val before = reserve
            var changed = false
            for (type in listOf("coins", "tickets")) {
                val schedule = (if (type == "coins") reserve.whiteCoinSchedule else reserve.fuChuanSchedule) ?: continue
                if (day < next(schedule) || day > date(schedule.endDate)) continue
                val query = owner(user, account).addCriteria(Criteria.where("type").`is`(type).and("day").`is`(day.toString()))
                if (!template.exists(query, MailboxDelivery::class.java)) {
                    val key = dailyId(day.toString())
                    val recorded = type == "coins" && (
                        records.findByUserIdAndAccountIdAndRecordId(user, account, key) != null ||
                            deleted.findByUserIdAndAccountIdAndRecordId(user, account, key) != null
                        )
                    template.insert(
                        MailboxDelivery(
                            userId = user,
                            accountId = account,
                            type = type,
                            day = day.toString(),
                            coinsPerMail = schedule.coinsPerMail,
                            state = if (recorded) "claimed" else "pending",
                        ),
                    )
                    if (!recorded) {
                        reserve = if (type == "coins") {
                            addCoin(reserve, schedule.coinsPerMail)
                        } else {
                            if (reserve.fuChuanMailCount >= LIMIT) invalid("符传邮件已达上限，请先调整储备")
                            reserve.copy(fuChuanMailCount = reserve.fuChuanMailCount + 1)
                        }
                    }
                }
                val updated = schedule.copy(throughDate = day.toString())
                reserve = if (type == "coins") reserve.copy(whiteCoinSchedule = updated) else reserve.copy(fuChuanSchedule = updated)
                changed = true
            }
            if (changed) {
                val time = maxOf(day.atTime(5, 0).atZone(ZONE).toInstant(), before.updatedAt ?: Instant.MIN)
                reserve = persist(user, account, before, reserve.copy(updatedAt = time), "accrual")
            }
            day = day.plusDays(1)
        }
        return reserve
    }

    fun dailyStatus(user: String, account: String, day: String): Map<String, Any?> {
        val reserve = reserve(user, account)
        date(day)
        val delivery = template.findOne(
            owner(user, account).addCriteria(Criteria.where("type").`is`("coins").and("day").`is`(day)),
            MailboxDelivery::class.java,
        )
        val schedule = reserve.whiteCoinSchedule
        val amount =
            delivery?.coinsPerMail
                ?: schedule?.takeIf { day >= it.startDate && day <= it.endDate && day <= today().toString() }?.coinsPerMail
        return mapOf("monthly_claimed" to (delivery != null && delivery.state != "pending"), "monthly_coins" to amount)
    }

    fun consumeDaily(user: String, record: InventoryRecordRequest) {
        if (!record.recordId.startsWith(DAILY_PREFIX) || record.recordType != "reward_delta") return
        val day = record.recordId.removePrefix(DAILY_PREFIX)
        date(day)
        if (Instant.parse(record.effectiveAt).atZone(ZONE).minusHours(5).toLocalDate().toString() != day) {
            invalid("月卡记录日期与发生时间不一致")
        }
        val before = settle(user, record.accountId)
        val delivery =
            template.findOne(
                owner(user, record.accountId).addCriteria(Criteria.where("type").`is`("coins").and("day").`is`(day)),
                MailboxDelivery::class.java,
            )
                ?: return
        if (delivery.state != "pending") conflict("该日月卡邮件已领取或已校正，请核对邮件与操作历史")
        if (record.entityType != "item" || record.entries.size != 1 || record.entries.single().id != "baijinbi" ||
            record.entries.single().count != delivery.coinsPerMail.toLong()
        ) {
            invalid("领取数量须与该日邮件的单封奖励一致，请在邮件管理中核对")
        }
        var deducted = false
        val rows = before.whiteCoinMails.map { row ->
            if (!deducted && row.coinsPerMail == delivery.coinsPerMail && row.count > 0) {
                deducted = true
                row.copy(count = row.count - 1)
            } else {
                row
            }
        }
        if (!deducted) conflict("邮件封数已变化，请重新读取")
        template.save(delivery.copy(state = "claimed"))
        persist(user, record.accountId, before, before.copy(whiteCoinMails = rows, updatedAt = now(before)), "claim", record.recordId)
    }

    // Historic untracked stock is consumed first. Reductions mark tracked days so they cannot be replayed.
    fun reduce(user: String, account: String, before: MailboxReserve, after: MailboxReserve, state: String) {
        val pending = template.find(
            owner(user, account).addCriteria(Criteria.where("state").`is`("pending"))
                .with(Sort.by("day")),
            MailboxDelivery::class.java,
        )
        for ((key, deliveries) in pending.groupBy { it.type to it.coinsPerMail }) {
            val remaining = if (key.first ==
                "tickets"
            ) {
                after.fuChuanMailCount
            } else {
                after.whiteCoinMails.filter { it.coinsPerMail == key.second }.sumOf { it.count }
            }
            val previous = if (key.first ==
                "tickets"
            ) {
                before.fuChuanMailCount
            } else {
                before.whiteCoinMails.filter { it.coinsPerMail == key.second }.sumOf { it.count }
            }
            val removed = minOf(previous - remaining, deliveries.size - remaining).coerceAtLeast(0)
            deliveries.take(removed).forEach { template.save(it.copy(state = state)) }
        }
    }

    private fun addCoin(reserve: MailboxReserve, amount: Int): MailboxReserve {
        val rows = reserve.whiteCoinMails.toMutableList()
        val index = rows.indexOfFirst { it.coinsPerMail == amount }
        if (index < 0) {
            if (rows.size >= 20) invalid("邮件分组已达20组，请先整理储备")
            rows.add(WhiteCoinMail(1, amount))
        } else {
            if (rows[index].count >= LIMIT) invalid("白金币邮件已达上限，请先调整储备")
            rows[index] = rows[index].copy(count = rows[index].count + 1)
        }
        return reserve.copy(whiteCoinMails = rows)
    }

    private fun persist(
        user: String,
        account: String,
        before: MailboxReserve,
        value: MailboxReserve,
        kind: String,
        record: String? = null,
    ): MailboxReserve {
        if (before.version >= 9007199254740990L) invalid("邮件储备版本已达上限")
        val after = value.copy(version = before.version + 1)
        accounts.replaceMailboxReserve(user, account, before.version, after) ?: conflict("邮件储备已变更，请重新读取")
        history.record(user, account, before, after, kind, record)
        return after
    }

    private fun reserve(user: String, account: String): MailboxReserve = (
        accounts.findByUserIdAndAccountId(user, account)
            ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "游戏账号不存在")
        ).mailboxReserve ?: MailboxReserve()
    private fun next(value: MailboxSchedule): LocalDate = maxOf(
        date(value.startDate),
        value.throughDate?.let { date(it).plusDays(1) } ?: date(value.startDate),
    )
    private fun now(value: MailboxReserve): Instant = maxOf(clock.instant().truncatedTo(ChronoUnit.MILLIS), value.updatedAt ?: Instant.MIN)
    private fun owner(user: String, account: String) = Query(Criteria.where("userId").`is`(user).and("accountId").`is`(account))
    private fun date(value: String): LocalDate = try {
        if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(value)) invalid("请输入有效日期")
        LocalDate.parse(value)
    } catch (_: java.time.DateTimeException) {
        invalid("请输入有效日期")
    }
    private fun invalid(message: String): Nothing =
        throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)
    private fun conflict(message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, "mailbox_claim_conflict", message)

    companion object {
        private val ZONE = ZoneId.of("Asia/Shanghai")
        private const val LIMIT = 1000000
        private const val DAILY_PREFIX = "yuanhub:daily-whitecoin:monthly-card:"
        fun dailyId(day: String): String = DAILY_PREFIX + day
    }
}
