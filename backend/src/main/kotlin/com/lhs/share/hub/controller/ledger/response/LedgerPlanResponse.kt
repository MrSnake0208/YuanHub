package com.lhs.share.hub.controller.ledger.response

import com.lhs.share.hub.repository.entity.CartItem
import com.lhs.share.hub.repository.entity.CustomPackage
import com.lhs.share.hub.repository.entity.LedgerPlan
import com.lhs.share.hub.repository.entity.LedgerPricing
import com.lhs.share.hub.repository.entity.PackageSnapshot
import com.lhs.share.hub.repository.entity.PlanSummary
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

/**
 * 广陵账房方案响应(全量,含购物车大明细;不暴露 share_token/shared)
 */
data class LedgerPlanResponse(
    val id: String,
    val userId: String,
    val name: String,
    val version: String,
    val exchangeRate: Double?,
    val initialPoints: Int,
    val cartItems: List<CartItemDto>,
    val customPackages: List<CustomPackageDto>,
    val summary: PlanSummaryDto?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val pricing: LedgerPricing? = null,
) {
    companion object {
        fun of(plan: LedgerPlan): LedgerPlanResponse = LedgerPlanResponse(
            id = checkNotNull(plan.id) { "实体未持久化" },
            userId = plan.userId,
            name = plan.name,
            version = plan.version,
            exchangeRate = plan.exchangeRate,
            initialPoints = plan.initialPoints,
            cartItems = plan.cartItems.map { CartItemDto.of(it) },
            customPackages = plan.customPackages.map { CustomPackageDto.of(it) },
            summary = plan.summary?.let { PlanSummaryDto.of(it) },
            createdAt = plan.createdAt,
            updatedAt = plan.updatedAt,
            pricing = plan.pricing,
        )
    }
}

/**
 * 列表项(轻量:不含 cart_items/custom_packages 大明细)
 */
data class PlanListItemDto(
    val id: String,
    val name: String,
    val version: String,
    val exchangeRate: Double?,
    val initialPoints: Int,
    val summary: PlanSummaryDto?,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    companion object {
        fun of(plan: LedgerPlan): PlanListItemDto = PlanListItemDto(
            id = checkNotNull(plan.id) { "实体未持久化" },
            name = plan.name,
            version = plan.version,
            exchangeRate = plan.exchangeRate,
            initialPoints = plan.initialPoints,
            summary = plan.summary?.let { PlanSummaryDto.of(it) },
            createdAt = plan.createdAt,
            updatedAt = plan.updatedAt,
        )
    }
}

data class CartItemDto(
    val contentId: Long,
    val quantity: Int,
    val packageSnapshot: PackageSnapshotDto,
) {
    companion object {
        fun of(item: CartItem): CartItemDto = CartItemDto(
            contentId = item.contentId,
            quantity = item.quantity,
            packageSnapshot = PackageSnapshotDto.of(item.packageSnapshot),
        )
    }
}

data class PackageSnapshotDto(
    val name: String,
    val category: String?,
    val points: Int,
    val draws: Double,
    val limit: Int,
    val priceUsd: Double?,
    val priceCny: Double?,
    val sortId: Int?,
    val extra: String?,
    val custom: Boolean,
    val priceAmount: Double? = null,
    val priceCurrency: String? = null,
    val discountEligible: Boolean = true,
) {
    companion object {
        fun of(snapshot: PackageSnapshot): PackageSnapshotDto = PackageSnapshotDto(
            name = snapshot.name,
            category = snapshot.category,
            points = snapshot.points,
            draws = snapshot.draws,
            limit = snapshot.limit,
            priceUsd = snapshot.priceUsd,
            priceCny = snapshot.priceCny,
            sortId = snapshot.sortId,
            extra = snapshot.extra,
            custom = snapshot.custom,
            priceAmount = snapshot.priceAmount,
            priceCurrency = snapshot.priceCurrency,
            discountEligible = snapshot.discountEligible,
        )
    }
}

data class CustomPackageDto(
    val id: Long,
    val name: String,
    val category: String?,
    val points: Int,
    val draws: Double,
    val limit: Int,
    val priceUsd: Double?,
    val priceCny: Double?,
    val sortId: Int?,
    val extra: String?,
    val priceAmount: Double? = null,
    val priceCurrency: String? = null,
    val discountEligible: Boolean = true,
) {
    companion object {
        fun of(pkg: CustomPackage): CustomPackageDto = CustomPackageDto(
            id = pkg.id,
            name = pkg.name,
            category = pkg.category,
            points = pkg.points,
            draws = pkg.draws,
            limit = pkg.limit,
            priceUsd = pkg.priceUsd,
            priceCny = pkg.priceCny,
            sortId = pkg.sortId,
            extra = pkg.extra,
            priceAmount = pkg.priceAmount,
            priceCurrency = pkg.priceCurrency,
            discountEligible = pkg.discountEligible,
        )
    }
}

data class PlanSummaryDto(
    @Schema(description = "合计金额 CNY(daihao 按 price_usd × exchange_rate 折算)")
    val totalCny: Double,
    @Schema(description = "购物车礼包积分合计,不含 initial_points(总积分 = total_points + initial_points)")
    val totalPoints: Long,
    @Schema(description = "总抽数,可为小数")
    val totalDraws: Double,
    val totalAmount: Double? = null,
    val currency: String = "CNY",
) {
    companion object {
        fun of(summary: PlanSummary): PlanSummaryDto = PlanSummaryDto(
            totalCny = summary.totalCny,
            totalPoints = summary.totalPoints,
            totalDraws = summary.totalDraws,
            totalAmount = summary.totalAmount,
            currency = summary.currency,
        )
    }
}
