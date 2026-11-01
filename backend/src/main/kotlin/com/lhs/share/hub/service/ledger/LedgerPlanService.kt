package com.lhs.share.hub.service.ledger

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.ledger.request.CartItemRequest
import com.lhs.share.hub.controller.ledger.request.CustomPackageRequest
import com.lhs.share.hub.controller.ledger.request.LedgerPlanCreateRequest
import com.lhs.share.hub.controller.ledger.request.PackageSnapshotRequest
import com.lhs.share.hub.controller.ledger.response.LedgerPlanResponse
import com.lhs.share.hub.controller.ledger.response.PlanListItemDto
import com.lhs.share.hub.repository.LedgerPlanRepository
import com.lhs.share.hub.repository.entity.CartItem
import com.lhs.share.hub.repository.entity.CustomPackage
import com.lhs.share.hub.repository.entity.LedgerPlan
import com.lhs.share.hub.repository.entity.LedgerPricing
import com.lhs.share.hub.repository.entity.PackageSnapshot
import com.lhs.share.hub.repository.entity.PlanSummary
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * 广陵账房方案服务(HubBackend.hub_ledger_plan)
 *
 * 数据写入 Hub 库;方案为私有数据,userId 一律取自当前登录用户(JWT),
 * 查询/更新/删除均带 userId 归属条件,越权与不存在统一 404(不泄露存在性)。
 */
@Service
class LedgerPlanService(
    private val repository: LedgerPlanRepository,
    private val properties: ShareProperties,
) {
    /**
     * 创建方案(超出每用户上限抛 429)
     */
    fun create(userId: String, request: LedgerPlanCreateRequest): LedgerPlanResponse {
        val maxPlans = properties.ledger.maxPlansPerUser
        if (repository.countByUserId(userId) >= maxPlans) {
            throw ApiResultException(HttpStatus.TOO_MANY_REQUESTS.value(), "方案数量已达上限($maxPlans),请删除后再创建")
        }
        return LedgerPlanResponse.of(repository.save(normalize(userId, request)))
    }

    /**
     * 整体替换更新(不存在或非本人抛 404;保留原 id 与 createdAt)
     */
    fun update(userId: String, id: String, request: LedgerPlanCreateRequest): LedgerPlanResponse {
        val existing = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "方案不存在: $id")
        if (existing.pricing != null && request.pricing == null) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "此方案包含新版币种或折扣设置，请刷新页面后再保存")
        }
        val merged = normalize(userId, request).copy(id = id, createdAt = existing.createdAt)
        return LedgerPlanResponse.of(repository.save(merged))
    }

    /**
     * 方案详情(仅本人;跨用户 404 不暴露存在性)
     */
    fun getById(userId: String, id: String): LedgerPlanResponse {
        val plan = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "方案不存在: $id")
        return LedgerPlanResponse.of(plan)
    }

    /**
     * 我的方案列表(按 updatedAt 倒序;可选 version 过滤;轻量摘要不含大明细)
     */
    fun list(userId: String, version: String?): List<PlanListItemDto> = repository.findByUserIdOrderByUpdatedAtDesc(userId)
        .filter { version == null || it.version == version }
        .map { PlanListItemDto.of(it) }

    /**
     * 删除方案(硬删除;不存在或非本人抛 404)
     *
     * 采用「先查归属再 deleteById」而非派生删除:归属校验在前、
     * 语义清晰,且不受 Spring Data MongoDB 派生删除返回类型版本差异影响。
     */
    fun delete(userId: String, id: String) {
        val plan = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "方案不存在: $id")
        repository.deleteById(plan.checkId())
    }

    /**
     * 已加载实体的 id 必然非空(否则不存在于库中),集中校验避免空指针。
     */
    private fun LedgerPlan.checkId(): String = checkNotNull(id) { "实体未持久化" }

    // ==================== 归一化 ====================

    /**
     * 请求归一化为实体:
     * 1. 显式标价与计价设置校验;无显式标价时沿用版本价格;
     * 2. 自定义礼包 id 重生成(毫秒时间戳+批内序号)并回写购物车引用;
     * 3. 快照/自定义礼包的非本版本价格字段置 null;
     * 4. 计算列表预览摘要。
     */
    private fun normalize(userId: String, request: LedgerPlanCreateRequest): LedgerPlan {
        validatePricing(request)
        validatePricesByVersion(request)

        val isDaihao = request.version == VERSION_DAIHAO
        val pricing = request.pricing?.let {
            if ("USD" !in it.rates && request.exchangeRate != null) {
                it.copy(rates = it.rates + ("USD" to request.exchangeRate))
            } else {
                it
            }
        }
        val now = Instant.now()
        val customs = normalizeCustomPackages(request.customPackages, now.toEpochMilli(), isDaihao, request.pricing == null)
        val customNewIds = customs.packages.map { it.id }.toSet()
        val customIndex = customs.packages.associateBy { it.id }
        val items = normalizeCartItems(request.cartItems, customs.oldIdToNewId, customNewIds, isDaihao).map { item ->
            val custom = customIndex[item.contentId]
            // New plans calculate from the same custom definition that the client restores.
            if (pricing != null && custom != null) {
                item.copy(
                    packageSnapshot = PackageSnapshot(
                        name = custom.name, category = custom.category, points = custom.points, draws = custom.draws,
                        limit = custom.limit, priceUsd = custom.priceUsd, priceCny = custom.priceCny,
                        sortId = custom.sortId, extra = custom.extra, custom = true,
                        priceAmount = custom.priceAmount, priceCurrency = custom.priceCurrency, discountEligible = custom.discountEligible,
                    ),
                )
            } else {
                item
            }
        }

        return LedgerPlan(
            userId = userId,
            name = request.name.trim(),
            version = request.version,
            exchangeRate = if (isDaihao) request.exchangeRate else null,
            initialPoints = request.initialPoints,
            cartItems = items,
            customPackages = customs.packages,
            summary = buildSummary(items, isDaihao, request.exchangeRate, pricing),
            pricing = pricing,
            createdAt = now,
            updatedAt = now,
        )
    }

    /**
     * 版本价格二选一校验(服务层补充校验,违反抛 400)
     */
    private fun validatePricesByVersion(request: LedgerPlanCreateRequest) {
        val isDaihao = request.version == VERSION_DAIHAO
        request.customPackages.forEach { pkg ->
            if (pkg.priceAmount != null) return@forEach
            if (isDaihao && pkg.priceUsd == null) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "代号鸢(daihao)自定义礼包必须填写 price_usd")
            }
            if (!isDaihao && pkg.priceCny == null) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "如鸢(ru)自定义礼包必须填写 price_cny")
            }
        }
        request.cartItems.forEach { item ->
            val snapshot = item.packageSnapshot
            if (snapshot.priceAmount != null) return@forEach
            if (isDaihao && snapshot.priceUsd == null) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "代号鸢(daihao)礼包快照必须填写 price_usd")
            }
            if (!isDaihao && snapshot.priceCny == null) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "如鸢(ru)礼包快照必须填写 price_cny")
            }
        }
    }

    private fun invalid(message: String): Nothing = throw ApiResultException(HttpStatus.BAD_REQUEST.value(), message)

    private fun validatePricing(request: LedgerPlanCreateRequest) {
        val pricing = request.pricing
        if (request.exchangeRate != null && (!request.exchangeRate.isFinite() || request.exchangeRate < 0)) {
            invalid("参考汇率必须是有限且非负的数字")
        }
        if (pricing != null) {
            if (request.exchangeRate != null && request.exchangeRate > 1e6) invalid("参考汇率不能超过 1000000")
            if (pricing.currency !in CURRENCIES) invalid("不支持的预算币种")
            if (!pricing.discountPercent.isFinite() || pricing.discountPercent <= 0 || pricing.discountPercent > 100) {
                invalid("折扣须大于 0 且不超过 100%")
            }
            pricing.rates.forEach { (currency, rate) ->
                if (currency !in CURRENCIES - "CNY" || !rate.isFinite() || rate < 0 || rate > 1e6 ||
                    (currency != "USD" && rate == 0.0)
                ) {
                    invalid("参考汇率无效: $currency")
                }
            }
            if (rateFor(pricing.currency, pricing, request.exchangeRate) <= 0) invalid("预算显示币种的汇率必须大于 0")
        }
        fun price(amount: Double?, currency: String?, usd: Double?, cny: Double?, eligible: Boolean) {
            if ((amount == null) != (currency == null)) invalid("标价金额与币种必须同时填写")
            if ((amount != null || !eligible) && pricing == null) invalid("请使用新版计价设置保存个人价格或折扣")
            if (currency != null && currency !in CURRENCIES) invalid("不支持的标价币种")
            listOfNotNull(amount, usd, cny).forEach {
                if (!it.isFinite() || it < 0 || it > 1e9) invalid("礼包价格须为 0 至 1000000000 的有限数字")
            }
        }
        request.customPackages.forEach { price(it.priceAmount, it.priceCurrency, it.priceUsd, it.priceCny, it.discountEligible) }
        request.cartItems.forEach {
            val s = it.packageSnapshot
            price(s.priceAmount, s.priceCurrency, s.priceUsd, s.priceCny, s.discountEligible)
            if (pricing !=
                null
            ) {
                rateFor(s.priceCurrency ?: if (request.version == VERSION_DAIHAO) "USD" else "CNY", pricing, request.exchangeRate)
            }
        }
        if (pricing != null) {
            val ids = request.customPackages.mapNotNull { it.id }
            if (ids.distinct().size != ids.size) invalid("自定义礼包 ID 重复")
        }
    }

    private fun rateFor(currency: String, pricing: LedgerPricing, exchangeRate: Double?): Double {
        if (currency == "CNY") return 1.0
        val rate = pricing.rates[currency] ?: if (currency == "USD") exchangeRate else null
        if (rate == null || !rate.isFinite() || rate < 0 || rate > 1e6 || (currency != "USD" && rate == 0.0)) {
            invalid("请填写有效的 $currency 兑人民币参考汇率")
        }
        return rate
    }

    /**
     * 自定义礼包归一化:id 重生成(毫秒时间戳 + 批内序号,保证批内唯一且与
     * 内置礼包小整数 id 不冲突);旧格式同名保留首个,新格式保留独立记录。
     */
    private fun normalizeCustomPackages(
        packages: List<CustomPackageRequest>,
        idBase: Long,
        isDaihao: Boolean,
        deduplicateNames: Boolean,
    ): NormalizedCustoms {
        val oldIdToNewId = mutableMapOf<Long, Long>()
        val nameToKeptId = mutableMapOf<String, Long>()
        val result = mutableListOf<CustomPackage>()

        packages.forEachIndexed { index, pkg ->
            val newId = idBase + index
            pkg.id?.let { oldId -> oldIdToNewId.putIfAbsent(oldId, newId) }
            val name = pkg.name.trim()
            val keptId = if (deduplicateNames) nameToKeptId[name] else null
            if (keptId == null) {
                nameToKeptId[name] = newId
                result.add(
                    CustomPackage(
                        id = newId,
                        name = name,
                        category = pkg.category,
                        points = pkg.points,
                        draws = pkg.draws,
                        limit = pkg.limit,
                        priceUsd = if (isDaihao) pkg.priceUsd else null,
                        priceCny = if (isDaihao) null else pkg.priceCny,
                        sortId = pkg.sortId,
                        extra = pkg.extra,
                        priceAmount = pkg.priceAmount,
                        priceCurrency = pkg.priceCurrency,
                        discountEligible = pkg.discountEligible,
                    ),
                )
            } else {
                // 同名重复:丢弃该条,其旧 id 的购物车引用指向首个同名的新 id
                pkg.id?.let { oldId -> oldIdToNewId[oldId] = keptId }
            }
        }
        return NormalizedCustoms(result, oldIdToNewId)
    }

    /**
     * 购物车条目归一化:contentId 按自定义礼包映射回写;同 id 条目合并数量
     * (上限 9999);快照价格字段按版本置 null;custom 标记按归属回写。
     */
    private fun normalizeCartItems(
        items: List<CartItemRequest>,
        oldIdToNewId: Map<Long, Long>,
        customNewIds: Set<Long>,
        isDaihao: Boolean,
    ): List<CartItem> {
        val merged = LinkedHashMap<Long, MergedItem>()
        items.forEach { item ->
            val contentId = oldIdToNewId[item.contentId] ?: item.contentId
            val entry = merged.getOrPut(contentId) { MergedItem(0, item.packageSnapshot) }
            entry.quantity = (entry.quantity + item.quantity).coerceAtMost(MAX_QUANTITY)
        }
        return merged.map { (contentId, entry) ->
            CartItem(
                contentId = contentId,
                quantity = entry.quantity,
                packageSnapshot = snapshotOf(entry.snapshot, isDaihao, customNewIds.contains(contentId)),
            )
        }
    }

    private fun snapshotOf(snapshot: PackageSnapshotRequest, isDaihao: Boolean, custom: Boolean): PackageSnapshot = PackageSnapshot(
        name = snapshot.name.trim(),
        category = snapshot.category,
        points = snapshot.points,
        draws = snapshot.draws,
        limit = snapshot.limit,
        priceUsd = if (isDaihao) snapshot.priceUsd else null,
        priceCny = if (isDaihao) null else snapshot.priceCny,
        sortId = snapshot.sortId,
        extra = snapshot.extra,
        custom = custom,
        priceAmount = snapshot.priceAmount,
        priceCurrency = snapshot.priceCurrency,
        discountEligible = snapshot.discountEligible,
    )

    /**
     * 摘要计算:total_cny 按版本计价(daihao 用 price_usd × exchange_rate);
     * total_points 为购物车礼包积分合计(不含 initial_points);total_draws 可为小数。
     */
    private fun buildSummary(items: List<CartItem>, isDaihao: Boolean, exchangeRate: Double?, pricing: LedgerPricing?): PlanSummary {
        var totalCny = 0.0
        var totalPoints = 0L
        var totalDraws = 0.0
        items.forEach { item ->
            val snapshot = item.packageSnapshot
            val price = if (pricing != null) {
                val amount = snapshot.priceAmount ?: if (isDaihao) snapshot.priceUsd ?: 0.0 else snapshot.priceCny ?: 0.0
                val currency = snapshot.priceCurrency ?: if (isDaihao) "USD" else "CNY"
                val discount = if (snapshot.discountEligible) pricing.discountPercent / 100 else 1.0
                amount * discount * rateFor(currency, pricing, exchangeRate)
            } else if (isDaihao) {
                (snapshot.priceUsd ?: 0.0) * (exchangeRate ?: 0.0)
            } else {
                snapshot.priceCny ?: 0.0
            }
            totalCny += price * item.quantity
            totalPoints += snapshot.points.toLong() * item.quantity
            totalDraws += snapshot.draws * item.quantity
        }
        val totalAmount = pricing?.let { totalCny / rateFor(it.currency, it, exchangeRate) }
        if (!totalCny.isFinite() || totalAmount?.isFinite() == false || !totalDraws.isFinite()) invalid("预算金额或抽数超出计算范围")
        return PlanSummary(
            totalCny = totalCny,
            totalPoints = totalPoints,
            totalDraws = totalDraws,
            totalAmount = totalAmount,
            currency = pricing?.currency ?: "CNY",
        )
    }

    private data class NormalizedCustoms(
        val packages: List<CustomPackage>,
        val oldIdToNewId: Map<Long, Long>,
    )

    private data class MergedItem(
        var quantity: Int,
        val snapshot: PackageSnapshotRequest,
    )

    companion object {
        private const val VERSION_DAIHAO = "daihao"
        private const val MAX_QUANTITY = 9999
        private val CURRENCIES = setOf("CNY", "USD", "HKD", "JPY")
    }
}
