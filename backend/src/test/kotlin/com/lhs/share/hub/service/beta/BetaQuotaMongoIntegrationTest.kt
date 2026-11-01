package com.lhs.share.hub.service.beta

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.controller.beta.BetaJoinRequest
import com.lhs.share.hub.repository.AdminAuditLogRepository
import com.lhs.share.hub.repository.NotificationRepository
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.BetaCampaign
import com.lhs.share.hub.repository.entity.BetaEnrollment
import com.lhs.share.hub.repository.entity.BetaEnrollmentStatus
import com.lhs.share.hub.repository.entity.BetaMode
import com.lhs.share.hub.repository.entity.BetaSlotPool
import com.lhs.share.hub.repository.entity.BetaSnapshotEntry
import com.lhs.share.hub.repository.entity.BetaSnapshotStatus
import com.lhs.share.hub.repository.entity.Notification
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.service.UserService
import com.lhs.share.testinfra.TestMongo
import com.mongodb.client.MongoClient
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.Index
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Opt in explicitly. Every test creates and drops ONLY a random beta_test_* database. */
@Tag("integration")
class BetaQuotaMongoIntegrationTest {
    private lateinit var client: MongoClient
    private lateinit var mongo: MongoTemplate
    private lateinit var service: BetaService
    private lateinit var users: UserService
    private lateinit var transactions: TransactionTemplate
    private lateinit var authorization: AdminAuthorizationService
    private lateinit var audit: AdminAuditService
    private lateinit var notifications: NotificationService
    private lateinit var database: String
    private val time = TestClock(Instant.parse("2026-09-24T13:00:00Z"))
    private val id = "beta-test"
    private val request = BetaJoinRequest(id, "v1", true, true)

    @BeforeEach
    fun setup() {
        database = TestMongo.database("beta")
        client = TestMongo.client()
        val factory = SimpleMongoClientDatabaseFactory(client, database)
        mongo = MongoTemplate(factory)
        transactions = TransactionTemplate(MongoTransactionManager(factory))
        listOf(
            BetaCampaign::class.java,
            BetaEnrollment::class.java,
            BetaSnapshotEntry::class.java,
            Notification::class.java,
            AdminAuditLog::class.java,
        ).forEach {
            mongo.createCollection(it)
        }
        mongo.indexOps(
            BetaEnrollment::class.java,
        ).ensureIndex(Index().on("campaignId", Sort.Direction.ASC).on("userId", Sort.Direction.ASC).unique())
        mongo.indexOps(
            BetaEnrollment::class.java,
        ).ensureIndex(Index().on("campaignId", Sort.Direction.ASC).on("status", Sort.Direction.ASC).on("queueSequence", Sort.Direction.ASC))
        mongo.indexOps(
            BetaSnapshotEntry::class.java,
        ).ensureIndex(
            Index().on("campaignId", Sort.Direction.ASC).on("snapshotId", Sort.Direction.ASC).on("userId", Sort.Direction.ASC).unique(),
        )
        users = mockk()
        every { users.get(any()) } answers { com.lhs.share.fixtures.TestFixtures.user(firstArg()) }
        authorization = mockk(relaxed = true)
        val repositories = MongoRepositoryFactory(mongo)
        notifications = NotificationService(repositories.getRepository(NotificationRepository::class.java), mockk(relaxed = true))
        audit = AdminAuditService(repositories.getRepository(AdminAuditLogRepository::class.java), authorization)
        service = newService(notifications)
        mongo.save(
            BetaCampaign(
                id = id, accessMode = BetaMode.BETA, admissionsPaused = false,
                startsAt = time.instant().minusSeconds(3600), snapshotId = "frozen-v1",
                snapshotStatus = BetaSnapshotStatus.READY, snapshotAt = time.instant().minusSeconds(86400),
                snapshotLockedAt = time.instant().minusSeconds(7200), snapshotSourceNote = "isolated fixture",
            ),
        )
    }

    @AfterEach
    fun cleanup() {
        if (::mongo.isInitialized && ::database.isInitialized && database.startsWith("beta_test_")) TestMongo.dropDatabase(client, database)
        if (::client.isInitialized) client.close()
    }

    private fun newService(notificationService: NotificationService, capacityHardLimit: Int = 100_000): BetaService =
        BetaService(mongo, transactions, users, notificationService, authorization, audit, time, id, false, capacityHardLimit)

    private fun campaign(): BetaCampaign = checkNotNull(mongo.findById(id, BetaCampaign::class.java))
    private fun addShare(vararg ids: String) {
        ids.forEach { mongo.save(BetaSnapshotEntry(campaignId = id, snapshotId = "frozen-v1", userId = it, capturedAt = time.instant())) }
    }
    private fun entry(userId: String): BetaEnrollment =
        checkNotNull(mongo.findOne(Query(Criteria.where("campaignId").`is`(id).and("userId").`is`(userId)), BetaEnrollment::class.java))
    private fun assertCounts(active: Int, reserved: Int) {
        val c = campaign()
        c.checkQuota()
        assertEquals(active, c.grantedCount)
        assertEquals(reserved, c.reservedRemaining)
        assertEquals(
            active.toLong(),
            mongo.count(Query(Criteria.where("status").`is`(BetaEnrollmentStatus.ACTIVE)), BetaEnrollment::class.java),
        )
    }
    private fun fillPublic() {
        repeat(75) { service.join("public-$it", request) }
    }
    private fun seedPublic(count: Int) {
        val c = campaign()
        repeat(count) { number ->
            mongo.save(
                BetaEnrollment(
                    campaignId = id, userId = "seed-$number", status = BetaEnrollmentStatus.ACTIVE,
                    shareSnapshotEligible = false, snapshotId = "frozen-v1", queueSequence = number.toLong() + 1,
                    joinedAt = time.instant(), grantedAt = time.instant(), slotPool = BetaSlotPool.PUBLIC,
                    acceptedRulesVersion = "v1",
                ),
            )
        }
        c.grantedCount = count
        c.nextQueueSequence = count.toLong()
        mongo.save(c)
    }
    private fun version(): Long = campaign().configVersion

    private fun submitWithReconciliation(target: BetaService, userId: String) {
        repeat(8) {
            try {
                target.join(userId, request)
                return
            } catch (error: BetaApiException) {
                if (error.code != "beta_temporarily_unavailable") throw error
                // Production also returns a bounded-retry 503 under contention. The client checks durable state first.
                val state = target.me(userId).enrollmentStatus
                if (state == "ACTIVE" || state == "WAITING") return
                Thread.sleep(40)
            }
        }
        throw IllegalStateException("Could not submit the fixture within the retry budget")
    }

    @Test
    fun `public fills 75 while Share reservation remains separate and newer users wait`() {
        fillPublic()
        assertCounts(75, 25)
        assertEquals("WAITING", service.join("new-share-account-not-in-snapshot", request).enrollmentStatus)
        addShare("old-share")
        val old = service.join("old-share", request)
        assertEquals(BetaSlotPool.SHARE_RESERVED, old.slotPool)
        assertCounts(76, 24)
        assertEquals(0, service.status().publicRemaining)
    }

    @Test
    fun `25 is a pooled reservation and not the Share percentage ceiling`() {
        val ids = (1..26).map { "share-$it" }
        addShare(*ids.toTypedArray())
        ids.forEach { service.join(it, request) }
        assertCounts(26, 0)
        assertEquals(BetaSlotPool.PUBLIC, entry("share-26").slotPool)
        assertEquals(25, campaign().reservedGrantedCount)
    }

    @Test
    fun `deadline releases only nine places once and serves existing FIFO first`() {
        fillPublic()
        repeat(16) {
            addShare("s-$it")
            service.join("s-$it", request)
        }
        repeat(12) { service.join("wait-$it", request) }
        assertCounts(91, 9)
        time.set(campaign().reservedUntil)
        service.maintain()
        assertCounts(100, 0)
        assertEquals(9, campaign().releasedCount)
        repeat(9) { assertEquals(BetaEnrollmentStatus.ACTIVE, entry("wait-$it").status) }
        assertEquals(BetaEnrollmentStatus.WAITING, entry("wait-9").status)
        service.maintain()
        assertEquals(9, campaign().releasedCount)
        assertEquals(100, campaign().capacity)
        assertEquals("WAITING", service.join("late-newcomer", request).enrollmentStatus)
    }

    @Test
    fun `pause accepts queue but never grants and does not renew deadline`() {
        service.setAdmissions("admin", true, "pause testing", version())
        addShare("s")
        assertEquals("WAITING", service.join("s", request).enrollmentStatus)
        assertCounts(0, 25)
        time.set(campaign().reservedUntil)
        service.maintain()
        assertCounts(0, 0)
        service.setAdmissions("admin", false, "resume testing", version())
        assertEquals(BetaSlotPool.PUBLIC, entry("s").slotPool)
        assertCounts(1, 0)
    }

    @Test
    fun `custom absolute expansion 100 to 2000 preserves initial reservation and FIFO`() {
        fillPublic()
        repeat(8) { service.join("queued-$it", request) }
        service.setCapacity("admin", 120, "first expansion", version())
        assertCounts(83, 25)
        repeat(8) { assertEquals(BetaEnrollmentStatus.ACTIVE, entry("queued-$it").status) }
        assertEquals(25, campaign().reservedInitial)
        service.setCapacity("admin", 120, "idempotent target", version())
        assertEquals(120, campaign().capacity)
        service.setCapacity("admin", 237, "second expansion", version())
        assertEquals(237, campaign().capacity)
        service.setCapacity("admin", 1000, "third expansion", version())
        assertEquals(1000, campaign().capacity)
        // Growth never re-derives the Share reservation: it stays at the frozen initial 25.
        assertEquals(25, campaign().reservedInitial)
        assertEquals(25, campaign().reservedRemaining)
        service.setCapacity("admin", 2000, "fourth expansion", version())
        assertEquals(2000, campaign().capacity)
        assertThrows(BetaApiException::class.java) { service.setCapacity("admin", 800, "invalid shrink", version()) }
        assertThrows(BetaApiException::class.java) { service.setCapacity("admin", 100_001, "over system hard limit", version()) }
    }

    @Test
    fun `legacy campaign storing a removed maxCapacity field can expand far beyond it`() {
        fillPublic()
        // Deployments created before the capacity change still have `maxCapacity: 200` in Mongo.
        val collection = mongo.getCollection("hub_beta_campaign")
        collection.updateOne(
            org.bson.Document("_id", id),
            org.bson.Document("$" + "set", org.bson.Document("maxCapacity", 200)),
        )
        assertEquals(200, (checkNotNull(collection.find(org.bson.Document("_id", id)).first())["maxCapacity"] as Number).toInt())
        service.setCapacity("admin", 1000, "legacy field must not block growth", version())
        assertEquals(1000, campaign().capacity)
        val raw = checkNotNull(collection.find(org.bson.Document("_id", id)).first())
        assertEquals(1000, (raw["capacity"] as Number).toInt())
        // The unmapped legacy field is dropped by the next runtime write, so it can never resurface.
        assertFalse(raw.containsKey("maxCapacity"))
    }

    @Test
    fun `withdraw is idempotent rejoin gets a new tail and ACTIVE cannot free a slot`() {
        service.setAdmissions("admin", true, "pause for queue", version())
        service.join("first", request)
        service.join("second", request)
        val oldSequence = entry("first").queueSequence
        service.withdraw("first")
        service.withdraw("first")
        service.join("first", request)
        assertTrue(entry("first").queueSequence > oldSequence)
        assertTrue(entry("first").queueSequence > entry("second").queueSequence)
        service.setAdmissions("admin", false, "resume queue", version())
        assertThrows(BetaApiException::class.java) { service.withdraw("first") }
        assertCounts(2, 25)
    }

    @Test
    fun `duplicate concurrent requests keep one membership one grant one notification`() {
        val pool = Executors.newFixedThreadPool(5)
        try {
            val futures = pool.invokeAll((1..20).map { Callable { submitWithReconciliation(service, "one-user") } })
            futures.forEach { it.get(30, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }
        service.maintain()
        assertCounts(1, 25)
        assertEquals(1L, mongo.count(Query(), BetaEnrollment::class.java))
        assertEquals(1L, mongo.count(Query(), Notification::class.java))
        assertEquals(1L, campaign().nextQueueSequence)
    }

    @Test
    fun `two independent service instances cannot oversell the final public slot`() {
        seedPublic(74)
        val other = newService(notifications)
        val pool = Executors.newFixedThreadPool(4)
        try {
            val futures = pool.invokeAll(
                (1..12).map { number ->
                    Callable {
                        submitWithReconciliation(if (number % 2 == 0) other else service, "racer-$number")
                    }
                },
            )
            futures.forEach { it.get(30, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }
        service.maintain()
        assertCounts(75, 25)
        assertEquals(11L, mongo.count(Query(Criteria.where("status").`is`(BetaEnrollmentStatus.WAITING)), BetaEnrollment::class.java))
    }

    @Test
    fun `notification failure rolls back allocation but keeps durable enrollment to retry`() {
        val failing = mockk<NotificationService>()
        every { failing.create(any(), any(), any(), any(), any(), any()) } throws IllegalStateException("injected notification failure")
        val error = assertThrows(BetaApiException::class.java) { newService(failing).join("rollback", request) }
        assertEquals("beta_temporarily_unavailable", error.code)
        assertCounts(0, 25)
        assertEquals(BetaEnrollmentStatus.WAITING, entry("rollback").status)
        assertEquals(0L, mongo.count(Query(), Notification::class.java))
        service.maintain()
        assertCounts(1, 25)
        assertEquals(1L, mongo.count(Query(), Notification::class.java))
    }

    @Test
    fun `disabled queue member does not block later accounts and account errors do not consume slots`() {
        service.setAdmissions("admin", true, "pause queue", version())
        service.join("disabled", request)
        service.join("valid", request)
        every { users.get("disabled") } returns MaaUserInfo("disabled", "disabled", false)
        service.setAdmissions("admin", false, "resume queue", version())
        assertCounts(1, 25)
        assertEquals(BetaEnrollmentStatus.WITHDRAWN, entry("disabled").status)
        assertEquals(BetaEnrollmentStatus.ACTIVE, entry("valid").status)
    }

    @Test
    fun `CLOSED and missing campaign fail closed while OPEN admits without fake ACTIVE rows`() {
        service.join("member", request)
        service.setMode("admin", BetaMode.CLOSED, "maintenance", version())
        assertFalse(service.me("member").canUseBetaFeatures)
        assertEquals("beta_service_closed", assertThrows(BetaApiException::class.java) { service.requireAccess("member") }.code)
        service.setMode("admin", BetaMode.OPEN, "public launch", version())
        assertTrue(service.me("never-joined").canUseBetaFeatures)
        assertEquals("NOT_JOINED", service.me("never-joined").enrollmentStatus)
        assertCounts(1, 25)
        service.setMode("admin", BetaMode.CLOSED, "public maintenance", version())
        assertThrows(BetaApiException::class.java) { service.setMode("admin", BetaMode.BETA, "illegal reversal", version()) }
        assertNotNull(campaign().publicOpenedAt)
        mongo.remove(Query(), BetaCampaign::class.java)
        assertEquals(BetaMode.CLOSED, service.status().accessMode)
        assertThrows(BetaApiException::class.java) { service.requireAccess("member") }
    }

    @Test
    fun `rules consent start and management version are validated without consuming quota`() {
        assertEquals(
            "beta_terms_required",
            assertThrows(BetaApiException::class.java) {
                service.join("a", request.copy(acceptedTerms = false))
            }.code,
        )
        assertEquals(
            "beta_rules_changed",
            assertThrows(BetaApiException::class.java) {
                service.join("a", request.copy(rulesVersion = "old"))
            }.code,
        )
        assertThrows(BetaApiException::class.java) { service.setCapacity("admin", 150, "stale version", 999) }
        val c = campaign()
        time.set(c.startsAt.minusMillis(1))
        assertEquals("NOT_STARTED", service.status().publicState)
        assertThrows(BetaApiException::class.java) { service.join("a", request) }
        assertCounts(0, 25)
        assertEquals(0L, mongo.count(Query(), AdminAuditLog::class.java))
    }

    @Test
    fun `unfinished snapshot belongs to preparation and cannot be altered by runtime maintenance or admin writes`() {
        mongo.save(campaign().copy(snapshotStatus = BetaSnapshotStatus.BUILDING, snapshotLockedAt = null))
        val collection = mongo.getCollection("hub_beta_campaign")
        collection.updateOne(
            org.bson.Document("_id", id),
            org.bson.Document("$" + "set", org.bson.Document("preparationOwner", "import-process")),
        )
        service.maintain()
        assertThrows(BetaApiException::class.java) { service.join("not-yet", request) }
        assertThrows(BetaApiException::class.java) {
            service.setMode("admin", BetaMode.OPEN, "cannot skip snapshot", version())
        }
        val raw = checkNotNull(collection.find(org.bson.Document("_id", id)).first())
        assertEquals("import-process", raw.getString("preparationOwner"))
        assertEquals("BUILDING", raw.getString("snapshotStatus"))
        assertEquals(0L, (raw["allocationRevision"] as Number).toLong())
        assertCounts(0, 25)
    }

    @Test
    fun `local test mode uses isolated campaign simulates snapshot eligibility and can reset`() {
        val formalBefore = campaign().copy()
        val localId = "yuanhub-beta-local-test"
        val localService = BetaService(
            mongo,
            transactions,
            users,
            notifications,
            authorization,
            audit,
            time,
            localId,
            localTestMode = true,
        )

        localService.onReady()
        val localStatus = localService.status()
        assertTrue(localStatus.localTestMode)
        assertEquals(localId, localStatus.campaignId)
        assertEquals(BetaMode.BETA, localStatus.accessMode)
        assertFalse(localStatus.admissionsPaused)
        assertEquals("OPEN_REGISTRATION", localStatus.publicState)

        val joined = localService.join("local-user", BetaJoinRequest(localId, "v1", true, true))
        assertEquals("ACTIVE", joined.enrollmentStatus)
        assertEquals(BetaSlotPool.SHARE_RESERVED, joined.slotPool)
        assertTrue(joined.shareSnapshotEligible)

        val reset = localService.resetLocal("admin", "repeat local flow")
        assertEquals(0, reset.campaign.grantedCount)
        assertEquals(25, reset.campaign.reservedRemaining)
        assertEquals(BetaMode.BETA, reset.campaign.accessMode)
        assertFalse(reset.campaign.admissionsPaused)
        assertEquals(
            0L,
            mongo.count(
                Query(Criteria.where("campaignId").`is`(localId)),
                BetaEnrollment::class.java,
            ),
        )

        val formalAfter = campaign()
        assertEquals(formalBefore.snapshotId, formalAfter.snapshotId)
        assertEquals(formalBefore.grantedCount, formalAfter.grantedCount)
        assertEquals(formalBefore.configVersion, formalAfter.configVersion)
    }

    private class TestClock(initial: Instant) : Clock() {
        private val value = AtomicReference(initial)
        fun set(instant: Instant) {
            value.set(instant)
        }
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = value.get()
    }
}
