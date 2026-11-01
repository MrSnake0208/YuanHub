package com.lhs.share.hub.service.beta

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.entity.BetaCampaign
import com.lhs.share.hub.repository.entity.BetaEnrollment
import com.lhs.share.hub.repository.entity.BetaMode
import com.lhs.share.hub.repository.entity.BetaSnapshotStatus
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.service.UserService
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class BetaAdminAccessTest {
    private val now = Instant.parse("2026-09-23T09:00:00Z")
    private val campaignId = "beta-admin-bypass-test"
    private val mongo = mockk<MongoTemplate>()
    private val transactions = mockk<TransactionTemplate>(relaxed = true)
    private val users = mockk<UserService>()
    private val notifications = mockk<NotificationService>(relaxed = true)
    private val authorization = mockk<AdminAuthorizationService>()
    private val audit = mockk<AdminAuditService>(relaxed = true)
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val service = BetaService(
        mongo,
        transactions,
        users,
        notifications,
        authorization,
        audit,
        clock,
        campaignId,
    )

    @Test
    fun `admin capability bypasses closed beta without consuming enrollment`() {
        every { users.get("admin") } returns MaaUserInfo("admin", "admin", activated = true)
        every { authorization.hasAnyAdminCapability("admin") } returns true
        every { mongo.findOne(any<Query>(), BetaEnrollment::class.java) } returns null
        every { mongo.findById(campaignId, BetaCampaign::class.java) } returns campaign(BetaMode.CLOSED)

        val me = service.me("admin")

        assertTrue(me.canUseBetaFeatures)
        assertEquals("ENTER", me.nextAction)
        assertEquals("NOT_JOINED", me.enrollmentStatus)
        service.requireAccess("admin")
    }

    @Test
    fun `ordinary user still obeys closed beta gate`() {
        every { users.get("user") } returns MaaUserInfo("user", "user", activated = true)
        every { authorization.hasAnyAdminCapability("user") } returns false
        every { mongo.findById(campaignId, BetaCampaign::class.java) } returns campaign(BetaMode.CLOSED)

        val error = assertThrows(BetaApiException::class.java) {
            service.requireAccess("user")
        }

        assertEquals("beta_service_closed", error.code)
    }

    @Test
    fun `capacity accepts an absolute target far above the former 200 ceiling but rejects shrink and the hard limit`() {
        every { authorization.requirePermission(any(), any()) } just Runs
        every { transactions.execute(any<TransactionCallback<Any?>>()) } answers {
            firstArg<TransactionCallback<Any?>>().doInTransaction(mockk())
        }
        every { mongo.save(any<BetaCampaign>()) } answers { firstArg() }
        every { mongo.count(any(), BetaEnrollment::class.java) } returns 0L
        val campaign = campaign(BetaMode.BETA)
        every { mongo.findAndModify(any(), any(), any(), BetaCampaign::class.java) } returns campaign
        every { mongo.findById(campaignId, BetaCampaign::class.java) } returns campaign

        val expanded = service.setCapacity("admin", 1000, "expand well beyond 200", campaign.configVersion)

        assertEquals(1000, campaign.capacity)
        assertEquals(1000, expanded.campaign.capacity)
        assertEquals(100_000, expanded.capacityHardLimit)
        assertEquals(25, expanded.campaign.reservedInitial)

        campaign.configVersion += 1
        val shrink = assertThrows(BetaApiException::class.java) {
            service.setCapacity("admin", 800, "shrink rejected", campaign.configVersion)
        }
        assertEquals("beta_capacity_invalid", shrink.code)
        val overLimit = assertThrows(BetaApiException::class.java) {
            service.setCapacity("admin", 100_001, "over hard limit", campaign.configVersion)
        }
        assertEquals("beta_capacity_invalid", overLimit.code)
        assertEquals(1000, campaign.capacity)
    }

    private fun campaign(mode: BetaMode): BetaCampaign = BetaCampaign(
        id = campaignId,
        accessMode = mode,
        admissionsPaused = true,
        startsAt = now.minusSeconds(3600),
        reservedUntil = now.minusSeconds(3600).plusSeconds(72 * 3600),
        snapshotId = "snapshot",
        snapshotStatus = BetaSnapshotStatus.READY,
        snapshotAt = now.minusSeconds(7200),
        snapshotLockedAt = now.minusSeconds(7200),
        updatedAt = now,
    )
}
