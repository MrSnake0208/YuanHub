package com.lhs.share.hub.controller.ledger.request

import com.lhs.share.hub.repository.entity.LedgerPricing
import jakarta.validation.Valid
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/**
 * 创建/整体替换广陵账房方案请求(Jackson SNAKE_CASE 反序列化)
 *
 * 版本价格二选一(daihao 填 price_usd、ru 填 price_cny)由服务层校验,
 * Bean Validation 只负责字段级基础约束。
 */
data class LedgerPlanCreateRequest(
    @field:NotBlank(message = "方案名不能为空")
    @field:Size(max = 50, message = "方案名最长 50 个字符")
    val name: String,
    @field:NotBlank(message = "版本不能为空")
    @field:Pattern(regexp = "daihao|ru", message = "版本仅支持 daihao 或 ru")
    val version: String,
    @field:Min(value = 0, message = "汇率不能为负")
    val exchangeRate: Double? = null,
    @field:Min(value = 0, message = "初始积分不能为负")
    val initialPoints: Int = 0,
    @field:Valid
    @field:Size(max = 200, message = "购物车条目最多 200 条")
    val cartItems: List<CartItemRequest> = emptyList(),
    @field:Valid
    @field:Size(max = 50, message = "自定义礼包最多 50 个")
    val customPackages: List<CustomPackageRequest> = emptyList(),
    val pricing: LedgerPricing? = null,
)

/**
 * 购物车条目请求
 */
data class CartItemRequest(
    @field:Min(value = 1, message = "礼包 id 非法")
    val contentId: Long,
    @field:Min(value = 1, message = "数量至少 1")
    @field:Max(value = 9999, message = "数量超出上限")
    val quantity: Int,
    @field:Valid
    val packageSnapshot: PackageSnapshotRequest,
)

/**
 * 礼包快照请求(内置/自定义礼包均冗余快照)
 */
data class PackageSnapshotRequest(
    @field:NotBlank(message = "礼包名不能为空")
    val name: String,
    val category: String? = null,
    @field:Min(value = 0, message = "积分不能为负")
    val points: Int = 0,
    @field:DecimalMin(value = "0.0", message = "抽数不能为负")
    val draws: Double = 0.0,
    @field:Min(value = 1, message = "限购数至少为 1")
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
 * 自定义礼包请求(id 为前端 Date.now() 时间戳,服务端保存时重生成)
 */
data class CustomPackageRequest(
    val id: Long? = null,
    @field:NotBlank(message = "礼包名不能为空")
    val name: String,
    val category: String? = null,
    @field:Min(value = 0, message = "积分不能为负")
    val points: Int = 0,
    @field:DecimalMin(value = "0.0", message = "抽数不能为负")
    val draws: Double = 0.0,
    @field:Min(value = 1, message = "限购数至少为 1")
    val limit: Int = 999,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val sortId: Int? = null,
    val extra: String? = null,
    val priceAmount: Double? = null,
    val priceCurrency: String? = null,
    val discountEligible: Boolean = true,
)
