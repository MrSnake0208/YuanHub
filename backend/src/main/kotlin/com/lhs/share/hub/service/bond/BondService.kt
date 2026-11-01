package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.BondRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.BondArchive
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.repository.entity.BondRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.bond.BondRules.conflict
import com.lhs.share.hub.service.bond.BondRules.invalid
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit

data class BondArchiveResponse(
    val accountId: String,
    val game: String,
    val revision: Long,
    val catalogVersion: String,
    val records: List<BondRecord>,
    val summary: BondSummary,
)
data class BondSourceAccount(val name: String)
data class BondBackup(
    val format: String = "yuanhub-bonds",
    val schemaVersion: Int = 1,
    val game: String,
    val catalogVersion: String,
    val exportedAt: Instant,
    val sourceAccount: BondSourceAccount,
    val records: List<BondRecord>,
)
data class BondImportItem(val key: String, val bondId: String?, val outcome: String, val message: String? = null)
data class BondPreview(
    val accountId: String,
    val game: String,
    val expectedRevision: Long,
    val catalogVersion: String,
    val strategy: String,
    val items: List<BondImportItem>,
    val stats: Map<String, Int>,
    val affected: Int,
    val previewToken: String? = null,
)

@Service
class BondService(
    private val repository: BondRepository,
    private val accounts: SubAccountRepository,
    private val catalog: BondCatalogService,
    private val operators: OperatorCatalogService,
    private val previews: BondImportPreviews,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
) {
    private fun account(userId: String, accountId: String) = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "游戏账号不存在")
    private fun load(owner: SubAccount): BondArchive {
        val current = repository.find(owner.userId, owner.accountId) ?: BondArchive(
            "bond_archive:${owner.userId}:${owner.accountId}",
            owner.userId,
            owner.accountId,
            owner.game,
        )
        if (current.game != owner.game) conflict("档案与账号游戏不一致")
        return current
    }
    private fun revision(value: BondArchive) = value.version?.plus(1) ?: 0L
    private fun response(value: BondArchive, data: BondPublication) = BondArchiveResponse(
        value.accountId,
        value.game,
        revision(value),
        data.catalogVersion,
        value.records,
        BondRules.summary(data.entries, value.records),
    )
    fun archive(userId: String, accountId: String): BondArchiveResponse {
        val owner = account(userId, accountId)
        return response(load(owner), catalog.catalog(owner.game))
    }
    private fun backup(owner: SubAccount, current: BondArchive, data: BondPublication) = BondBackup(
        game = owner.game,
        catalogVersion = data.catalogVersion,
        exportedAt = Instant.now(),
        sourceAccount = BondSourceAccount(owner.name),
        records = current.records,
    )
    fun export(userId: String, accountId: String): BondBackup {
        val owner = account(userId, accountId)
        val current = load(owner)
        val data = catalog.catalog(owner.game)
        BondRules.summary(data.entries, current.records)
        return backup(owner, current, data)
    }

    fun update(userId: String, accountId: String, expectedRevision: Long, catalogVersion: String, changes: List<Pair<String, Boolean>>) =
        write {
            if (changes.size !in 1..50 || changes.map { it.first }.distinct().size != changes.size) invalid("批量须为1–50条不同羁绊")
            val owner = account(userId, accountId)
            val current = load(owner)
            val data = checked(current, expectedRevision, catalogVersion)
            val entries = data.entries.associateBy { it.bondId }
            changes.forEach { (id, triggered) ->
                val entry = entries[id] ?: invalid("当前游戏不存在该羁绊：$id")
                if (triggered && entry.status != "active") invalid("历史条目仅可保留或取消，不能手动新增触发")
            }
            persist(owner, current, data, BondRules.apply(current.records, changes, "manual", now()))
        }

    fun preview(userId: String, request: BondImportRequest): BondPreview {
        val owner = account(userId, request.accountId)
        val current = load(owner)
        val plan = plan(owner, current, catalog.catalog(owner.game), request)
        return plan.preview.copy(previewToken = previews.issue(owner, request, plan.preview.expectedRevision, plan.preview.catalogVersion))
    }
    fun confirm(userId: String, request: BondImportRequest) = write {
        val owner = account(userId, request.accountId)
        previews.requireMatch(owner, request)
        val current = load(owner)
        val data = checked(current, request.expectedRevision ?: invalid("请先预览"), request.catalogVersion ?: invalid("请先预览"))
        val plan = plan(owner, current, data, request)
        if (plan.preview.items.any { it.outcome in setOf("invalid", "mismatched") }) invalid("存在非法或不匹配记录，未写入任何内容")
        if (plan.preview.items.any { it.outcome == "unknown" } && !request.skipUnknown) invalid("请明确确认跳过未知记录")
        persist(owner, current, data, plan.records)
    }

    private data class ImportPlan(val preview: BondPreview, val records: List<BondRecord>)
    private fun plan(owner: SubAccount, current: BondArchive, data: BondPublication, request: BondImportRequest): ImportPlan {
        if (request.strategy !in setOf("merge", "use_file")) invalid("strategy 只允许 merge 或 use_file")
        val document = request.document
        val native = document.has("format")
        val input = if (native) nativeRows(owner, document) else legacyRows(owner, request)
        if (!native && request.strategy != "merge") invalid("旧助手只支持合并已记录项")
        val entries = data.entries.associateBy { it.bondId }
        val foreignGame = if (owner.game == "如鸢") "代号鸢" else "如鸢"
        val foreign = catalog.catalog(foreignGame).entries.map { it.bondId }.toSet()
        val keys = if (native) emptyMap() else legacyKeys(data)
        val records = current.records.associateBy { it.bondId }
        val seen = mutableSetOf<String>()
        val changes = mutableListOf<Pair<String, Boolean>>()
        val items = input.map { (key, row) ->
            try {
                val triggered = if (native) {
                    BondRules.fields(row, setOf("bond_id", "triggered", "source", "updated_at"))
                    row["triggered"]?.takeIf { it.isBoolean }?.booleanValue() ?: invalid("triggered 必须是布尔值")
                } else {
                    row.takeIf { it.isBoolean }?.booleanValue() ?: invalid("旧记录值必须是布尔值")
                }
                val matches = if (native) listOf(key) else keys[key].orEmpty()
                if (matches.size > 1) invalid("旧键匹配有歧义，请核对目录")
                val id = matches.singleOrNull()
                when {
                    id in foreign -> BondImportItem(key, id, "mismatched", "条目属于另一游戏")
                    id == null || id !in entries -> BondImportItem(key, id, "unknown", "未知、未开放或尚未授权收录；确认后可跳过")
                    !seen.add(id) -> BondImportItem(key, id, "invalid", "重复条目")
                    else -> {
                        val old = records[id]
                        val outcome = when {
                            old?.triggered == triggered -> "same"
                            request.strategy == "merge" && !triggered -> "same"
                            old != null -> "conflict"
                            else -> "add"
                        }
                        if (outcome == "add" || outcome == "conflict") changes += id to triggered
                        BondImportItem(
                            key,
                            id,
                            outcome,
                            if (entries.getValue(id).status !=
                                "active"
                            ) {
                                "历史${entries.getValue(id).status}记录；invalid不计数"
                            } else {
                                null
                            },
                        )
                    }
                }
            } catch (error: InventoryApiException) {
                BondImportItem(key.take(200), null, "invalid", error.message)
            }
        }
        val stats = listOf("add", "same", "conflict", "unknown", "mismatched", "invalid").associateWith { o ->
            items.count { it.outcome == o }
        }
        val next = BondRules.apply(current.records, changes, "import", now())
        val affected = if (items.any { it.outcome in setOf("invalid", "mismatched") }) 0 else changes.size
        return ImportPlan(
            BondPreview(owner.accountId, owner.game, revision(current), data.catalogVersion, request.strategy, items, stats, affected),
            next,
        )
    }

    private fun nativeRows(owner: SubAccount, document: JsonNode): List<Pair<String, JsonNode>> {
        BondRules.fields(document, setOf("format", "schema_version", "game", "catalog_version", "exported_at", "source_account", "records"))
        if (document.path("format").asText() != "yuanhub-bonds" || !document.path("schema_version").isIntegralNumber ||
            !document.path("schema_version").canConvertToInt() || document.path("schema_version").asInt() != 1
        ) {
            invalid("不支持的羁绊备份格式或版本")
        }
        if (BondRules.text(document, "game") != owner.game) invalid("文件游戏与目标账号不匹配")
        if (mapper.writeValueAsBytes(document).size > BondRules.NATIVE_BYTES) invalid("原生备份最多2MiB")
        val rows = document["records"]?.takeIf { it.isArray && it.size() <= BondRules.MAX_RECORDS } ?: invalid("records 最多5000条")
        return rows.map { row -> BondRules.text(row, "bond_id") to row }
    }

    private fun legacyRows(owner: SubAccount, request: BondImportRequest): List<Pair<String, JsonNode>> {
        val document = request.document
        if (!document.isObject || mapper.writeValueAsBytes(document).size > BondRules.LEGACY_BYTES) invalid("旧助手文件必须是最多8MiB的对象")
        val selected = request.sourceAccount ?: invalid("请选择一个来源账号")
        val source = document[selected]?.takeIf { it.isObject } ?: invalid("来源账号不存在")
        val hints = listOfNotNull(
            when {
                selected.startsWith("ry::") || selected.startsWith("如鸢 - ") || selected.startsWith("如鸢-") -> "如鸢"
                selected.startsWith("dyy::") || selected.startsWith("代号鸢 - ") || selected.startsWith("代号鸢-") -> "代号鸢"
                else -> null
            },
            source["__server__"]?.let {
                when (it.asText()) {
                    "ry" -> "如鸢"
                    "dyy" -> "代号鸢"
                    else -> invalid("旧账号服别字段非法")
                }
            },
            request.sourceGame,
        )
        if (hints.isEmpty()) invalid("来源缺少游戏信息，请明确选择来源游戏")
        if (hints.distinct().size != 1 || hints.first() !in BondRules.games) invalid("来源游戏信息冲突或非法")
        if (hints.first() != owner.game) invalid("来源游戏与目标账号不匹配")
        val ignored = setOf("__missing__", "__server__", "__server_overrides__", "yuan_server_overrides")
        val rows = source.fields().asSequence().filter { it.key !in ignored }.map { it.key to it.value }.toList()
        if (rows.size > BondRules.MAX_RECORDS) invalid("单个来源账号最多5000条记录")
        return rows
    }

    private fun legacyKeys(data: BondPublication): Map<String, List<String>> {
        val names = operators.catalog().operators.associate { it.id to it.name }
        return data.entries.groupBy { e ->
            val members = e.members.map { names[it] ?: conflict("密探资料缺失，无法可靠映射旧键") }.sorted().joinToString("_")
            "${members}_${BondRules.actions.getValue(e.action)}_${BondRules.weathers.getValue(e.weather)}"
        }.mapValues { (_, entries) -> entries.map { it.bondId } }
    }

    private fun checked(current: BondArchive, expected: Long, version: String): BondPublication {
        if (expected < 0 || revision(current) != expected) conflict("档案已由其他设备修改，请重新读取或预览")
        return catalog.catalog(current.game).also { if (it.catalogVersion != version) conflict("目录已变化，请重新读取或预览") }
    }
    private fun persist(owner: SubAccount, current: BondArchive, data: BondPublication, records: List<BondRecord>): BondArchiveResponse {
        if (records.size > BondRules.MAX_RECORDS) invalid("档案最多5000条")
        val next = current.copy(records = records)
        if (mapper.writeValueAsBytes(backup(owner, next, data)).size > BondRules.NATIVE_BYTES) invalid("原生备份将超过2MiB，未写入任何内容")
        if (!accounts.fenceRecruitmentWrite(owner.userId, owner.accountId, owner.game)) conflict("账号已修改或删除，请重新读取")
        if (data.entries.isNotEmpty()) catalog.fence(owner.game, data.catalogVersion)
        if (records == current.records) return response(current, data)
        BondRules.summary(data.entries, records)
        return response(repository.save(next), data)
    }
    private fun now() = Instant.now().truncatedTo(ChronoUnit.MILLIS)
    private fun <T : Any> write(action: () -> T): T = try {
        checkNotNull(transaction.execute { action() })
    } catch (_: OptimisticLockingFailureException) {
        conflict("档案版本冲突，请重新读取或预览")
    } catch (_: DuplicateKeyException) {
        conflict("档案版本冲突，请重新读取或预览")
    } catch (error: RuntimeException) {
        if (RecruitmentService.isWriteConflict(error)) conflict("账号或目录正在修改，请重试")
        throw error
    }
}
