package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.achievement.request.AchievementImportRequest
import com.lhs.share.hub.controller.achievement.request.AchievementPatch
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.response.AchievementArchiveResponse
import com.lhs.share.hub.controller.achievement.response.AchievementBackupResponse
import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.controller.achievement.response.AchievementImportItem
import com.lhs.share.hub.controller.achievement.response.AchievementPreviewResponse
import com.lhs.share.hub.controller.achievement.response.AchievementSourceAccount
import com.lhs.share.hub.repository.AchievementRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.AchievementArchive
import com.lhs.share.hub.repository.entity.AchievementRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class AchievementService(
    private val repository: AchievementRepository,
    private val accounts: SubAccountRepository,
    private val catalog: AchievementCatalogService,
    private val mapper: ObjectMapper,
    private val previews: AchievementImportPreviews,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
    private val bonds: com.lhs.share.hub.service.bond.BondService? = null,
) {
    fun archive(userId: String, accountId: String): AchievementArchiveResponse = response(load(account(userId, accountId)))

    fun export(userId: String, accountId: String): AchievementBackupResponse {
        val owner = account(userId, accountId)
        val current = load(owner)
        return backup(owner, current.records)
    }

    private fun backup(owner: SubAccount, records: List<AchievementRecord>) = AchievementBackupResponse(
        game = owner.game,
        catalogVersion = catalog.catalog(owner.game).catalogVersion,
        exportedAt = Instant.now(),
        sourceAccount = AchievementSourceAccount(owner.name),
        records = records,
    )

    fun update(userId: String, accountId: String, expectedRevision: Long, patches: List<AchievementPatch>): AchievementArchiveResponse =
        write {
            if (patches.size !in 1..50 || patches.map { it.achievementId }.distinct().size != patches.size) invalid("批量须为1–50个不同成就")
            val owner = account(userId, accountId)
            val current = load(owner)
            checkRevision(current, expectedRevision)
            val entries = catalog.catalog(owner.game).entries.associateBy { it.achievementId }
            val records = current.records.associateBy { it.achievementId }.toMutableMap()
            patches.forEach { patch ->
                val entry = entries[patch.achievementId] ?: invalid("当前游戏目录中不存在此成就：${patch.achievementId}")
                val old = records[patch.achievementId]
                val next = apply(old, patch, entry, false)
                if (!sameContent(old, next)) records[patch.achievementId] = stamp(old, next, currentRevision(current) + 1, "manual")
            }
            persist(owner, current, records.values.toList())
        }

    fun preview(userId: String, request: AchievementImportRequest): AchievementPreviewResponse {
        val owner = account(userId, request.accountId)
        val preview = plan(owner, load(owner), request).preview
        return preview.copy(previewToken = previews.issue(owner, request, preview))
    }

    fun confirm(userId: String, request: AchievementImportRequest): AchievementArchiveResponse = write {
        val owner = account(userId, request.accountId)
        previews.requireMatch(owner, request)
        val current = load(owner)
        checkRevision(current, request.expectedRevision ?: invalid("请先生成预览"))
        if (request.catalogVersion != catalog.catalog(owner.game).catalogVersion) throw conflict("目录已变化，请重新预览")
        val plan = plan(owner, current, request)
        if (plan.preview.stats.getValue("invalid") > 0) invalid("文件含非法记录，未写入任何内容；请修正后重新预览")
        if (plan.preview.stats.getValue("unknown") > 0 && !request.skipUnknown) invalid("请明确确认跳过未知 ID 后再导入")
        persist(owner, current, plan.records)
    }

    private data class ImportPlan(val preview: AchievementPreviewResponse, val records: List<AchievementRecord>)

    private fun plan(owner: SubAccount, current: AchievementArchive, request: AchievementImportRequest): ImportPlan {
        val document = request.document
        AchievementRequestDecoder.objectFields(
            document,
            setOf("format", "schema_version", "game", "catalog_version", "exported_at", "source_account", "records"),
        )
        if (document.path("format").asText() != "yuanhub-achievement" || !document.path("schema_version").isIntegralNumber ||
            !document.path("schema_version").canConvertToInt() ||
            document.path("schema_version").intValue() != 1
        ) {
            invalid("不支持的成就备份格式或 schema_version")
        }
        if (AchievementRequestDecoder.text(document, "game") != owner.game) invalid("备份游戏与目标账号不匹配")
        AchievementRequestDecoder.text(document, "catalog_version")
        val rows = document["records"]?.takeIf { it.isArray && it.size() <= AchievementRequestDecoder.MAX_IMPORT }
            ?: invalid("records 必须是数组且最多5000条")
        val data = catalog.catalog(owner.game)
        val entries = data.entries.associateBy { it.achievementId }
        val otherGame = if (owner.game == "如鸢") "代号鸢" else "如鸢"
        val foreign = catalog.catalog(otherGame).entries.map { it.achievementId }.toSet()
        val records = current.records.associateBy { it.achievementId }.toMutableMap()
        val seen = mutableSetOf<String>()
        val items = rows.mapIndexed { index, row ->
            try {
                val patch = AchievementRequestDecoder.patch(row, true)
                if (!seen.add(patch.achievementId)) invalid("文件中存在重复 ID")
                if (patch.achievementId in foreign) invalid("此 ID 属于另一游戏")
                val entry = entries[patch.achievementId]
                if (entry == null) {
                    AchievementImportItem(index, patch.achievementId, "unknown", "不在当前有效目录，确认后跳过；不会创建假条目")
                } else {
                    val old = records[patch.achievementId]
                    val next = apply(old, patch, entry, true)
                    val outcome = if (sameContent(old, next)) {
                        "same"
                    } else if (old?.substantive() == true) {
                        "conflict"
                    } else {
                        "add"
                    }
                    if (outcome == "add" || outcome == "conflict" && request.strategy == "use_file") {
                        records[patch.achievementId] = stamp(old, next, currentRevision(current) + 1, "import")
                    }
                    AchievementImportItem(index, patch.achievementId, outcome)
                }
            } catch (error: InventoryApiException) {
                AchievementImportItem(
                    index,
                    row["achievement_id"]?.takeIf {
                        it.isTextual
                    }?.textValue()?.take(100),
                    "invalid",
                    error.message,
                )
            }
        }
        val stats = listOf("add", "same", "conflict", "unknown", "invalid").associateWith { outcome ->
            items.count { it.outcome == outcome }
        }
        val affected = if (stats.getValue("invalid") >
            0
        ) {
            0
        } else {
            stats.getValue("add") + if (request.strategy == "use_file") stats.getValue("conflict") else 0
        }
        return ImportPlan(
            AchievementPreviewResponse(
                owner.accountId,
                owner.game,
                currentRevision(current),
                data.catalogVersion,
                request.strategy,
                stats,
                items,
                affected,
            ),
            records.values.toList(),
        )
    }

    private fun apply(old: AchievementRecord?, patch: AchievementPatch, entry: AchievementEntry, importing: Boolean): AchievementRecord {
        val base = old ?: AchievementRecord(patch.achievementId, updatedAt = Instant.EPOCH, revision = 0, source = "manual")
        val fields = patch.fields
        val status = if ("status" in fields) patch.status else base.status
        val progress = if ("progress" in fields) patch.progress else base.progress
        if ("progress" in fields && progress != null &&
            (entry.target == null || !progress.isFinite() || progress < 0 || progress > 9007199254740991.0 || progress % 1.0 != 0.0)
        ) {
            invalid("此成就不支持该数值口径")
        }
        val date = if ("completed_on" in fields) {
            patch.completedOn
        } else if (status == "completed") {
            base.completedOn
        } else {
            null
        }
        if (date != null && status != "completed") invalid("只有已完成状态可以填写实际完成日期")
        return base.copy(
            status = status,
            favorite = if ("favorite" in fields) patch.favorite else base.favorite,
            note = if ("note" in fields && (!importing || patch.note.isNotEmpty())) patch.note else base.note,
            progress = progress,
            completedOn = date,
        )
    }

    private fun sameContent(old: AchievementRecord?, next: AchievementRecord): Boolean = if (old == null) {
        !next.substantive()
    } else {
        old.status == next.status && old.favorite == next.favorite && old.note == next.note && old.progress == next.progress &&
            old.completedOn == next.completedOn
    }

    private fun stamp(old: AchievementRecord?, next: AchievementRecord, revision: Long, source: String): AchievementRecord {
        val now = Instant.now().truncatedTo(ChronoUnit.MILLIS)
        val stateChanged = (old?.status ?: "pending") != next.status || old?.completedOn != next.completedOn
        val progressChanged = old?.progress != next.progress
        return next.copy(
            updatedAt = now,
            revision = revision,
            source = source,
            stateSource = if (stateChanged) source else old?.stateSource,
            stateUpdatedAt = if (stateChanged) now else old?.stateUpdatedAt,
            progressSource = if (progressChanged) source else old?.progressSource,
            progressUpdatedAt = if (progressChanged) now else old?.progressUpdatedAt,
        )
    }

    private fun account(userId: String, accountId: String): SubAccount = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "游戏账号不存在")

    private fun load(owner: SubAccount): AchievementArchive {
        val current = repository.find(owner.userId, owner.accountId) ?: AchievementArchive(
            id = "ach_${UUID.randomUUID()}",
            userId = owner.userId,
            accountId = owner.accountId,
            game = owner.game,
        )
        if (current.game != owner.game) throw conflict("档案游戏与账号不一致，请重新读取账号")
        return current
    }

    private fun persist(owner: SubAccount, current: AchievementArchive, records: List<AchievementRecord>): AchievementArchiveResponse {
        if (records == current.records) return response(current)
        if (records.size > AchievementRequestDecoder.MAX_IMPORT) invalid("当前账号个人记录超过5000条上限，请保留备份并联系维护者")
        if (mapper.writeValueAsBytes(backup(owner, records)).size > AchievementRequestDecoder.MAX_BYTES) {
            invalid("完整备份将超过16MiB上限，请缩短备注后重试；未写入任何内容")
        }
        if (mapper.writeValueAsBytes(current.copy(records = records)).size > 15 * 1024 * 1024) {
            invalid("个人档案超过15MiB安全上限，请缩短备注；未写入任何内容")
        }
        if (!accounts.fenceRecruitmentWrite(owner.userId, owner.accountId, owner.game)) throw conflict("账号已修改或删除，请重新读取")
        return response(repository.save(current.copy(records = records)))
    }

    private fun currentRevision(value: AchievementArchive): Long = value.version?.plus(1) ?: 0
    private fun response(value: AchievementArchive): AchievementArchiveResponse {
        val metrics = bonds?.archive(value.userId, value.accountId)?.let { source ->
            if (source.game != value.game) throw conflict("羁绊指标与成就账号游戏不一致")
            listOf(
                com.lhs.share.hub.controller.achievement.response.AchievementLinkedMetric(
                    "yuan_bond_variants",
                    source.summary.triggeredCount,
                    source.revision,
                    source.catalogVersion,
                ),
            )
        } ?: emptyList()
        return AchievementArchiveResponse(value.accountId, value.game, currentRevision(value), value.records, metrics)
    }
    private fun checkRevision(value: AchievementArchive, expected: Long) {
        if (expected < 0 || currentRevision(value) != expected) throw conflict("档案已由其它设备修改，请读取最新内容后重试")
    }

    private fun <T : Any> write(action: () -> T): T = try {
        checkNotNull(transaction.execute { action() })
    } catch (_: OptimisticLockingFailureException) {
        throw conflict("档案已变化，请重新读取或预览")
    } catch (_: DuplicateKeyException) {
        throw conflict("档案已变化，请重新读取或预览")
    } catch (error: RuntimeException) {
        if (RecruitmentService.isWriteConflict(error)) throw conflict("账号或档案正在被修改，请重新读取或预览")
        throw error
    }

    private fun conflict(message: String) = InventoryApiException(HttpStatus.CONFLICT, "achievement_conflict", message)
}
