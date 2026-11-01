package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 广陵账房方案快照(HubBackend.hub_ledger_plan)
 *
 * 一用户多方案;每条方案绑定单一 version;只存源状态,派生量由前端重算。
 * userId 引用 MaaBackend.maa_user.userId,跨库无法 join;方案为私有数据,
 * 读写一律带 userId 归属条件。
 */
@Document("hub_ledger_plan")
@CompoundIndex(
    name = "idx_user_updated",
    def = "{'userId': 1, 'updatedAt': -1}",
)
data class LedgerPlan(
    @Id
    val id: String? = null,
    /**
     * 方案归属用户 id(引用 MaaBackend.maa_user.userId),取自 JWT,绝不由前端传入
     */
    @Indexed
    val userId: String,
    /**
     * 方案名,允许重名,以 id 区分
     */
    val name: String,
    /**
     * 版本: daihao(代号鸢,USD 计价) | ru(如鸢,CNY 计价)
     */
    val version: String,
    /**
     * USD→CNY 汇率,仅 version=daihao 生效;ru 恒为 null
     */
    val exchangeRate: Double? = null,
    /**
     * 已有初始积分(不含购物车礼包积分)
     */
    val initialPoints: Int = 0,
    /**
     * 购物车条目(含礼包快照,保证旧方案在上游目录改版后仍可读)
     */
    val cartItems: List<CartItem> = emptyList(),
    /**
     * 自定义礼包(id 由服务端重生成,前端以响应为准)
     */
    val customPackages: List<CustomPackage> = emptyList(),
    /**
     * 列表预览用摘要(保存时计算,缓存性质非权威;total_points 不含 initial_points)
     */
    val summary: PlanSummary? = null,
    /**
     * 公开分享 token(预留,本期未启用)
     */
    val shareToken: String? = null,
    /**
     * 是否公开分享(预留,本期恒为 false)
     */
    val shared: Boolean = false,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
    val pricing: LedgerPricing? = null,
) : Serializable

/** Personal budget settings; rates are CNY per unit of foreign currency. Null pricing denotes a legacy plan. */
data class LedgerPricing(
    val currency: String = "CNY",
    val rates: Map<String, Double> = emptyMap(),
    val discountPercent: Double = 100.0,
    val customOnly: Boolean = false,
)

/**
 * 购物车条目:礼包 id + 数量 + 礼包快照
 */
data class CartItem(
    /**
     * 礼包 id(内置礼包 id 或自定义礼包 id,统一 Long)
     */
    val contentId: Long,
    val quantity: Int,
    val packageSnapshot: PackageSnapshot,
)

/**
 * 礼包快照(保存时冗余完整字段,上游 packages.js 改版后旧方案仍可读)
 */
data class PackageSnapshot(
    val name: String,
    val category: String? = null,
    val points: Int = 0,
    /**
     * 抽数,可能为小数(如首充双倍 0.6 抽),故用 Double
     */
    val draws: Double = 0.0,
    val limit: Int = 999,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val sortId: Int? = null,
    val extra: String? = null,
    /**
     * 是否自定义礼包(服务端按 content_id 归属回写)
     */
    val custom: Boolean = false,
    val priceAmount: Double? = null,
    val priceCurrency: String? = null,
    val discountEligible: Boolean = true,
)

/**
 * 自定义礼包(id 由服务端重生成,保证批内唯一且与内置礼包 id 不冲突)
 */
data class CustomPackage(
    val id: Long,
    val name: String,
    val category: String? = null,
    val points: Int = 0,
    val draws: Double = 0.0,
    val limit: Int = 999,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val sortId: Int? = null,
    val extra: String? = null,
    val priceAmount: Double? = null,
    val priceCurrency: String? = null,
    val discountEligible: Boolean = true,
)

/**
 * 方案摘要(保存时由服务端计算,缓存性质非权威)
 */
data class PlanSummary(
    /**
     * 合计金额 CNY(daihao 按 price_usd × exchange_rate 折算)
     */
    val totalCny: Double = 0.0,
    /**
     * 购物车礼包积分合计(不含 initial_points)
     */
    val totalPoints: Long = 0,
    /**
     * 总抽数(可能为小数)
     */
    val totalDraws: Double = 0.0,
    val totalAmount: Double? = null,
    val currency: String = "CNY",
)
