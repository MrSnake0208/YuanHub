package com.lhs.share.hub.service.ledger

import com.lhs.share.hub.controller.ledger.request.LedgerCampaignWrite
import com.lhs.share.hub.controller.ledger.request.LedgerPackageWrite
import com.lhs.share.hub.controller.ledger.request.LedgerSettingsWrite
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.repository.entity.AdminAuditAction
import com.lhs.share.hub.repository.entity.AdminAuditLog
import com.lhs.share.hub.repository.entity.AdminAuditSnapshot
import com.lhs.share.hub.repository.entity.LedgerCampaign
import com.lhs.share.hub.repository.entity.LedgerCatalogPackage
import com.lhs.share.hub.repository.entity.LedgerCatalogSettings
import com.lhs.share.hub.service.admin.AdminAuditService
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

class LedgerCatalogException(val status: HttpStatus, override val message: String) : RuntimeException(message)
fun ledgerInvalid(message: String) = LedgerCatalogException(HttpStatus.UNPROCESSABLE_ENTITY, message)
fun ledgerConflict() = LedgerCatalogException(HttpStatus.CONFLICT, "数据已被其他管理员修改，请返回列表刷新后重试")

data class LedgerCatalogResponse(
    val packages: List<LedgerCatalogPackage>,
    val campaigns: List<LedgerCampaign>,
    val settings: LedgerCatalogSettings,
)

@Service
class LedgerCatalogService(private val repository: LedgerCatalogRepository, private val audit: AdminAuditService) {
    fun catalog(admin: Boolean = false): LedgerCatalogResponse = LedgerCatalogResponse(
        repository.packages().filter {
            admin || it.enabled
        }.sortedWith(compareBy<LedgerCatalogPackage> { it.sortId }.thenBy { it.contentId }),
        repository.campaigns().filter { admin || it.status == "published" }.map {
            if (admin) it else it.copy(tiers = it.tiers.filter { tier -> tier.enabled })
        }.sortedBy { it.endsAt },
        repository.settings() ?: throw LedgerCatalogException(HttpStatus.SERVICE_UNAVAILABLE, "公共目录尚未初始化"),
    )

    fun savePackage(actor: String, id: String?, input: LedgerPackageWrite): LedgerCatalogPackage {
        game(input.game)
        text(input.name, 120, "礼包名称")
        text(input.category, 40, "分类")
        if (input.extra.length > 1000) throw ledgerInvalid("补充说明最多1000字")
        if (input.points !in 0..10000000 || !input.draws.isFinite() || input.draws !in 0.0..1000000.0 ||
            input.limit !in 1..9999 || input.sortId !in 0..1000000
        ) {
            throw ledgerInvalid("积分、抽数、限购或排序超出范围")
        }
        val price = if (input.game == "daihao") input.priceUsd else input.priceCny
        if (price == null || !price.isFinite() || price !in 0.0..10000000.0 ||
            (input.game == "daihao" && input.priceCny != null) || (input.game == "ru" && input.priceUsd != null)
        ) {
            throw ledgerInvalid("请填写所属游戏币种的有效价格")
        }
        val old = id?.let { repository.findPackage(it) ?: throw LedgerCatalogException(HttpStatus.NOT_FOUND, "礼包不存在") }
        expected(old?.version, input.expectedVersion, old != null)
        if (old != null && old.game != input.game) throw ledgerInvalid("既有礼包不能改变游戏")
        val contentId = old?.contentId ?: repository.nextId(input.game)
        val next = LedgerCatalogPackage(
            old?.id ?: "${input.game}:$contentId", input.game, contentId, input.name.trim(), input.points, input.draws,
            input.limit, input.priceUsd, input.priceCny, input.category.trim(), input.sortId, input.extra.trim(),
            input.enabled, old?.version,
        )
        val saved = cas { if (old == null) repository.insert(next) else repository.save(next) }
        record(actor, saved.id, old?.toString(), saved.toString())
        return saved
    }

    fun previewCampaign(input: LedgerCampaignWrite, historical: Boolean = false): LedgerCampaign {
        game(input.game)
        text(input.name, 120, "活动名称")
        if (input.timeZone !in ZoneId.getAvailableZoneIds()) throw ledgerInvalid("请选择有效的IANA时区")
        if ((!historical && input.startsAt == null) || (input.startsAt != null && input.startsAt >= input.endsAt)) {
            throw ledgerInvalid("开始时间必填且必须早于结束时间")
        }
        if (input.status !in setOf("draft", "published", "disabled")) throw ledgerInvalid("不支持的活动状态")
        if (input.tiers.size !in 1..100) throw ledgerInvalid("活动必须有1至100个档位")
        if (input.status == "published" && input.tiers.none { it.enabled }) throw ledgerInvalid("发布至少需要一个启用档位")
        if (input.tiers.map { it.points }.distinct().size != input.tiers.size) throw ledgerInvalid("档位积分不能重复")
        input.tiers.forEach { tier ->
            if (tier.points !in 1..10000000 || tier.sortId !in 0..1000000 || tier.rewards.size !in 1..30) {
                throw ledgerInvalid("档位积分、顺序或奖励条数不正确")
            }
            tier.rewards.forEach { reward ->
                text(reward.name, 120, "奖励名称")
                if (reward.count !in 1..10000000) throw ledgerInvalid("奖励数量必须在1至10000000之间")
            }
        }
        return LedgerCampaign(
            "preview",
            input.game,
            input.name.trim(),
            input.startsAt,
            input.endsAt,
            input.timeZone,
            input.status,
            input.tiers.sortedWith(compareBy<com.lhs.share.hub.repository.entity.LedgerTier> { it.sortId }.thenBy { it.points }),
        )
    }

    fun saveCampaign(actor: String, id: String?, input: LedgerCampaignWrite): LedgerCampaign {
        val old = id?.let { repository.findCampaign(it) ?: throw LedgerCatalogException(HttpStatus.NOT_FOUND, "活动不存在") }
        expected(old?.version, input.expectedVersion, old != null)
        if (old != null && old.game != input.game) throw ledgerInvalid("既有活动不能改变游戏")
        val historical = old?.sourceNote?.isNotEmpty() == true && input.startsAt == null && input.endsAt == old.endsAt
        val next = previewCampaign(input, historical).copy(
            id = old?.id ?: UUID.randomUUID().toString(),
            version = old?.version,
            sourceNote = old?.sourceNote.orEmpty(),
        )
        val saved = cas { if (old == null) repository.insert(next) else repository.save(next) }
        record(actor, saved.id, old?.toString(), saved.toString())
        return saved
    }

    fun saveSettings(actor: String, input: LedgerSettingsWrite): LedgerCatalogSettings {
        if (!input.exchangeRate.isFinite() || input.exchangeRate !in 0.0001..10000.0) throw ledgerInvalid("默认汇率必须大于0且不超过10000")
        val old = repository.settings() ?: throw LedgerCatalogException(HttpStatus.SERVICE_UNAVAILABLE, "默认设置未初始化")
        expected(old.version, input.expectedVersion, true)
        val saved = cas { repository.save(old.copy(exchangeRate = input.exchangeRate, updatedAt = Instant.now())) }
        record(actor, "settings:default", old.toString(), saved.toString())
        return saved
    }

    private fun expected(current: Long?, expected: Long?, exists: Boolean) {
        if (!exists && expected != null) throw ledgerInvalid("新建不接受expected_version")
        if (exists && (expected == null || expected < 0)) throw ledgerInvalid("更新必须提供expected_version")
        if (exists && current != expected) throw ledgerConflict()
    }
    private fun game(value: String) {
        if (value !in setOf("daihao", "ru")) throw ledgerInvalid("游戏仅支持daihao或ru")
    }
    private fun text(value: String, max: Int, label: String) {
        if (value.isBlank() || value.length > max) throw ledgerInvalid("$label 不能为空且最多$max 字")
    }
    private fun <T> cas(save: () -> T): T = try {
        save()
    } catch (error: OptimisticLockingFailureException) {
        throw ledgerConflict()
    }
    private fun record(actor: String, resource: String, before: String?, after: String) {
        audit.record(
            AdminAuditLog(
                actorUserId = actor,
                action = AdminAuditAction.LEDGER_CATALOG_UPDATED,
                targetResource = "ledger:$resource",
                before = before?.let { AdminAuditSnapshot(ledger = mapOf("value" to it)) },
                after = AdminAuditSnapshot(ledger = mapOf("value" to after)),
            ),
        )
    }
}
