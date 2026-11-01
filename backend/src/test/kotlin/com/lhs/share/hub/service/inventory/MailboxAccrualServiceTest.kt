package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.MailboxDelivery
import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.MailboxSchedule
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.repository.entity.WhiteCoinMail
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class MailboxAccrualServiceTest {
    private val accounts = mockk<SubAccountRepository>()
    private val records = mockk<InventoryRecordRepository>()
    private val deleted = mockk<InventoryDeletedRecordRepository>()
    private val history = mockk<MailboxHistoryService>(relaxed = true)
    private val template = mockk<MongoTemplate>()
    private val tx = mockk<TransactionTemplate>()
    private val clock = Clock.fixed(Instant.parse("2026-11-03T06:00:00Z"), ZoneOffset.UTC)
    private val service = MailboxAccrualService(accounts, records, deleted, history, template, tx, clock)
    private val mapper = jacksonObjectMapper()

    @Test
    fun `strict dates positive rewards and no retroactive start`() {
        for (input in listOf(
            """{"start_date":"2026-11-02","end_date":"2026-11-10","coins_per_mail":90}""",
            """{"start_date":"2026-11-04","end_date":"2026-11-03","coins_per_mail":90}""",
            """{"start_date":"2026-11-03","end_date":"2026-11-31","coins_per_mail":90}""",
            """{"start_date":"2026-11-03","end_date":"2026-11-10","coins_per_mail":0}""",
            """{"start_date":"2026-11-03","end_date":"2026-11-10","coins_per_mail":90,"through_date":"2026-11-10"}""",
        )) {
            assertThrows(InventoryApiException::class.java) { service.schedule(mapper.readTree(input), null, true) }
        }
        val previous = MailboxSchedule("2026-11-01", "2026-11-03", 90, "2026-11-03")
        assertNull(service.schedule(mapper.nullNode(), previous, true))
        assertEquals(previous, service.schedule(null, previous, true))
        val updated = service.schedule(
            mapper.readTree("""{"start_date":"2026-11-01","end_date":"2026-11-20","coins_per_mail":60}"""),
            previous,
            true,
        )
        assertEquals("2026-11-03", updated!!.throughDate)
        assertEquals(60, updated.coinsPerMail)
    }

    @Test
    fun `business day changes at five in Shanghai`() {
        val before =
            MailboxAccrualService(
                accounts,
                records,
                deleted,
                history,
                template,
                tx,
                Clock.fixed(Instant.parse("2026-11-02T20:59:59Z"), ZoneOffset.UTC),
            )
        val after =
            MailboxAccrualService(
                accounts,
                records,
                deleted,
                history,
                template,
                tx,
                Clock.fixed(Instant.parse("2026-11-02T21:00:00Z"), ZoneOffset.UTC),
            )
        assertEquals("2026-11-02", before.today().toString())
        assertEquals("2026-11-03", after.today().toString())
    }

    @Test
    fun `catchup adds only missing inclusive days preserves stock groups and retries do nothing`() {
        var account = SubAccount(
            userId = "owner",
            accountId = "a",
            name = "A",
            mailboxReserve = MailboxReserve(
                listOf(WhiteCoinMail(5, 60), WhiteCoinMail(2, 90)),
                1,
                1,
                Instant.parse("2026-10-31T06:00:00Z"),
                MailboxSchedule("2026-11-01", "2026-11-02", 90),
                MailboxSchedule("2026-11-02", "2026-11-03"),
            ),
        )
        val deliveries = mutableListOf<MailboxDelivery>()
        every { accounts.findByUserIdAndAccountId("owner", "a") } answers { account }
        every { accounts.replaceMailboxReserve("owner", "a", any(), any()) } answers {
            assertEquals(account.mailboxReserve!!.version, thirdArg<Long>())
            account = account.copy(mailboxReserve = arg(3))
            account
        }
        every { records.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { deleted.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { template.exists(any<Query>(), MailboxDelivery::class.java) } answers {
            val query = firstArg<Query>().queryObject
            deliveries.any { it.day == query["day"] && it.type == query["type"] }
        }
        every { template.insert(any<MailboxDelivery>()) } answers { firstArg<MailboxDelivery>().also { deliveries.add(it) } }
        every { tx.execute(any<TransactionCallback<MailboxReserve>>()) } answers
            { firstArg<TransactionCallback<MailboxReserve>>().doInTransaction(mockk()) }
        val result = service.sync("owner", "a")
        assertEquals(listOf(WhiteCoinMail(5, 60), WhiteCoinMail(4, 90)), result.whiteCoinMails)
        assertEquals(3, result.fuChuanMailCount)
        assertEquals(4, deliveries.size)
        assertEquals(result, service.sync("owner", "a"))
        assertEquals(4, deliveries.size)
        verify(exactly = 3) { history.record("owner", "a", any(), any(), "accrual", null) }
    }

    @Test
    fun `adjustments consume oldest tracked deliveries only after legacy stock`() {
        val pending = (1..3).map {
            MailboxDelivery(id = "$it", userId = "owner", accountId = "a", type = "coins", day = "2026-11-0$it", coinsPerMail = 90)
        }
        every { template.find(any<Query>(), MailboxDelivery::class.java) } returns pending
        every { template.save(any<MailboxDelivery>()) } answers { firstArg() }
        val before = MailboxReserve(listOf(WhiteCoinMail(5, 90)))
        service.reduce("owner", "a", before, before.copy(whiteCoinMails = listOf(WhiteCoinMail(4, 90))), "claimed")
        verify(exactly = 0) { template.save(any<MailboxDelivery>()) }
        service.reduce("owner", "a", before, before.copy(whiteCoinMails = listOf(WhiteCoinMail(2, 90))), "adjusted")
        verify(exactly = 1) { template.save(pending.first().copy(state = "adjusted")) }
    }

    @Test
    fun `renewal after expiry does not backfill stopped days`() {
        val previous = MailboxSchedule("2026-11-01", "2026-11-01", 90, "2026-11-01")
        val renewed = service.schedule(
            mapper.readTree("""{"start_date":"2026-11-01","end_date":"2026-11-10","coins_per_mail":90}"""),
            previous,
            true,
        )
        assertEquals("2026-11-02", renewed!!.throughDate)
    }

    @Test
    fun `configuration cannot fill capacity and lock out future management`() {
        val reserve =
            MailboxReserve(listOf(WhiteCoinMail(1000000, 90)), whiteCoinSchedule = MailboxSchedule("2026-11-03", "2026-11-04", 90))
        assertThrows(InventoryApiException::class.java) { service.validateCapacity(reserve) }
        service.validateCapacity(reserve.copy(whiteCoinMails = listOf(WhiteCoinMail(999998, 90))))
    }
}
