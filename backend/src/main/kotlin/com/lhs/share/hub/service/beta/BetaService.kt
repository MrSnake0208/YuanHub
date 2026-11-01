package com.lhs.share.hub.service.beta

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.beta.BetaAdminResponse
import com.lhs.share.hub.controller.beta.BetaJoinRequest
import com.lhs.share.hub.controller.beta.BetaMeResponse
import com.lhs.share.hub.controller.beta.BetaStatusResponse
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminAuditSnapshot
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
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.service.UserService
import com.mongodb.MongoException
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant

/** One campaign document serializes every mutation; no Redis quota or process-local lock. */
@Service
class BetaService(
    @param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
    private val users: UserService,
    private val notifications: NotificationService,
    private val authorization: AdminAuthorizationService,
    private val audit: AdminAuditService,
    @param:Qualifier("betaClock") private val clock: Clock,
    @param:Value("\${share.beta.campaign-id:yuanhub-beta-202609}") val campaignId: String,
    @param:Value("\${share.beta.local-test-mode:false}") val localTestMode: Boolean = false,
    /** Operator-facing system safety limit, not a per-campaign product ceiling. */
    @param:Value("\${share.beta.capacity-hard-limit:100000}") val capacityHardLimit: Int = 100_000,
) {
    private val log = KotlinLogging.logger { }

    init {
        check(!localTestMode || campaignId.startsWith(LOCAL_CAMPAIGN_PREFIX)) {
            "Local beta mode requires an isolated local campaign id"
        }
    }

    @Volatile private var lastMaintenanceAt: Instant? = null

    @Volatile private var lastMaintenanceError: String? = null

    private fun current(): BetaCampaign? = mongo.findById(campaignId, BetaCampaign::class.java)
    private fun campaignOrClosed(): BetaCampaign = current() ?: BetaCampaign(id = campaignId)
    private fun enrollment(userId: String): BetaEnrollment? = mongo.findOne(
        Query(Criteria.where("campaignId").`is`(campaignId).and("userId").`is`(userId)),
        BetaEnrollment::class.java,
    )
    private fun waiting(): Query = Query(Criteria.where("campaignId").`is`(campaignId).and("status").`is`(BetaEnrollmentStatus.WAITING))
    private fun eligible(campaign: BetaCampaign, userId: String): Boolean {
        if (!campaign.ready()) return false
        if (localTestMode) return true
        return mongo.exists(
            Query(Criteria.where("campaignId").`is`(campaignId).and("snapshotId").`is`(campaign.snapshotId).and("userId").`is`(userId)),
            BetaSnapshotEntry::class.java,
        )
    }
    private fun requireActiveAccount(userId: String) {
        if (users.get(userId)?.activated != true) {
            throw ApiResultException(401, "账号不可用，请重新登录或联系管理员")
        }
    }

    private fun detachAdminFromBetaQuota(userId: String) {
        val existing = enrollment(userId) ?: return
        if (existing.status !in setOf(BetaEnrollmentStatus.WAITING, BetaEnrollmentStatus.ACTIVE)) return
        if (current()?.ready() != true) return
        try {
            val changed = mutate { c, now ->
                val entry = enrollment(userId) ?: return@mutate false
                if (entry.status == BetaEnrollmentStatus.WITHDRAWN) return@mutate false
                if (entry.status == BetaEnrollmentStatus.ACTIVE) {
                    c.grantedCount -= 1
                    if (entry.slotPool == BetaSlotPool.SHARE_RESERVED) {
                        c.reservedGrantedCount -= 1
                        if (now < c.reservedUntil) c.reservedRemaining += 1 else c.releasedCount += 1
                    }
                }
                entry.status = BetaEnrollmentStatus.WITHDRAWN
                entry.withdrawnAt = now
                entry.withdrawReason = "ADMIN_BYPASS"
                mongo.save(entry)
                true
            }
            if (changed) allocate("ADMIN_BYPASS")
        } catch (e: Exception) {
            log.warn { "failed to detach admin from beta quota: ${e.javaClass.simpleName}" }
        }
    }

    fun status(): BetaStatusResponse = safely { statusOf(campaignOrClosed(), clock.instant()) }

    private fun statusOf(c: BetaCampaign, now: Instant): BetaStatusResponse {
        val remaining = c.publicRemaining(now)
        val state = when {
            c.accessMode == BetaMode.OPEN -> "OPEN_ACCESS"
            c.accessMode == BetaMode.CLOSED || !c.ready() -> "CLOSED"
            now < c.startsAt -> "NOT_STARTED"
            c.admissionsPaused -> "PAUSED"
            remaining > 0 && mongo.exists(waiting(), BetaEnrollment::class.java) -> "ALLOCATION_PENDING"
            remaining > 0 -> "OPEN_REGISTRATION"
            c.effectiveReserved(now) > 0 -> "PUBLIC_FULL_RESERVED_REMAIN"
            else -> "FULL"
        }
        return BetaStatusResponse(
            campaignId = c.id, accessMode = c.accessMode, admissionsPaused = c.admissionsPaused,
            pauseReason = c.pauseReason, startsAt = c.startsAt, reservedUntil = c.reservedUntil,
            serverNow = now, announcementTimezone = c.announcementTimezone, snapshotAt = c.snapshotAt,
            rulesVersion = c.rulesVersion, initialCapacity = c.initialCapacity, capacity = c.capacity,
            maxCapacity = capacityHardLimit,
            reservedInitial = c.reservedInitial,
            reservedRemaining = c.effectiveReserved(now), grantedCount = c.grantedCount,
            publicRemaining = remaining, publicState = state, localTestMode = localTestMode,
        )
    }

    fun me(userId: String): BetaMeResponse = safely {
        requireActiveAccount(userId)
        val adminBypass = authorization.hasAnyAdminCapability(userId)
        if (adminBypass) detachAdminFromBetaQuota(userId)
        val c = campaignOrClosed()
        val now = clock.instant()
        val entry = if (adminBypass) null else enrollment(userId)
        val status = statusOf(c, now)
        val canUseDuringBeta = c.accessMode == BetaMode.BETA &&
            c.ready() &&
            now >= c.startsAt &&
            entry?.status == BetaEnrollmentStatus.ACTIVE
        val canUse = adminBypass || c.accessMode == BetaMode.OPEN || canUseDuringBeta
        val isWaiting = entry?.status == BetaEnrollmentStatus.WAITING
        val next = when {
            canUse -> "ENTER"
            c.accessMode != BetaMode.BETA || !c.ready() || now < c.startsAt -> "NONE"
            isWaiting -> "VIEW_WAITLIST"
            else -> "JOIN"
        }
        BetaMeResponse(
            campaign = status, campaignId = c.id, accessMode = c.accessMode, serverNow = now,
            enrollmentStatus = entry?.status?.name ?: "NOT_JOINED",
            shareSnapshotEligible = if (adminBypass) false else entry?.shareSnapshotEligible ?: eligible(c, userId),
            slotPool = entry?.slotPool, joinedAt = entry?.joinedAt, grantedAt = entry?.grantedAt,
            waitReason = if (isWaiting) status.publicState else null,
            nextAction = next, canUseBetaFeatures = canUse,
            canResetLocalTest = localTestMode,
        )
    }

    /** Called afresh for JWT requests and BOTH OpenAPI token authentication branches. */
    fun requireAccess(userId: String) = safely {
        requireActiveAccount(userId)
        if (authorization.hasAnyAdminCapability(userId)) {
            detachAdminFromBetaQuota(userId)
            return@safely
        }
        val c = campaignOrClosed()
        if (c.accessMode == BetaMode.OPEN) return@safely
        if (c.accessMode != BetaMode.BETA || !c.ready() || clock.instant() < c.startsAt) {
            fail(HttpStatus.FORBIDDEN, "beta_service_closed", "内测功能暂未开放或正在维护，账号和反馈入口仍可使用。")
        }
        if (enrollment(userId)?.status != BetaEnrollmentStatus.ACTIVE) {
            fail(HttpStatus.FORBIDDEN, "beta_access_required", "请先报名本轮内测，名额已满时可登记候补。")
        }
    }

    fun join(userId: String, request: BetaJoinRequest): BetaMeResponse = safely {
        requireActiveAccount(userId)
        if (authorization.hasAnyAdminCapability(userId)) {
            detachAdminFromBetaQuota(userId)
            return@safely me(userId)
        }
        if (!request.acceptedTerms || !request.acceptWaitlist) {
            fail(HttpStatus.BAD_REQUEST, "beta_terms_required", "请确认测试须知及满额后自动候补。")
        }
        if (request.intentTags.size > INTENT_TAGS.size || !INTENT_TAGS.containsAll(request.intentTags)) {
            fail(HttpStatus.BAD_REQUEST, "beta_intent_invalid", "请选择有效的体验方向。")
        }
        mutate { c, now ->
            if (request.campaignId != c.id || request.rulesVersion != c.rulesVersion) {
                fail(HttpStatus.CONFLICT, "beta_rules_changed", "本轮说明已更新，请重新阅读后报名。")
            }
            val existing = enrollment(userId)
            // Idempotent even if registration has since been paused or the service closed.
            if (existing?.status in setOf(BetaEnrollmentStatus.ACTIVE, BetaEnrollmentStatus.WAITING) || c.accessMode == BetaMode.OPEN) {
                return@mutate
            }
            if (c.accessMode != BetaMode.BETA || !c.ready() || now < c.startsAt) {
                fail(HttpStatus.CONFLICT, "beta_not_started", "本轮尚未开放报名，请查看开放说明。")
            }
            c.nextQueueSequence += 1
            val entry = existing?.copy(
                status = BetaEnrollmentStatus.WAITING,
                queueSequence = c.nextQueueSequence,
                joinedAt = now,
                acceptedRulesVersion = c.rulesVersion,
                acceptedAt = now,
                intentTags = request.intentTags,
                withdrawnAt = null,
                withdrawReason = null,
            ) ?: BetaEnrollment(
                campaignId = c.id,
                userId = userId,
                shareSnapshotEligible = eligible(c, userId),
                snapshotId = c.snapshotId,
                queueSequence = c.nextQueueSequence,
                joinedAt = now,
                acceptedRulesVersion = c.rulesVersion,
                intentTags = request.intentTags,
            )
            mongo.save(entry)
        }
        allocate("JOIN")
        me(userId)
    }

    fun withdraw(userId: String): BetaMeResponse = safely {
        requireActiveAccount(userId)
        if (authorization.hasAnyAdminCapability(userId)) {
            detachAdminFromBetaQuota(userId)
            return@safely me(userId)
        }
        mutate { _, now ->
            val entry = enrollment(userId) ?: return@mutate
            if (entry.status == BetaEnrollmentStatus.ACTIVE) {
                fail(HttpStatus.CONFLICT, "beta_state_conflict", "已开通的资格不能通过取消候补回收。")
            }
            if (entry.status == BetaEnrollmentStatus.WAITING) {
                entry.status = BetaEnrollmentStatus.WITHDRAWN
                entry.withdrawnAt = now
                entry.withdrawReason = "USER_CANCELLED"
                mongo.save(entry)
            }
        }
        me(userId)
    }

    /** At most 50 short transactions. A later join never jumps an already durable queue entry. */
    internal fun allocate(trigger: String): Int {
        var granted = 0
        repeat(50) {
            val progressed = mutate { c, now ->
                if (!c.canAllocate(now)) return@mutate false
                val reserved = if (c.reservedRemaining > 0) {
                    mongo.findOne(
                        waiting().addCriteria(Criteria.where("shareSnapshotEligible").`is`(true))
                            .with(Sort.by(Sort.Direction.ASC, "queueSequence")),
                        BetaEnrollment::class.java,
                    )
                } else {
                    null
                }
                val candidate = reserved ?: if (c.publicRemaining(now) > 0) {
                    mongo.findOne(
                        waiting().with(Sort.by(Sort.Direction.ASC, "queueSequence")),
                        BetaEnrollment::class.java,
                    )
                } else {
                    null
                }
                if (candidate == null) return@mutate false
                if (users.get(candidate.userId)?.activated != true) {
                    candidate.status = BetaEnrollmentStatus.WITHDRAWN
                    candidate.withdrawnAt = now
                    candidate.withdrawReason = "ACCOUNT_UNAVAILABLE"
                    mongo.save(candidate)
                    return@mutate true
                }
                if (authorization.hasAnyAdminCapability(candidate.userId)) {
                    candidate.status = BetaEnrollmentStatus.WITHDRAWN
                    candidate.withdrawnAt = now
                    candidate.withdrawReason = "ADMIN_BYPASS"
                    mongo.save(candidate)
                    return@mutate true
                }
                val pool = if (reserved != null) BetaSlotPool.SHARE_RESERVED else BetaSlotPool.PUBLIC
                c.grantedCount += 1
                if (pool == BetaSlotPool.SHARE_RESERVED) {
                    c.reservedRemaining -= 1
                    c.reservedGrantedCount += 1
                }
                candidate.status = BetaEnrollmentStatus.ACTIVE
                candidate.slotPool = pool
                candidate.grantTrigger = trigger
                candidate.grantedAt = now
                mongo.save(candidate)
                // Reuses the existing repository/service, on the same Hub transaction resource.
                notifications.create(
                    candidate.userId,
                    "BETA_GRANTED",
                    "YuanHub 内测资格已开通",
                    "你已获得本轮体验资格。可前往内测页面查看状态并开始体验。",
                    "BETA",
                    c.id,
                )
                true
            }
            if (!progressed) return granted
            granted += 1
        }
        return granted
    }

    fun admin(actor: String): BetaAdminResponse = safely {
        authorization.requirePermission(actor, AdminPermission.BETA_MANAGE)
        val existing = current()
        val c = existing ?: BetaCampaign(campaignId)
        BetaAdminResponse(
            campaign = statusOf(c, clock.instant()), configured = existing != null, configVersion = c.configVersion,
            capacityHardLimit = capacityHardLimit,
            reservedGrantedCount = c.reservedGrantedCount, publicGrantedCount = c.grantedCount - c.reservedGrantedCount,
            releasedCount = c.releasedCount, releasedAt = c.releasedAt,
            waitingCount = mongo.count(waiting(), BetaEnrollment::class.java), snapshotId = c.snapshotId,
            snapshotStatus = c.snapshotStatus, snapshotLockedAt = c.snapshotLockedAt, snapshotCount = c.snapshotCount,
            snapshotSourceNote = c.snapshotSourceNote, publicOpenedAt = c.publicOpenedAt,
            lastMaintenanceAt = lastMaintenanceAt, lastMaintenanceError = lastMaintenanceError,
        )
    }

    fun setAdmissions(actor: String, paused: Boolean, reason: String, version: Long): BetaAdminResponse =
        change(actor, reason, version, "RESUME") { c, _ ->
            c.admissionsPaused = paused
            c.pauseReason = if (paused) reason.trim() else null
        }

    fun setCapacity(actor: String, capacity: Int, reason: String, version: Long): BetaAdminResponse =
        change(actor, reason, version, "EXPAND") { c, _ ->
            if (capacity < c.capacity) {
                fail(HttpStatus.UNPROCESSABLE_ENTITY, "beta_capacity_invalid", "目标容量不能低于当前容量（当前 ${c.capacity} 人）。")
            }
            if (capacity > capacityHardLimit) {
                fail(HttpStatus.UNPROCESSABLE_ENTITY, "beta_capacity_invalid", "目标容量超过系统安全上限（最多 $capacityHardLimit 人）。")
            }
            c.capacity = capacity
        }

    fun setMode(actor: String, mode: BetaMode, reason: String, version: Long): BetaAdminResponse =
        change(actor, reason, version, "RESUME") { c, now ->
            if (mode == BetaMode.BETA && (!c.ready() || c.publicOpenedAt != null)) {
                fail(HttpStatus.CONFLICT, "beta_state_conflict", "须先锁定快照；正式开放后不能回到旧内测配额。")
            }
            if (mode == BetaMode.OPEN && c.publicOpenedAt == null) c.publicOpenedAt = now
            c.accessMode = mode
        }

    fun resetLocal(actor: String, reason: String): BetaAdminResponse = safely {
        authorization.requirePermission(actor, AdminPermission.BETA_MANAGE)
        performLocalReset(actor, requireLocalResetReason(reason))
        admin(actor)
    }

    /**
     * Local test mode only. The isolated local campaign is a sandbox, so any activated tester
     * account may wipe it and immediately re-test; the production campaign is never reachable here.
     */
    fun resetLocalSelf(userId: String): BetaMeResponse = safely {
        requireActiveAccount(userId)
        performLocalReset(userId, SELF_RESET_REASON)
        me(userId)
    }

    private fun requireLocalResetReason(reason: String): String {
        val normalized = reason.trim()
        if (normalized.length !in 2..300) {
            fail(HttpStatus.BAD_REQUEST, "beta_reason_required", "请填写 2～300 字的变更原因。")
        }
        return normalized
    }

    private fun performLocalReset(actor: String, reason: String) {
        if (!localTestMode) {
            fail(HttpStatus.NOT_FOUND, "beta_local_test_disabled", "当前后端未启用本地内测模式。")
        }
        val now = clock.instant()
        checkNotNull(
            transactions.execute {
                val before = current() ?: buildLocalCampaign(now)
                mongo.remove(
                    Query(Criteria.where("campaignId").`is`(campaignId)),
                    BetaEnrollment::class.java,
                )
                mongo.remove(
                    Query(Criteria.where("campaignId").`is`(campaignId)),
                    BetaSnapshotEntry::class.java,
                )
                mongo.remove(
                    Query(Criteria.where("kind").`is`("BETA_GRANTED").and("refId").`is`(campaignId)),
                    Notification::class.java,
                )
                val reset = buildLocalCampaign(now).copy(
                    configVersion = before.configVersion + 1,
                    allocationRevision = before.allocationRevision + 1,
                )
                mongo.save(reset)
                audit.record(
                    AdminAuditLog(
                        actorUserId = actor,
                        action = AdminAuditAction.BETA_UPDATED,
                        targetResource = "beta:${reset.id}",
                        before = auditSnapshot(before),
                        after = auditSnapshot(reset, reason),
                        occurredAt = now,
                    ),
                )
                true
            },
        )
    }

    private fun change(
        actor: String,
        reason: String,
        version: Long,
        trigger: String,
        update: (BetaCampaign, Instant) -> Unit,
    ): BetaAdminResponse = safely {
        authorization.requirePermission(actor, AdminPermission.BETA_MANAGE)
        if (reason.trim().length !in 2..300) fail(HttpStatus.BAD_REQUEST, "beta_reason_required", "请填写 2～300 字的变更原因。")
        mutate { c, now ->
            if (version != c.configVersion) fail(HttpStatus.CONFLICT, "beta_config_conflict", "配置已更新，请刷新后重试。")
            val before = auditSnapshot(c)
            update(c, now)
            c.configVersion += 1
            audit.record(
                AdminAuditLog(
                    actorUserId = actor,
                    action = AdminAuditAction.BETA_UPDATED,
                    targetResource = "beta:${c.id}",
                    before = before,
                    after = auditSnapshot(c, reason.trim()),
                    occurredAt = now,
                ),
            )
        }
        allocate(trigger)
        admin(actor)
    }

    private fun auditSnapshot(c: BetaCampaign, reason: String? = null): AdminAuditSnapshot = AdminAuditSnapshot(
        beta = mapOf(
            "access_mode" to c.accessMode.name,
            "capacity" to c.capacity.toString(),
            "admissions_paused" to c.admissionsPaused.toString(),
            "config_version" to c.configVersion.toString(),
            "reason" to reason.orEmpty(),
        ),
    )

    private fun buildLocalCampaign(now: Instant): BetaCampaign {
        val startsAt = now.minusSeconds(60)
        return BetaCampaign(
            id = campaignId,
            accessMode = BetaMode.BETA,
            admissionsPaused = false,
            pauseReason = null,
            startsAt = startsAt,
            reservedUntil = startsAt.plusSeconds(72 * 3600),
            snapshotId = LOCAL_SNAPSHOT_ID,
            snapshotStatus = BetaSnapshotStatus.READY,
            snapshotAt = now,
            snapshotLockedAt = now,
            snapshotCount = 0,
            snapshotSourceNote = "LOCAL TEST: all active accounts simulate frozen Share eligibility; formal beta data is isolated.",
            updatedAt = now,
        )
    }

    private fun ensureLocalCampaign() {
        if (!localTestMode || current() != null) return
        try {
            mongo.insert(buildLocalCampaign(clock.instant()))
        } catch (_: DuplicateKeyException) {
            // Another local instance initialized the same isolated campaign first.
        }
    }

    @EventListener(ApplicationReadyEvent::class)
    fun onReady() {
        ensureLocalCampaign()
        maintain()
    }

    @Scheduled(fixedDelay = 30_000, initialDelay = 30_000)
    fun maintain() {
        try {
            // Preparation owns BUILDING documents, including fields not mapped by this runtime entity.
            // Never save them from maintenance or erase the preparation ownership marker.
            if (current()?.ready() != true) return
            // Even while CLOSED/paused, releaseExpired runs before allocation eligibility checks.
            allocate("SCHEDULED")
            lastMaintenanceAt = clock.instant()
            lastMaintenanceError = null
        } catch (e: Exception) {
            lastMaintenanceAt = clock.instant()
            lastMaintenanceError = "名额维护暂时失败，已保留报名记录；请检查数据库与服务日志。"
            log.warn { "beta maintenance failed: ${e.javaClass.simpleName}" }
        }
    }

    private fun <T : Any> mutate(block: (BetaCampaign, Instant) -> T): T {
        for (attempt in 0..5) {
            try {
                return checkNotNull(
                    transactions.execute {
                        // A real write obtains the shared serialization point. Concurrent sessions conflict and retry.
                        val c = mongo.findAndModify(
                            Query(
                                Criteria.where("_id").`is`(campaignId)
                                    .and("snapshotStatus").`is`(BetaSnapshotStatus.READY),
                            ),
                            Update().inc("allocationRevision", 1),
                            FindAndModifyOptions.options().returnNew(true),
                            BetaCampaign::class.java,
                        ) ?: fail(HttpStatus.CONFLICT, "beta_not_initialized", "活动尚未配置，请等待开放说明。")
                        val now = clock.instant()
                        c.checkQuota()
                        c.releaseExpired(now)
                        val result = block(c, now)
                        c.checkQuota()
                        c.updatedAt = now
                        mongo.save(c)
                        result
                    },
                )
            } catch (e: Exception) {
                val causes = generateSequence<Throwable>(e) { it.cause }.toList()
                val mongoErrors = causes.filterIsInstance<MongoException>()
                // An uncertain commit may already have succeeded. Do NOT execute the body again here.
                if (mongoErrors.any { it.hasErrorLabel(MongoException.UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL) }) throw temporary()
                val retry = mongoErrors.any { it.hasErrorLabel(MongoException.TRANSIENT_TRANSACTION_ERROR_LABEL) || it.code == 112 } ||
                    causes.any { it is DuplicateKeyException }
                if (!retry) throw e
                if (attempt == 5) throw temporary()
                Thread.sleep((10L shl attempt) + (0L..15L).random())
            }
        }
        throw temporary()
    }

    private fun <T> safely(action: () -> T): T = try {
        action()
    } catch (e: BetaApiException) {
        throw e
    } catch (e: ApiResultException) {
        throw e
    } catch (e: Exception) {
        log.warn { "beta operation failed: ${e.javaClass.simpleName}" }
        throw temporary()
    }

    private fun temporary(): BetaApiException = BetaApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "beta_temporarily_unavailable",
        "状态暂时无法确认，请刷新本人状态后重试；不会因重试重复占用名额。",
    )
    private fun fail(status: HttpStatus, code: String, message: String): Nothing = throw BetaApiException(status, code, message)

    companion object {
        const val LOCAL_CAMPAIGN_PREFIX = "yuanhub-beta-local"
        const val LOCAL_SNAPSHOT_ID = "local-all-active"
        val INTENT_TAGS = setOf("MAAYUAN_SYNC", "INVENTORY_REWARDS", "GROWTH_PLANNER", "BOX_SHARE", "MOBILE_VIEW")
        const val SELF_RESET_REASON = "本地测试：账号自助重置"
    }
}
