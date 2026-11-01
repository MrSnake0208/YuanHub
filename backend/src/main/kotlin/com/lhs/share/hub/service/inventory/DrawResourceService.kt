package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.inventory.request.DrawResourceRequest
import com.lhs.share.hub.controller.inventory.response.DrawResourceContextResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.StockEntry
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class DrawResourceService(
    private val accounts: SubAccountRepository,
    private val inventories: InventoryCurrentRepository,
    private val revisions: InventoryRevisionRepository,
    private val records: InventoryRecordRepository,
    private val deleted: InventoryDeletedRecordRepository,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun context(userId: String, accountId: String): DrawResourceContextResponse = checkNotNull(
        transactions.execute {
            val account = requireAccount(userId, accountId)
            val stock = inventories.findByUserIdAndAccountIdAndEntityType(userId, accountId, "item")
            DrawResourceContextResponse(
                accountId,
                account.game,
                revisions.findByUserIdAndAccountId(userId, accountId)?.revision ?: 0L,
                RESOURCE_NAMES.mapValues { (id, _) -> knownBalance(stock, id) },
            )
        },
    )

    fun execute(userId: String, request: DrawResourceRequest): InventoryRecord {
        requireAccount(userId, request.accountId)
        if (!Regex("[A-Za-z0-9._:-]{1,100}").matches(request.operationId) ||
            request.expectedInventoryRevision !in 0..9007199254740990L
        ) {
            invalid("操作编号或库存版本无效")
        }
        val identity = mapper.writeValueAsString(request)
        existing(userId, request, identity)?.let { return it }
        val changes = changes(request)
        try {
            return checkNotNull(
                transactions.execute {
                    existing(userId, request, identity)?.let { return@execute it }
                    val account = requireAccount(userId, request.accountId)
                    if (account.game != request.game) conflict("account_state_stale", "游戏版本已变更，请重新读取")
                    if (!accounts.fenceRecruitmentWrite(userId, request.accountId, request.game)) {
                        conflict("account_state_stale", "游戏账号已变更，请重新读取")
                    }
                    if (deleted.findByUserIdAndAccountIdAndRecordId(userId, request.accountId, recordId(request)) != null) {
                        conflict("draw_resource_operation_deleted", "这笔操作已删除，请到操作历史恢复")
                    }
                    val stock = inventories.findByUserIdAndAccountIdAndEntityType(userId, request.accountId, "item")
                    val now = Instant.now().truncatedTo(ChronoUnit.MILLIS)
                    val entries = stock?.entries.orEmpty().toMutableMap()
                    changes.forEach { change ->
                        val balance = knownBalance(stock, change.id)
                            ?: conflict("draw_resource_inventory_unknown", "请先盘点${RESOURCE_NAMES[change.id]}库存")
                        val baseline = listOfNotNull(stock?.fullBaselineAt, entries[change.id]?.listedBaselineAt).maxOrNull()
                        if (baseline != null && !now.isAfter(baseline)) {
                            conflict("draw_resource_baseline_ahead", "库存盘点时间尚未过去，请核对后重试")
                        }
                        val next = balance + change.count
                        if (next < 0) conflict("insufficient_inventory", "${RESOURCE_NAMES[change.id]}库存不足")
                        if (next > Int.MAX_VALUE) invalid("${RESOURCE_NAMES[change.id]}库存超过支持上限")
                        entries[change.id] = (entries[change.id] ?: StockEntry()).copy(count = next)
                    }
                    if (revisions.compareAndIncrement(userId, request.accountId, request.expectedInventoryRevision, now) == null) {
                        stale()
                    }
                    inventories.save(checkNotNull(stock).copy(entries = entries, updatedAt = now))
                    records.insert(
                        InventoryRecord(
                            recordId = recordId(request), userId = userId, accountId = request.accountId,
                            recordType = if (request.action == "gain") "reward_delta" else "resource_delta", entityType = "item",
                            acquisitionChannel = when (request.action) {
                                "use" -> "符传使用"
                                "exchange" -> if (request.ticketId ==
                                    "zhuyu"
                                ) {
                                    "茱萸兑换白金币"
                                } else if (request.channel == "monthly-shop") {
                                    "月卡商店兑换"
                                } else {
                                    "白金币兑换"
                                }
                                else -> request.channel
                            },
                            effectiveAt = now, receivedAt = now,
                            producer = ProducerInfo(
                                "yuanhub",
                            ),
                            entries = changes, resourceRequestIdentity = identity,
                            resourceRevision = request.expectedInventoryRevision + 1,
                        ),
                    )
                },
            )
        } catch (error: Exception) {
            val mongo = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<MongoException>().toList()
            if (mongo.any { it.hasErrorLabel("UnknownTransactionCommitResult") }) {
                existing(userId, request, identity)?.let { return it }
                throw InventoryApiException(HttpStatus.SERVICE_UNAVAILABLE, "draw_resource_result_unknown", "结果尚未确认，请原样重试")
            }
            if (error is DuplicateKeyException || mongo.any { it.code == 112 || it.hasErrorLabel("TransientTransactionError") }) {
                existing(userId, request, identity)?.let { return it }
                stale()
            }
            throw error
        }
    }

    private fun changes(request: DrawResourceRequest): List<RecordEntry> {
        if (request.ticketId !in setOf("fuchuan", "tianjifuchuan", "zhuyu") || request.quantity !in 1..Int.MAX_VALUE.toLong() ||
            (request.ticketId == "zhuyu" && (request.action != "exchange" || request.channel != "standard"))
        ) {
            invalid("请选择符传或天机符传，数量必须为有效正整数")
        }
        val amount = request.quantity
        val ticket = RecordEntry(request.ticketId, RESOURCE_NAMES[request.ticketId], amount)
        return when (request.action) {
            "gain" -> {
                if (request.channel.isBlank() || request.channel.length > 64 || request.channel.contains("派遣")) invalid("请填写有效的奖励来源")
                listOf(ticket)
            }
            "use" -> {
                if (request.channel != "use") invalid("符传使用渠道无效")
                listOf(ticket.copy(count = -amount))
            }
            "exchange" -> {
                if (request.ticketId == "zhuyu") {
                    val coins = amount * 50L
                    if (coins > Int.MAX_VALUE) invalid("兑换所得超过支持上限")
                    return listOf(ticket.copy(count = -amount), RecordEntry("baijinbi", "白金币", coins))
                }
                val coins = when (request.channel) {
                    "standard" -> amount * 200L
                    "monthly-shop" -> {
                        if (request.ticketId != "fuchuan" || amount % 10 != 0L) invalid("月卡商店仅支持每份10张普通符传")
                        amount / 10 * 1600L
                    }
                    else -> invalid("兑换渠道无效")
                }
                if (coins > Int.MAX_VALUE) invalid("兑换花费超过支持上限")
                listOf(RecordEntry("baijinbi", "白金币", -coins), ticket)
            }
            else -> invalid("操作类型无效")
        }
    }

    private fun existing(userId: String, request: DrawResourceRequest, identity: String): InventoryRecord? =
        records.findByUserIdAndAccountIdAndRecordId(userId, request.accountId, recordId(request))?.also {
            if (it.resourceRequestIdentity != identity) conflict("record_conflict", "操作编号已用于其他内容，请核对操作历史")
        }

    private fun recordId(request: DrawResourceRequest) = "yuanhub:draw:${request.operationId}"
    private fun knownBalance(stock: InventoryCurrent?, id: String): Long? =
        if (stock?.fullBaselineAt != null || stock?.entries?.get(id)?.listedBaselineAt != null) stock.entries[id]?.count ?: 0L else null
    private fun requireAccount(userId: String, accountId: String) = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "游戏账号不存在")
    private fun stale(): Nothing = conflict("inventory_state_stale", "库存已变更，请重新读取并核对")
    private fun conflict(code: String, message: String): Nothing = throw InventoryApiException(HttpStatus.CONFLICT, code, message)
    private fun invalid(message: String): Nothing =
        throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "draw_resource_invalid_request", message)

    companion object {
        private val RESOURCE_NAMES = linkedMapOf("baijinbi" to "白金币", "fuchuan" to "符传", "tianjifuchuan" to "天机符传", "zhuyu" to "茱萸")
    }
}
