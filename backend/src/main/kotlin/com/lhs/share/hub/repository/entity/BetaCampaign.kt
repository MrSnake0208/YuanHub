package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class BetaMode { CLOSED, BETA, OPEN }
enum class BetaSnapshotStatus { EMPTY, BUILDING, READY }
enum class BetaEnrollmentStatus { WAITING, ACTIVE, WITHDRAWN }
enum class BetaSlotPool { SHARE_RESERVED, PUBLIC }

/** Only the preparation tool creates this document; absence always means CLOSED. */
@Document("hub_beta_campaign")
data class BetaCampaign(
    @Id val id: String,
    var accessMode: BetaMode = BetaMode.CLOSED,
    var publicOpenedAt: Instant? = null,
    var admissionsPaused: Boolean = true,
    var pauseReason: String? = null,
    val startsAt: Instant = Instant.EPOCH,
    val reservedUntil: Instant = startsAt.plusSeconds(72 * 3600),
    val initialCapacity: Int = 100,
    var capacity: Int = initialCapacity,
    val reservedInitial: Int = initialCapacity / 4,
    var reservedRemaining: Int = reservedInitial,
    var reservedGrantedCount: Int = 0,
    var releasedCount: Int = 0,
    var releasedAt: Instant? = null,
    var grantedCount: Int = 0,
    var nextQueueSequence: Long = 0,
    var allocationRevision: Long = 0,
    var configVersion: Long = 0,
    val snapshotId: String? = null,
    val snapshotStatus: BetaSnapshotStatus = BetaSnapshotStatus.EMPTY,
    val snapshotAt: Instant? = null,
    val snapshotLockedAt: Instant? = null,
    val snapshotCount: Long = 0,
    val snapshotSourceNote: String = "",
    val rulesVersion: String = "v1",
    val announcementTimezone: String = "Asia/Shanghai",
    var updatedAt: Instant = Instant.EPOCH,
) {
    fun effectiveReserved(now: Instant): Int = if (now >= reservedUntil) 0 else reservedRemaining
    fun publicRemaining(now: Instant): Int = capacity - grantedCount - effectiveReserved(now)
    fun ready(): Boolean = snapshotStatus == BetaSnapshotStatus.READY && snapshotLockedAt != null && snapshotId != null
    fun canAllocate(now: Instant): Boolean = accessMode == BetaMode.BETA && ready() && now >= startsAt && !admissionsPaused

    fun releaseExpired(now: Instant) {
        if (now >= reservedUntil && releasedAt == null) {
            releasedCount += reservedRemaining
            reservedRemaining = 0
            releasedAt = now
        }
    }

    fun checkQuota() {
        check(initialCapacity in 100..200 && initialCapacity % 4 == 0)
        // Capacity growth has no product ceiling. The only upper bound is the operator-facing
        // system safety limit enforced by BetaService.setCapacity; legacy documents that still
        // carry the removed `maxCapacity` field are simply unmapped and never consulted.
        check(capacity >= initialCapacity)
        check(reservedInitial == initialCapacity / 4)
        check(grantedCount >= 0 && reservedRemaining >= 0 && reservedGrantedCount >= 0 && releasedCount >= 0)
        check(grantedCount >= reservedGrantedCount && grantedCount + reservedRemaining <= capacity)
        check(reservedRemaining + reservedGrantedCount + releasedCount == reservedInitial)
        check(reservedUntil == startsAt.plusSeconds(72 * 3600))
        check(publicOpenedAt == null || accessMode != BetaMode.BETA)
    }
}
