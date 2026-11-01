package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.operator.request.OperatorResetExecuteRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetPreviewRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetUndoRequest
import com.lhs.share.hub.controller.operator.response.OperatorResetHistoryResponse
import com.lhs.share.hub.controller.operator.response.OperatorResetPreviewResponse
import com.lhs.share.hub.controller.operator.response.OperatorResetResource
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorResetTransactionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorResetTransaction
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.ResetGrowth
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.service.account.AccountEventService
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Service
class OperatorResetService(
    private val accounts: SubAccountRepository,
    private val catalog: OperatorCatalogService,
    private val operators: OperatorCurrentRepository,
    private val stock: InventoryCurrentRepository,
    private val revisions: InventoryRevisionRepository,
    private val records: InventoryRecordRepository,
    private val corrections: OperatorCorrectionRecordRepository,
    private val receipts: OperatorResetTransactionRepository,
    private val events: AccountEventService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    private data class Binding(
        val user: String,
        val account: String,
        val game: String,
        val operator: String,
        val before: Map<String, ResetGrowth>,
        val refunds: Map<String, Long>,
        val inventoryRevision: Long,
        val baselines: Map<String, Instant>,
        val expiresAt: Instant,
        val undoId: String? = null,
    )
    private val previews = ConcurrentHashMap<String, Binding>()

    fun preview(user: String, request: OperatorResetPreviewRequest): OperatorResetPreviewResponse {
        requireAccount(user, request.accountId, request.game)
        val op = catalog.getOperator(request.operatorId) ?: invalid("密探不存在")
        if (request.game !in op.games) invalid("密探不属于当前游戏")
        val baseId = OperatorSharedGrowth.baseId(op.operatorId, catalog)
        val base = catalog.getOperator(baseId) ?: invalid("密探本体不存在")
        val current = operators.findByUserIdAndAccountIdAndGame(user, request.accountId, request.game) ?: invalid("请先录入密探练度")
        val entry = current.entries[op.operatorId] ?: invalid("请先录入密探练度")
        if (!OperatorHuajiRules.read(entry, op).owned || entry.level !in 1..100 || entry.elite !in 1..17) invalid("请先核对招募状态和练度")
        val before = group(current, op.operatorId)
        if (before.values.any {
                it.level != entry.level || it.elite != entry.elite ||
                    it.levelBreakthroughStage != OperatorLevelBreakthroughRules.read(entry.level, entry.levelBreakthroughStage)
            }
        ) {
            conflict("reset_shared_conflict", "共享形态练度不一致，请先核对")
        }
        if (entry.level == 1 && entry.elite == 1) invalid("密探已经是等级1、修为+1")
        val knownStage = OperatorLevelBreakthroughRules.read(entry.level, entry.levelBreakthroughStage)
        val stage = request.levelBreakthroughStage ?: knownStage
        OperatorLevelBreakthroughRules.requireValid(entry.level, stage, op.operatorId)
        if (knownStage != null && stage != knownStage) invalid("突破状态与已保存资料不符")
        val estimate = OperatorResetRules.refund(entry.level, entry.elite, stage, base)
        val refunds = request.refunds ?: estimate.suggested
        if (refunds.keys != estimate.suggested.keys || refunds.values.any { it !in 0..Int.MAX_VALUE.toLong() }) invalid("请核对返还物品及整数数量")
        val blockers = mutableListOf<String>()
        if (stage == null) blockers += "请核对该密探在当前等级是否已突破"
        return bind(
            user, request.accountId, request.game, baseId, before, refunds, blockers, estimate.money, estimate.experience,
            stage == null,
        )
    }

    fun execute(user: String, key: String, request: OperatorResetExecuteRequest): OperatorResetTransaction {
        requireAccount(user, request.accountId, request.game)
        if (!Regex("[A-Za-z0-9._:-]{1,128}").matches(key) || !request.confirmedGamePreview) invalid("请先核对游戏内重置结果及返还清单")
        val identity = "${request.game}:${request.previewToken}"
        retry(user, request.accountId, key, identity)?.let { return it }
        val binding = binding(user, request.accountId, request.game, request.previewToken, null)
        val result = write({ retry(user, request.accountId, key, identity) }) {
            retry(user, request.accountId, key, identity)?.let { return@write it }
            fence(binding)
            val current = checkGrowth(binding)
            val inventory = checkInventory(binding)
            val now = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            val id = "reset_${now.toEpochMilli()}_${UUID.randomUUID()}"
            val changed = binding.before.mapValues { (member, _) ->
                resetEntry(current.entries.getValue(member), ResetGrowth(1, 1, 0, 0), now)
            }
            saveGrowth(binding, current, changed, id, now)
            writeStock(binding, inventory, id, binding.refunds, now)
            receipts.insert(
                OperatorResetTransaction(
                    id, user, request.accountId, request.game, binding.operator, key, identity,
                    binding.before, changed.mapValues { (_, entry) -> growth(entry, current) },
                    binding.refunds, binding.baselines, now,
                ),
            )
        }
        publish(result)
        return result
    }

    fun history(user: String, account: String, game: String, operator: String, cursor: String?): OperatorResetHistoryResponse {
        requireAccount(user, account, game)
        val items = receipts.findByUserIdAndAccountIdAndGameAndOperatorIdAndIdLessThanOrderByIdDesc(
            user,
            account,
            game,
            OperatorSharedGrowth.baseId(operator, catalog),
            cursor ?: "~",
            PageRequest.of(0, 21),
        )
        return OperatorResetHistoryResponse(items.take(20), items.takeIf { it.size > 20 }?.get(19)?.id)
    }

    fun undoPreview(user: String, account: String, game: String, id: String): OperatorResetPreviewResponse {
        requireAccount(user, account, game)
        val receipt = receipt(user, account, game, id)
        val current = operators.findByUserIdAndAccountIdAndGame(user, account, game)
        val blockers = mutableListOf<String>()
        if (receipt.undoneAt != null) blockers += "这次重置已撤销"
        if (current == null || group(current, receipt.operatorId) != receipt.after) blockers += "关联密探在重置后已有修改或同步，无法直接撤销"
        val inventory = stock.findByUserIdAndAccountIdAndEntityType(user, account, "item")
        if (receipt.inventoryBaselines.any { (item, baseline) -> baseline(inventory, item) != baseline }) {
            blockers += "返还材料在重置后已有库存盘点，无法直接撤销"
        }
        return bind(user, account, game, receipt.operatorId, receipt.after, receipt.refunds.mapValues { -it.value }, blockers, undoId = id)
    }

    fun undo(user: String, id: String, request: OperatorResetUndoRequest): OperatorResetTransaction {
        requireAccount(user, request.accountId, request.game)
        receipt(user, request.accountId, request.game, id).takeIf { it.undoneAt != null }?.let { return it }
        val binding = binding(user, request.accountId, request.game, request.previewToken, id)
        val result = write({ receipt(user, request.accountId, request.game, id).takeIf { it.undoneAt != null } }) {
            val original = receipt(user, request.accountId, request.game, id)
            if (original.undoneAt != null) return@write original
            fence(binding)
            val current = checkGrowth(binding)
            val inventory = checkInventory(binding)
            val now = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            val changed = original.before.mapValues { (member, value) -> resetEntry(current.entries.getValue(member), value, now) }
            saveGrowth(binding, current, changed, "$id:undo", now)
            writeStock(binding, inventory, "$id:undo", binding.refunds, now)
            receipts.save(original.copy(undoneAt = now))
        }
        publish(result)
        return result
    }

    private fun bind(
        user: String,
        account: String,
        game: String,
        operator: String,
        before: Map<String, ResetGrowth>,
        refunds: Map<String, Long>,
        blockers: MutableList<String>,
        money: Long = 0,
        experience: Long? = null,
        breakthroughRequired: Boolean = false,
        undoId: String? = null,
    ): OperatorResetPreviewResponse {
        val inventoryRevision = revisions.findByUserIdAndAccountId(user, account)?.revision ?: 0L
        val inventory = stock.findByUserIdAndAccountIdAndEntityType(user, account, "item")
        val baselines = mutableMapOf<String, Instant>()
        val now = Instant.now()
        if (inventory == null) blockers += "请先盘点相关库存"
        if (before.values.any { it.baselineAt?.isBefore(now) == false }) blockers += "密探采集时间尚未过去，请先核对"
        val resources = refunds.map { (id, count) ->
            val baseline = baseline(inventory, id)
            val balance = baseline?.let { inventory?.entries?.get(id)?.count ?: 0L }
            val after = balance?.plus(count)
            if (count != 0L) {
                if (baseline == null) {
                    blockers += "请先盘点材料：$id"
                } else {
                    baselines[id] = baseline
                    if (!now.isAfter(baseline)) blockers += "材料 $id 的盘点时间尚未过去，请先核对"
                }
                if (after != null && after < 0) blockers += "材料 $id 库存不足，无法扣回 ${-count}"
                if (after != null && after > Int.MAX_VALUE) blockers += "材料 $id 的库存超过支持上限"
            }
            OperatorResetResource(id, count, balance, after)
        }
        val token = "reset_preview_${UUID.randomUUID()}"
        previews.entries.removeIf { !it.value.expiresAt.isAfter(now) }
        if (blockers.isEmpty()) {
            previews[token] =
                Binding(
                    user, account, game, operator, before,
                    refunds.filterValues {
                        it != 0L
                    },
                    inventoryRevision, baselines, now.plusSeconds(300), undoId,
                )
        }
        return OperatorResetPreviewResponse(
            token,
            before,
            resources,
            blockers.distinct(),
            inventoryRevision,
            money,
            experience,
            breakthroughRequired,
        )
    }

    private fun binding(user: String, account: String, game: String, token: String, undoId: String?): Binding {
        val value = previews[token] ?: conflict("reset_preview_expired", "预览已失效，请重新核对")
        if (value.user != user || value.account != account || value.game != game || value.undoId != undoId ||
            !value.expiresAt.isAfter(Instant.now())
        ) {
            conflict("reset_preview_expired", "预览已失效或账号已变更，请重新核对")
        }
        return value
    }

    private fun fence(binding: Binding) {
        requireAccount(binding.user, binding.account, binding.game)
        if (!accounts.fenceRecruitmentWrite(binding.user, binding.account, binding.game)) conflict("account_state_stale", "游戏账号已变更，请重新读取")
    }

    private fun checkGrowth(binding: Binding): OperatorCurrent {
        val current = operators.findByUserIdAndAccountIdAndGame(binding.user, binding.account, binding.game)
        if (current == null || group(current, binding.operator) != binding.before) conflict("reset_operator_conflict", "关联密探已有修改或同步，请重新读取")
        return current
    }

    private fun checkInventory(binding: Binding): InventoryCurrent {
        if ((revisions.findByUserIdAndAccountId(binding.user, binding.account)?.revision ?: 0L) != binding.inventoryRevision) {
            conflict("reset_inventory_conflict", "库存已变化，请重新预览")
        }
        val inventory = stock.findByUserIdAndAccountIdAndEntityType(binding.user, binding.account, "item")
            ?: conflict("reset_inventory_unknown", "请先盘点相关库存")
        if (binding.baselines.any { (id, at) -> baseline(inventory, id) != at || !Instant.now().isAfter(at) }) {
            conflict("reset_inventory_conflict", "相关库存已被盘点覆盖，请重新核对")
        }
        return inventory
    }

    private fun saveGrowth(binding: Binding, current: OperatorCurrent, changed: Map<String, OperatorEntry>, id: String, now: Instant) {
        val source = changed.keys.first()
        operators.compareAndSetEntries(
            binding.user,
            binding.account,
            binding.game,
            source,
            current.entries.getValue(source).revision,
            changed,
            now,
        )
            ?: conflict("reset_operator_conflict", "关联密探已有修改，请重新读取")
        changed.forEach { (member, entry) ->
            corrections.insert(
                OperatorCorrectionRecord(
                    id = "$id:growth:$member", userId = binding.user, accountId = binding.account, game = binding.game,
                    operatorId = member, reason = "operator_reset", fields = setOf("level", "elite", "level_breakthrough_stage"),
                    level = entry.level, elite = entry.elite, levelBreakthroughStage = entry.levelBreakthroughStage, createdAt = now,
                ),
            )
        }
    }

    private fun writeStock(binding: Binding, inventory: InventoryCurrent, id: String, changes: Map<String, Long>, now: Instant) {
        val entries = inventory.entries.toMutableMap()
        changes.forEach { (item, count) ->
            val entry = entries[item] ?: StockEntry()
            val next = entry.count + count
            if (next !in 0..Int.MAX_VALUE.toLong()) conflict("reset_insufficient_inventory", "材料 $item 无法完整加回或扣回")
            entries[item] = entry.copy(count = next)
        }
        if (revisions.compareAndIncrement(binding.user, binding.account, binding.inventoryRevision, now) == null) {
            conflict("reset_inventory_conflict", "库存已变化，请重新预览")
        }
        stock.save(inventory.copy(entries = entries, updatedAt = now))
        if (changes.isNotEmpty()) {
            records.insert(
                InventoryRecord(
                    recordId = "yuanhub:$id", userId = binding.user, accountId = binding.account,
                    recordType = "resource_delta", entityType = "item",
                    acquisitionChannel = if (binding.undoId ==
                        null
                    ) {
                        "${catalog.getOperator(binding.operator)?.name ?: binding.operator} · 密探重置返还"
                    } else {
                        "${catalog.getOperator(binding.operator)?.name ?: binding.operator} · 撤销密探重置"
                    },
                    effectiveAt = now, receivedAt = now, producer = ProducerInfo("yuanhub"),
                    entries = changes.map {
                        RecordEntry(it.key, count = it.value)
                    },
                    transactionId = id.substringBefore(":undo"), resourceRevision = binding.inventoryRevision + 1,
                ),
            )
        }
    }

    private fun resetEntry(entry: OperatorEntry, target: ResetGrowth, now: Instant) = entry.copy(
        level = target.level,
        elite = target.elite,
        levelBreakthroughStage = target.levelBreakthroughStage,
        revision = entry.revision + 1,
        updatedAt = now,
        combatStats = entry.combatStats?.let {
            if (it.observedAttack != null ||
                it.observedHp != null
            ) {
                it.copy(observedStatus = "stale")
            } else {
                it
            }
        },
    )

    private fun group(current: OperatorCurrent, operator: String): Map<String, ResetGrowth> =
        OperatorSharedGrowth.members(operator, catalog)
            .mapNotNull { id -> current.entries[id]?.let { id to growth(it, current) } }.toMap()

    private fun growth(entry: OperatorEntry, current: OperatorCurrent) = ResetGrowth(
        entry.level,
        entry.elite,
        OperatorLevelBreakthroughRules.read(entry.level, entry.levelBreakthroughStage),
        entry.revision,
        listOfNotNull(entry.listedBaselineAt, current.fullBaselineAt).maxOrNull(),
    )

    private fun baseline(inventory: InventoryCurrent?, id: String) =
        listOfNotNull(inventory?.fullBaselineAt, inventory?.entries?.get(id)?.listedBaselineAt).maxOrNull()

    private fun retry(user: String, account: String, key: String, identity: String): OperatorResetTransaction? =
        receipts.findByUserIdAndAccountIdAndIdempotencyKey(user, account, key)?.also {
            if (it.requestIdentity != identity) conflict("idempotency_conflict", "操作编号已用于另一笔重置，请重新核对")
        }

    private fun receipt(user: String, account: String, game: String, id: String): OperatorResetTransaction =
        receipts.findByUserIdAndAccountIdAndId(user, account, id)?.takeIf { it.game == game }
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "reset_not_found", "找不到这次重置记录")

    private fun requireAccount(user: String, account: String, game: String) {
        val owned = accounts.findByUserIdAndAccountId(user, account)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "找不到游戏账号")
        if (game !in setOf("代号鸢", "如鸢") || owned.game != game) conflict("account_state_stale", "游戏版本已变化，请重新读取")
    }

    private fun write(retry: () -> OperatorResetTransaction?, action: () -> OperatorResetTransaction): OperatorResetTransaction {
        try {
            return checkNotNull(transactions.execute { action() })
        } catch (error: Exception) {
            val mongo = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<MongoException>().toList()
            if (mongo.any { it.hasErrorLabel("UnknownTransactionCommitResult") }) {
                retry()?.let { return it }
                throw OperatorApiException(HttpStatus.SERVICE_UNAVAILABLE, "reset_result_unknown", "操作结果尚未确认，请原样重试")
            }
            if (error is DuplicateKeyException || mongo.any { it.code == 112 || it.hasErrorLabel("TransientTransactionError") }) {
                retry()?.let { return it }
                conflict("reset_state_conflict", "数据已变化，请重新预览")
            }
            throw error
        }
    }

    private fun publish(receipt: OperatorResetTransaction) {
        events.publishChange(receipt.userId, receipt.accountId, "operator_reset", mapOf("transaction_id" to receipt.id))
    }
    private fun invalid(message: String): Nothing = throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_reset", message)
    private fun conflict(code: String, message: String): Nothing = throw OperatorApiException(HttpStatus.CONFLICT, code, message)
}
