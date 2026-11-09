package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.star.request.StarInventoryEntryRequest
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.controller.star.request.StarPlanInheritanceRequest
import com.lhs.share.hub.controller.star.request.StarStatePatchRequest
import com.lhs.share.hub.controller.star.request.StarStateRebuildRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceBagRequest
import com.lhs.share.hub.controller.star.request.StarWorkspaceExperienceRequest
import com.lhs.share.hub.repository.StarInventorySyncRepository
import com.lhs.share.hub.repository.StarPlanInheritancePendingRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.StarInventorySync
import com.lhs.share.hub.repository.entity.StarPlanInheritancePending
import com.lhs.share.hub.repository.entity.StarPlanInheritanceResolution
import com.lhs.share.hub.repository.entity.StarStateSnapshot
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

@Service
class StarInventorySyncService(
    private val receipts: StarInventorySyncRepository,
    private val pending: StarPlanInheritancePendingRepository,
    private val points: StarRecoveryPointRepository,
    private val accounts: SubAccountService,
    private val accountRepository: SubAccountRepository,
    private val states: StarStateService,
    private val events: AccountEventService,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun sync(userId: String, accountId: String, request: StarInventorySyncRequest): StarInventorySyncResponse =
        synchronize(userId, accountId, request)

    fun previewImport(
        userId: String,
        accountId: String,
        request: StarInventorySyncRequest,
        scope: StarInventoryImportScope,
    ): StarInventoryImportPreview {
        val account = accounts.requireAccount(userId, accountId)
        if (account.game != scope.game) conflict("star_sync_account_changed", "目标账号游戏版本已变化，请重新选择文件")
        validate(request, account.game)
        val existing = importReceipt(userId, accountId, request, scope.raw)
        if (existing == null &&
            pending.findByUserIdAndAccountId(userId, accountId)?.let { it.resolution == null } == true
        ) {
            conflict("star_plan_inheritance_pending", "旧养成计划仍待继承，请先在养成计划中确认继承或放弃，再重新导入")
        }
        val state = states.current(userId, accountId)
        return StarInventoryImportPreview(accountId, account.game, state.generation, state.revision, existing != null)
    }

    fun importInventory(
        userId: String,
        accountId: String,
        request: StarInventorySyncRequest,
        scope: StarInventoryImportScope,
    ): StarInventorySyncResponse {
        require(scope.generation != null && scope.revision != null)
        return synchronize(userId, accountId, request, scope)
    }

    // Raw OCR files have no upload scan_id. Match the complete normalized payload
    // against durable receipts, including older receipts, so an automatic success
    // cannot be replayed as a second manual rebuild. Stream only this owner's history.
    private fun importReceipt(userId: String, accountId: String, request: StarInventorySyncRequest, raw: Boolean): StarInventorySync? {
        val payload = mapper.readTree(mapper.writeValueAsString(request))
        receipts.findByUserIdAndAccountIdAndScanId(userId, accountId, request.scanId)?.let {
            if (mapper.readTree(it.payload) != payload) conflict("star_sync_scan_conflict", "同一扫描批次已保存不同内容")
            return it
        }
        if (!raw) return null
        val comparison = payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also {
            it.remove("scan_id")
            it.remove("scanId")
        }
        return receipts.findAllByUserIdAndAccountId(userId, accountId).use { history ->
            history.filter { item ->
                val stored = mapper.readTree(item.payload).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
                stored.remove("scan_id")
                stored.remove("scanId")
                stored == comparison
            }.findFirst().orElse(null)
        }
    }

    private fun synchronize(
        userId: String,
        accountId: String,
        request: StarInventorySyncRequest,
        scope: StarInventoryImportScope? = null,
    ): StarInventorySyncResponse {
        val account = accounts.requireAccount(userId, accountId)
        if (scope != null && account.game != scope.game) conflict("star_sync_account_changed", "目标账号游戏版本已变化，请重新选择文件")
        validate(request, account.game)
        val payload = mapper.writeValueAsString(request)
        fun existing(): StarInventorySyncResponse? = receipts.findByUserIdAndAccountIdAndScanId(userId, accountId, request.scanId)?.let {
            if (mapper.readTree(it.payload) != mapper.readTree(payload)) conflict("star_sync_scan_conflict", "同一扫描批次已保存不同内容")
            response(it)
        }
        fun manualExisting(): StarInventorySyncResponse? = if (scope?.raw == true) {
            importReceipt(userId, accountId, request, true)?.let(::response)
        } else {
            existing()
        }
        manualExisting()?.let { return it }
        // Capture the expected version before entering the transaction. Never retry a new
        // generation against a newer version after CAS failure.
        val before = states.current(userId, accountId)
        if (scope != null && (before.generation != scope.generation || before.revision != scope.revision)) {
            conflict("star_state_revision_conflict", "预览后云端背包已变化，请重新选择文件并确认")
        }
        return try {
            commit(userId, accountId, account.game, request, payload, before.generation, before.revision, ::manualExisting)
        } catch (error: InventoryApiException) {
            if (error.status == HttpStatus.CONFLICT) manualExisting() ?: throw error else throw error
        }
    }

    private fun commit(
        userId: String,
        accountId: String,
        game: String,
        request: StarInventorySyncRequest,
        payload: String,
        expectedGeneration: Long,
        expectedRevision: Long,
        existing: () -> StarInventorySyncResponse?,
    ): StarInventorySyncResponse = starCasConflictBoundary({
        conflict("star_state_revision_conflict", "背包或账号已变化，请重新读取后再同步")
    }) {
        checkNotNull(
            transactions.execute {
                existing()?.let { return@execute it }
                if (!accountRepository.fenceRecruitmentWrite(userId, accountId, game)) {
                    conflict("star_sync_account_changed", "绑定账号已变化，请重新连接")
                }
                if (pending.findByUserIdAndAccountId(userId, accountId)?.let { it.resolution == null } == true) {
                    conflict("star_plan_inheritance_pending", "旧养成计划仍待继承，暂不能用新扫描覆盖；旧计划来源已安全保留")
                }
                val result = states.rebuild(
                    userId,
                    accountId,
                    StarStateRebuildRequest(
                        expectedGeneration,
                        expectedRevision,
                        request.inventory.map {
                            StarInventoryEntryRequest(UUID.randomUUID().toString(), it.kind, it.name, it.quality, it.level)
                        },
                        emptyMap(),
                        StarWorkspaceExperienceRequest(request.experience.orange, request.experience.purple, request.experience.white),
                        request.bag ?: StarWorkspaceBagRequest(currentCount = request.inventory.size),
                        "pre_ocr_rebuild",
                    ),
                )
                val source = result.recoveryPoint?.let {
                    checkNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId(userId, accountId, it.recoveryPointId))
                }
                val levels = source?.state?.inventory.orEmpty().associate { it.instanceId to it.level }
                val unfinished = source?.state?.planTargets.orEmpty().any { (levels[it.instanceId] ?: Int.MAX_VALUE) < it.targetLevel }
                if (unfinished) {
                    checkNotNull(source)
                    points.save(source.copy(inheritanceProtected = true))
                    pending.save(
                        StarPlanInheritancePending(
                            "$userId:$accountId",
                            userId,
                            accountId,
                            source.recoveryPointId,
                            result.state.generation,
                            request.scanId,
                        ),
                    )
                }
                val receipt = receipts.insert(
                    StarInventorySync(
                        "$userId:$accountId:${request.scanId}", userId, accountId, request.scanId, payload,
                        result.state.generation, result.state.revision, source?.recoveryPointId, unfinished,
                    ),
                )
                events.publishChange(
                    userId,
                    accountId,
                    "star_inventory_synced",
                    mapOf("scan_id" to request.scanId, "generation" to receipt.generation, "inheritance_pending" to unfinished),
                )
                response(receipt)
            },
        )
    }

    fun status(userId: String, accountId: String, scanId: String): StarInventorySyncResponse {
        accounts.requireAccount(userId, accountId)
        return receipts.findByUserIdAndAccountIdAndScanId(userId, accountId, scanId)?.let(::response)
            ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "star_sync_not_found", "扫描批次尚未成功保存，可安全重试原批次")
    }

    fun inheritanceSource(userId: String, accountId: String): StarPlanInheritanceSource? {
        accounts.requireAccount(userId, accountId)
        val item = pending.findByUserIdAndAccountId(userId, accountId)?.takeIf { it.resolution == null } ?: return null
        val point = checkNotNull(points.findByUserIdAndAccountIdAndRecoveryPointId(userId, accountId, item.sourceRecoveryPointId))
        return StarPlanInheritanceSource(accountId, item.sourceRecoveryPointId, point.sourceGeneration, item.targetGeneration, point.state)
    }

    fun resolveInheritance(
        userId: String,
        accountId: String,
        action: String,
        request: StarPlanInheritanceRequest,
    ): StarPlanInheritanceResolutionResponse {
        val account = accounts.requireAccount(userId, accountId)
        if (action !in setOf("confirm", "discard") || request.expectedGeneration < 0 || request.expectedRevision < 0 ||
            !Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$").matches(request.operationId) ||
            request.sourceRecoveryPointId.isBlank() || request.sourceRecoveryPointId.length > 128 ||
            action == "confirm" && request.planTargets == null || action == "discard" && request.planTargets != null
        ) {
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_plan_inheritance_invalid", "计划处理请求无效")
        }
        val payload = mapper.writeValueAsString(request)
        return starCasConflictBoundary({ conflict("star_plan_inheritance_conflict", "账号、背包或待继承计划已变化，请重新读取") }) {
            checkNotNull(
                transactions.execute {
                    if (!accountRepository.fenceRecruitmentWrite(userId, accountId, account.game)) {
                        conflict("star_sync_account_changed", "绑定账号已变化，请重新加载")
                    }
                    val item = pending.findByUserIdAndAccountId(userId, accountId)
                        ?: conflict("star_plan_inheritance_not_pending", "这份旧计划已处理或不存在，请重新加载")
                    val current = states.current(userId, accountId)
                    if (item.sourceRecoveryPointId != request.sourceRecoveryPointId ||
                        item.targetGeneration != request.expectedGeneration ||
                        current.generation != item.targetGeneration
                    ) {
                        conflict("star_generation_changed", "背包或旧计划来源已变化，本次处理未保存")
                    }
                    item.resolution?.let {
                        if (it.operationId != request.operationId || it.action != action ||
                            mapper.readTree(it.payload) != mapper.readTree(payload)
                        ) {
                            conflict("star_plan_inheritance_resolved", "这份旧计划已在其他窗口处理，请重新加载")
                        }
                        return@execute StarPlanInheritanceResolutionResponse(
                            it.operationId,
                            item.sourceRecoveryPointId,
                            item.targetGeneration,
                            it.revision,
                            it.action,
                        )
                    }
                    states.fencePlanResolution(userId, accountId, request.expectedGeneration, request.expectedRevision)
                    val source = points.findByUserIdAndAccountIdAndRecoveryPointId(userId, accountId, item.sourceRecoveryPointId)
                        ?: conflict("star_plan_inheritance_source_missing", "旧计划恢复点未找到，待办仍保留，请联系维护者")
                    if (!source.inheritanceProtected) conflict("star_plan_inheritance_source_changed", "旧计划来源状态已变化，请重新读取")
                    val revision = if (action == "confirm") {
                        if (current.planTargets.isNotEmpty()) conflict("star_plan_inheritance_plan_exists", "当前已有养成计划，不能覆盖；请先处理当前计划")
                        states.patch(
                            userId,
                            accountId,
                            StarStatePatchRequest(
                                request.expectedGeneration,
                                request.expectedRevision,
                                current.inventory.map { StarInventoryEntryRequest(it.instanceId, it.kind, it.name, it.quality, it.level) },
                                request.planTargets,
                                StarWorkspaceExperienceRequest(
                                    current.experience.orange,
                                    current.experience.purple,
                                    current.experience.white,
                                ),
                                StarWorkspaceBagRequest(current.bag.currentCount, current.bag.capacity),
                            ),
                        ).state.revision
                    } else {
                        current.revision
                    }
                    // Keep only the most recent resolution at the account slot for safe response-loss retries.
                    // A later full sync may replace this resolved slot with its new pending source.
                    pending.save(item.copy(resolution = StarPlanInheritanceResolution(request.operationId, action, payload, revision)))
                    points.save(source.copy(inheritanceProtected = false))
                    states.pruneRecoveryPoints(userId, accountId)
                    events.publishChange(
                        userId,
                        accountId,
                        "star_plan_inheritance_resolved",
                        mapOf("source_recovery_point_id" to item.sourceRecoveryPointId, "generation" to item.targetGeneration),
                    )
                    StarPlanInheritanceResolutionResponse(
                        request.operationId,
                        item.sourceRecoveryPointId,
                        item.targetGeneration,
                        revision,
                        action,
                    )
                },
            )
        }
    }

    companion object {
        fun validate(request: StarInventorySyncRequest, game: String) {
            if (game !in setOf("如鸢", "代号鸢")) invalid("绑定账号游戏版本无效")
            if (request.format != "maayuan-star-inventory" || request.version != 1 || !request.complete) invalid("需要完整的星石扫描")
            if (!Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$").matches(request.scanId)) invalid("scan_id 必须为 UUID")
            if (request.inventory.size > 1000 || request.counts.main < 0 || request.counts.support < 0 ||
                request.counts.main != request.inventory.count { it.kind == "main" } ||
                request.counts.support != request.inventory.count { it.kind == "support" }
            ) {
                invalid("主辅星数量与条目不一致")
            }
            request.bag?.let {
                if (it.currentCount != request.inventory.size ||
                    it.capacity?.let { capacity -> capacity <= 0 || capacity < request.inventory.size } == true
                ) {
                    invalid("背包数量或容量与条目不一致")
                }
            }
            request.inventory.forEach {
                val names = when (it.kind) {
                    "main" -> StarStoneCatalog.MAIN_NAMES
                    "support" -> StarStoneCatalog.SUPPORT_NAMES
                    else -> invalid("星石分类无效")
                }
                // Both supported games currently share this canonical star catalog.
                if (it.name !in names) invalid("星石名称与分类不符")
                try {
                    StarBreakthroughRules.allowed(it.level, it.quality)
                } catch (_: IllegalArgumentException) {
                    invalid("星石品质或等级无效")
                }
            }
            if (listOf(request.experience.orange, request.experience.purple, request.experience.white).any { it != null && it < 0 }) {
                invalid("已识别的经验星曜数量必须非负")
            }
        }

        private fun response(item: StarInventorySync) = StarInventorySyncResponse(
            item.scanId,
            "synced",
            item.accountId,
            item.generation,
            item.revision,
            item.recoveryPointId,
            item.inheritancePending,
        )
        private fun invalid(message: String): Nothing =
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_sync_invalid", message)
        private fun conflict(code: String, message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, code, message)
    }
}

data class StarInventorySyncResponse(
    val scanId: String,
    val status: String,
    val accountId: String,
    val generation: Long,
    val revision: Long,
    val recoveryPointId: String?,
    val inheritancePending: Boolean,
)

data class StarPlanInheritanceSource(
    val accountId: String,
    val sourceRecoveryPointId: String,
    val sourceGeneration: Long,
    val targetGeneration: Long,
    val sourceState: StarStateSnapshot,
)

data class StarPlanInheritanceResolutionResponse(
    val operationId: String,
    val sourceRecoveryPointId: String,
    val targetGeneration: Long,
    val revision: Long,
    val action: String,
)

/** Expected cloud version comes from the preview; raw enables conservative receipt equivalence. */
data class StarInventoryImportScope(val game: String, val generation: Long? = null, val revision: Long? = null, val raw: Boolean = false)

data class StarInventoryImportPreview(
    val accountId: String,
    val game: String,
    val generation: Long,
    val revision: Long,
    val alreadySynced: Boolean,
)
