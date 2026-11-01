package com.lhs.share.hub.controller.beta

import com.lhs.share.hub.repository.entity.BetaMode
import com.lhs.share.hub.repository.entity.BetaSlotPool
import com.lhs.share.hub.repository.entity.BetaSnapshotStatus
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class BetaJoinRequest(
    val campaignId: String = "",
    val rulesVersion: String = "",
    val acceptedTerms: Boolean = false,
    val acceptWaitlist: Boolean = false,
    val intentTags: Set<String> = emptySet(),
)

data class BetaAdmissionsRequest(val paused: Boolean, val reason: String, val expectedConfigVersion: Long)
data class BetaCapacityRequest(val capacity: Int, val reason: String, val expectedConfigVersion: Long)
data class BetaModeRequest(val accessMode: BetaMode, val reason: String, val expectedConfigVersion: Long)
data class BetaLocalResetRequest(val reason: String)

data class BetaStatusResponse(
    val campaignId: String,
    val accessMode: BetaMode,
    val admissionsPaused: Boolean,
    val pauseReason: String?,
    val startsAt: Instant,
    val reservedUntil: Instant,
    val serverNow: Instant,
    val announcementTimezone: String,
    val snapshotAt: Instant?,
    val rulesVersion: String,
    val initialCapacity: Int,
    val capacity: Int,
    @field:Schema(
        description = "Deprecated compatibility alias for the system capacity safety limit; not a per-campaign product ceiling.",
        deprecated = true,
    )
    val maxCapacity: Int = 100_000,
    val reservedInitial: Int,
    val reservedRemaining: Int,
    val grantedCount: Int,
    val publicRemaining: Int,
    val publicState: String,
    val localTestMode: Boolean = false,
)

/** Includes one authoritative campaign read, so UI never combines old CLOSED with new ACTIVE. */
data class BetaMeResponse(
    val campaign: BetaStatusResponse,
    val campaignId: String,
    val accessMode: BetaMode,
    val serverNow: Instant,
    val enrollmentStatus: String,
    val shareSnapshotEligible: Boolean,
    val slotPool: BetaSlotPool?,
    val joinedAt: Instant?,
    val grantedAt: Instant?,
    val waitReason: String?,
    val nextAction: String,
    val canUseBetaFeatures: Boolean,
    /** True only in local test mode, where the isolated local campaign may be self-reset. */
    val canResetLocalTest: Boolean = false,
)

data class BetaAdminResponse(
    val campaign: BetaStatusResponse,
    val configured: Boolean,
    val configVersion: Long,
    /** System safety limit for accidental extreme input, not this round's planned maximum. */
    val capacityHardLimit: Int,
    val reservedGrantedCount: Int,
    val publicGrantedCount: Int,
    val releasedCount: Int,
    val releasedAt: Instant?,
    val waitingCount: Long,
    val snapshotId: String?,
    val snapshotStatus: BetaSnapshotStatus,
    val snapshotLockedAt: Instant?,
    val snapshotCount: Long,
    val snapshotSourceNote: String,
    val publicOpenedAt: Instant?,
    val lastMaintenanceAt: Instant?,
    val lastMaintenanceError: String?,
)
