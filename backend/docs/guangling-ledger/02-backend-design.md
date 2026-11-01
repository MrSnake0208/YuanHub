# T2 后端设计：广陵账房多方案存储（HubBackend）

> 架构师：backend-architect ｜ 输入：T1 调研（01-research.md）｜ 交付：集合/实体、REST API、DTO、配额、安全、错误码、包结构、部署、展望
> 适用范围：BackEndV3-Share（Kotlin 2.2 / JDK21 / Spring Boot 3.5 / JWT / springdoc / MongoDB 双库），包根 com.lhs.share。
>
> ✅ 实现状态：已按本文档落地（2026-08，船长实现）。代码位于 com.lhs.share.hub.{repository, repository.entity, service.ledger, controller.ledger}，单元测试 LedgerPlanServiceTest 12 例全绿、ktlint 通过。三处实现偏差在各节以「实现备注」标注。

---

# 一、总体方案

广陵账房目前零持久化，用户数据在 Vue ref() 内存中，刷新即丢。本设计在 **HubBackend** 库落地「**一用户多方案（1:N）**」存储，使每个方案是一条可完整复原页面的**状态快照**，配合前端 /cart 页做「保存 / 读取 / 管理 / 导出」。

- **归属**：唯一标识 user_id 一律取当前 JWT（AuthenticationHelper.requireUserId()），**绝不可由前端传入**。
- **数据域**：version、exchange_rate、initial_points、自定义礼包 custom_packages、购物车 cart_items（内置礼包快照 + qty）。**派生量全部不入库**（前端加载时重算，可 100% 复原）。
- **命名**：接口路径 /hub/ledger/plan，集合 hub_ledger_plan，在 com.lhs.share.hub 下新增 ledger 子域，复刻 HubPost 五件套分层。

---

# 二、关键决策点（T1 十项逐一决断）

> 命名大前提：**接口路径 /hub/ledger/plan，集合名 hub_ledger_plan**，理由见决策 5。

## 决策 1：数据快照 vs 引用 → 快照兜底 + 当前目录回填
- **决断**：cart_items 里内置礼包也**冗余完整快照字段**（name/points/draws/price/limit），不存 pkg_id 引用即可。
- **理由**：packages.js 会随版本更新（礼包增删/改价）。若只存 pkgId+qty，旧方案在目录改版后价格/点数漂移，甚至礼包消失空白。冗余快照保证**旧方案在新目录下仍可读**。
- **实现**：保存时后端以「前端快照字段」直接存（前端整包 JSON 已携带）；如需跟随当前目录，由前端在展示时选择用快照或用最新目录回填（本期默认快照，正确性优先）。

## 决策 2：自定义礼包 id 冲突 → 服务端重生成 id
- **决断**：自定义礼包 id 由服务端统一**重新生成去冲突整型 id**，并与购物车引用一致。
- **理由**：前端 id=Date.now() 是毫秒时间戳（number），同一毫秒多条/跨设备冲突，且依赖客户端时钟不可靠。
- **方案**：保存前对每个 custom_package 生成唯一 id（毫秒时间戳+同毫秒序号），配合 (userId,version,name) 去重校验，并同步回写 cart_items 中 custom=true 的引用。因整体替换语义（决策 9）吸收副作用。

## 决策 3：每用户方案数上限 → 有上限，默认 50，可配置
- **决断**：每用户上限 **50**，配置项 share.ledger.max-plans-per-user。
- **理由**：防滥用、防集合膨胀；50 足够。创建前 countByUserId >= 上限 → 抛 429；删除后再创建释放名额。

## 决策 4：空购物车能否保存 → 允许保存
- **决断**：创建/更新**允许空购物车**（cart_items 可为空），仅要求 name 非空。
- **理由**：用户可能先建空方案起名再陆续加购；强制非空造成无谓拦截。custom_packages 空也合法。

## 决策 5：命名 → 接口 /hub/ledger/plan，集合 hub_ledger_plan ⭐ 最终定夺
- **决断**：**/hub/ledger/plan**（不用 /account/plan、也不用 /hub/post 风格冲突路径）。
- **理由（关键）**：
  1. **依赖现有包结构**：账房数据放 Hub 库复用 com.lhs.share.hub 基建，路径以 /hub 起头才与包/仓储路由一致；/account/plan 与 com.lhs.share.hub 无对应关系。
  2. **不误触公开规则**：SecurityConfig 现有 requestMatchers(GET, "/hub/post/**").permitAll() 只精确匹配 /hub/post/**，**不会**放行 /hub/ledger/**；故 /hub/ledger/plan 保持默认 authenticated()（私有正确），且我们**不新增任何 permitAll**。
  3. **业务语义**：ledger(账房)呼应「广陵账房」；/hub/ledger/plan 可扩展 /hub/ledger/share 等。
  4. **避免维度打架**：用户/账号维度已有 /user/**；账房是业务数据，归 /hub/ledger 更清晰，/account/plan 与 /user 重叠。
- **集合名**：hub_ledger_plan（与 hub_post 风格一致）。
- **重名策略**：同 userId+version 允许重名，以 id+updatedAt 区分；不做服务端唯一。name 必填 ≤50。

## 决策 6：版本粒度 → 一个方案限定单一 version
- **决断**：一个 hub_ledger_plan 绑定单一 version（daihao 或 ru）。
- **理由**：前端两版本完全独立（cartDaihao/cartRu 各自 ref，current 按 version computed），T1 §1 证据；单 version 方案与前端一对一对齐，校验/展示/回填都简单。

## 决策 7：派生量 → 只存源状态，可选缓存 summary
- **决断**：只存源状态；可选冗余 summary.total_cny 等供列表预览。
- **理由**：派生量全由前端 computed 重算（T1 §1.2），入库造成双写不一致。summary 声明为缓存性质、非权威。

## 决策 8：删除语义 → 硬删除
- **决断**：硬删除（物理删），不加 deleted 软标记。
- **理由**：私有草稿无审计需求；软删除徒增查询条件与清理。删除采用「先 findByIdAndUserId 判归属、再 deleteById」两段式（实现备注：spring-data-mongodb 4.5 的派生删除返回类型存在包名/版本差异，两段式最稳，见 §7.2）。

## 决策 9：并发 → 整体替换 + 可选存在性乐观
- **决断**：更新=整体替换（PUT 全量），用 updatedAt + 可选比对检测覆盖冲突；不做 @Version 乐观锁。
- **理由**：前端每次传完整方案，后端整体 save，幂等且简单（Mongo 单文档原子写）。同用户多端并发概率低，覆盖语义可接受。可选：前端带 expected_updated_at 且不一致抛 409。

## 决策 10：公开分享 → 预留字段，本期不做公开读
- **决断**：实体预留 share_token/shared，本期所有接口保持私有（authenticated）。
- **理由**：公开分享需额外安全设计，超出范围；仅预留字段，详情始终校验 userId 归属，不因 share_token 放行。

---

# 三、集合与实体设计

## 3.1 集合

| 集合 | 库 | 说明 |
|---|---|---|
| hub_ledger_plan | HubBackend | 用户方案快照，1 用户 N 条 |

索引（含单字段与复合索引）：
- **单字段** {userId:1} —— 由实体 userId 字段上的 @Indexed 生成；支撑 countByUserId 及按 userId 过滤。
- **复合索引** {userId:1, updatedAt:-1} —— 由实体类上的 @CompoundIndex(name="idx_user_updated", def="{'userId':1,'updatedAt':-1}") 生成；支撑「按当前用户 + updatedAt 倒序」的列表查询（findByUserIdOrderByUpdatedAtDesc），一次走索引免排序。
- **主键** {id:1}（Mongo _id），无需额外。
> 关系说明：@Indexed 与 @CompoundIndex 是**两个独立索引**，不互相替换——@Indexed 建单字段索引，@CompoundIndex 建包含前置字段的复合索引；两者都声明以确保 count 与列表两类查询都命中索引。

## 3.2 实体 LedgerPlan（com.lhs.share.hub.repository.entity.LedgerPlan.kt）

```kotlin
package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 广陵账房方案快照(HubBackend.hub_ledger_plan)
 * 一用户多方案;每条绑定单一 version;存源状态,派生量前端重算。
 */
@Document("hub_ledger_plan")
@CompoundIndex(
    name = "idx_user_updated",
    def = "{'userId': 1, 'updatedAt': -1}",
)
data class LedgerPlan(
    @Id
    val id: String? = null,
    /** 单字段索引:供 countByUserId 及按 userId 过滤;复合索引见类上 @CompoundIndex */
    @Indexed
    val userId: String,
    val name: String,
    val version: String,
    val exchangeRate: Double? = null,
    val initialPoints: Int = 0,
    val cartItems: List<CartItem> = emptyList(),
    val customPackages: List<CustomPackage> = emptyList(),
    val summary: PlanSummary? = null,
    val shareToken: String? = null,
    val shared: Boolean = false,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
) : Serializable

data class CartItem(
    val contentId: Long,
    val quantity: Int,
    val packageSnapshot: PackageSnapshot,
)

data class PackageSnapshot(
    val name: String,
    val category: String?,
    val points: Int,
    val draws: Double, // 实现备注:抽数可为小数(首充双倍 0.6 抽),Int 会丢精度/反序列化报错
    val limit: Int,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val sortId: Int? = null,
    val extra: String? = null,
    val custom: Boolean = false,
)

data class CustomPackage(
    val id: Long,
    val name: String,
    val category: String?,
    val points: Int,
    val draws: Double, // 实现备注:同上,小数抽数
    val limit: Int,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val sortId: Int? = null,
    val extra: String? = null,
)

data class PlanSummary(val totalCny: Double = 0.0, val totalPoints: Long = 0, val totalDraws: Double = 0.0)
// 实现备注:total_points 用 Long 防溢出(200 条 × 9999 数量 × 6480 积分超 Int.MAX);total_draws 可为小数
```

要点：List<T> 存内嵌文档避免额外集合；contentId: Long 统一内置/自定义 id；快照字段与前端对齐（camelCase 实体 → Jackson SNAKE_CASE 响应）。
---

# 四、仓库

**注意（仓储扫描铁律）**：HubMongoConfig 用 @EnableMongoRepositories 扫描 basePackages=["com.lhs.share.hub.repository"]。故**仓储接口必须放在 com.lhs.share.hub.repository 顶层包**（与 HubPostRepository 并列），否则不会命中 hubMongoTemplate 而落到主库！实体 entity 可放 com.lhs.share.hub.repository.entity（@Document 无扫描约束）。

com.lhs.share.hub.repository.LedgerPlanRepository.kt：
```kotlin
package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.LedgerPlan
import org.springframework.data.mongodb.repository.MongoRepository

/** Hub 库仓储:由 HubMongoConfig 路由到 HubBackend.hub_ledger_plan */
interface LedgerPlanRepository : MongoRepository<LedgerPlan, String> {
    fun findByUserIdOrderByUpdatedAtDesc(userId: String): List<LedgerPlan>
    fun countByUserId(userId: String): Long
    fun findByIdAndUserId(id: String, userId: String): LedgerPlan?
}
```

> 归属校验一律带 userId 条件（findByIdAndUserId），从仓储层杜绝越权。
> 实现备注：不定义派生 delete 方法——spring-data-mongodb 4.5.1 中不存在 `org.springframework.data.mongodb.core.query.DeleteResult`（原设计 import 编译不过），删除改为服务层两段式「先查归属再 deleteById」。

---

# 五、REST API 设计

统一前缀 **/hub/ledger/plan**，全部需登录。响应统一 ApiResult={statusCode,message,data}；成功 statusCode=200；字段 snake_case。

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | /hub/ledger/plan | 创建方案 | 需登录 |
| PUT | /hub/ledger/plan/{id} | 整体替换(更新) | 需登录+归属 |
| GET | /hub/ledger/plan/{id} | 方案详情 | 需登录+归属 |
| GET | /hub/ledger/plan | 我的方案列表 | 需登录 |
| DELETE | /hub/ledger/plan/{id} | 删除方案，成功返回 ApiResult<Boolean> success(true) | 需登录+归属 |

## 5.1 创建 POST /hub/ledger/plan

请求体 LedgerPlanCreateRequest（snake_case JSON）：
```json
{
  "name": "周年庆方案-代号鸢",
  "version": "daihao",
  "exchange_rate": 7.2,
  "initial_points": 1200,
  "cart_items": [
    { "content_id": 1, "quantity": 2,
      "package_snapshot": { "name": "年卡", "category": "超值", "points": 2280, "draws": 180, "limit": 1, "price_usd": 37.99, "sort_id": 10 } }
  ],
  "custom_packages": [
    { "id": 1710000000000, "name": "我的礼包", "category": "自定义", "points": 500, "draws": 40, "limit": 999, "price_cny": 99.0 }
  ]
}
```

响应 200，data 为 LedgerPlanResponse（见 §5.5）。

## 5.2 更新 PUT /hub/ledger/plan/{id}

请求体同创建（整体替换）。id 不存在或不属于该用户 → 404。可选带 expected_updated_at 触发存在性乐观校验（不一致 → 409）。

## 5.3 详情 GET /hub/ledger/plan/{id}

返回 LedgerPlanResponse，仅限本人；跨用户 → 404（不暴露存在性）。

## 5.4 列表 GET /hub/ledger/plan

返回当前用户全部方案按 updated_at 倒序，仅摘要+元信息（不含大快照明细）：成功响应 ApiResult 的 message 由 success() 置为 null 且 @JsonInclude(NON_NULL) 会省略，故示例省略 message；前端一律以 status_code===200 判断成功。
```json
{
  "status_code": 200,
  "data": [
    { "id": "65a...", "name": "周年庆方案-代号鸢", "version": "daihao",
      "exchange_rate": 7.2, "initial_points": 1200,
      "summary": { "total_cny": 2594.0, "total_points": 4560, "total_draws": 360 },
      "created_at": "2024-01-15T10:00:00Z", "updated_at": "2024-01-16T08:30:00Z" }
  ]
}
```

可选 ?version=daihao 过滤。每用户上限内。

## 5.5 响应 DTO LedgerPlanResponse

com.lhs.share.hub.controller.response 下（或 ledger 子域），of() 映射实体，不暴露 shareToken：
```kotlin
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
) {
    companion object {
        fun of(plan: LedgerPlan): LedgerPlanResponse = LedgerPlanResponse(
            id = requireNotNull(plan.id), userId = plan.userId, name = plan.name,
            version = plan.version, exchangeRate = plan.exchangeRate,
            initialPoints = plan.initialPoints,
            cartItems = plan.cartItems.map { CartItemDto.of(it) },
            customPackages = plan.customPackages.map { CustomPackageDto.of(it) },
            summary = plan.summary?.let { PlanSummaryDto.of(it) },
            createdAt = plan.createdAt, updatedAt = plan.updatedAt,
        )
    }
}

data class CartItemDto(val contentId: Long, val quantity: Int, val packageSnapshot: PackageSnapshotDto) {
    companion object { fun of(e: CartItem) = CartItemDto(e.contentId, e.quantity, PackageSnapshotDto.of(e.packageSnapshot)) }
}

data class PlanListItemDto(
    val id: String, val name: String, val version: String, val exchangeRate: Double?,
    val initialPoints: Int, val summary: PlanSummaryDto?, val createdAt: Instant, val updatedAt: Instant,
) {
    companion object {
        fun of(plan: LedgerPlan) = PlanListItemDto(
            requireNotNull(plan.id), plan.name, plan.version, plan.exchangeRate,
            plan.initialPoints, plan.summary?.let { PlanSummaryDto.of(it) },
            plan.createdAt, plan.updatedAt,
        )
    }
}
```

> 列表用 PlanListItemDto 避免大快照明细；详情用 LedgerPlanResponse 全量。userId 保留用于前端一致性展示，不返回 shareToken。

## 5.6 删除 DELETE /hub/ledger/plan/{id}

删除当前用户自己的方案（归属校验），成功返回 **ApiResult<Boolean> success(true)**，即 data=true，便于前端以「statusCode===200 且 data===true」判定成功：

```json
{
  "status_code": 200,
  "data": true
}
```

- 删除不存在的方案，或不属于当前用户的方案 → 仍返回 **404**（与 §九 一致，不泄露存在性）。
- 幂等说明：不存在即 404；存在则物理删除后返回 success(true)。

---

# 六、入参 DTO（Bean Validation）

com.lhs.share.hub.controller.request 下：
```kotlin
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
    @field:Size(max = 200, message = "购物车条目最多 200 条")
    val cartItems: List<CartItemRequest> = emptyList(),
    @field:Size(max = 50, message = "自定义礼包最多 50 个")
    val customPackages: List<CustomPackageRequest> = emptyList(),
)

data class CartItemRequest(
    @field:Min(value = 1, message = "礼包 id 非法") val contentId: Long,
    @field:Min(value = 1, message = "数量至少 1") @field:Max(value = 9999, message = "数量超出上限") val quantity: Int,
    val packageSnapshot: PackageSnapshotRequest,
)

data class PackageSnapshotRequest(
    @field:NotBlank(message = "礼包名不能为空") val name: String,
    val category: String?, val points: Int, val draws: Double, val limit: Int = 999,
    val priceUsd: Double? = null, val priceCny: Double? = null,
    val sortId: Int? = null, val extra: String? = null,
)

data class CustomPackageRequest(
    val id: Long? = null,
    @field:NotBlank(message = "礼包名不能为空") val name: String,
    val category: String?, val points: Int, val draws: Double, val limit: Int = 999,
    val priceUsd: Double? = null, val priceCny: Double? = null,
    val sortId: Int? = null, val extra: String? = null,
)
```

补充校验（service 层）：版本价格二选一——daihao 必须 priceUsd 非空(priceCny 忽略)，ru 必须 priceCny 非空(priceUsd 忽略)，否则 400。

---

# 七、服务层与包结构

## 7.1 最终包结构（必须命中仓储扫描）

```
com.lhs.share.hub/
├── repository/                    // @EnableMongoRepositories 扫描根(必须在此!)
│   ├── HubPostRepository.kt
│   ├── LedgerPlanRepository.kt      // 仓储接口与 HubPost 并列
│   └── entity/
│       ├── HubPost.kt
│       └── LedgerPlan.kt            // @Document("hub_ledger_plan")
├── service/
│   ├── HubPostService.kt
│   └── ledger/
│       └── LedgerPlanService.kt
└── controller/
    ├── HubPostController.kt
    └── ledger/
        ├── LedgerPlanController.kt
        ├── request/ (LedgerPlanCreateRequest.kt)
        └── response/ (LedgerPlanResponse.kt)
```

> 关键：**仓储接口必须在 com.lhs.share.hub.repository 顶层**才能命中 HubMongoConfig 扫描到 hubMongoTemplate；entity/controller/service 按领域子包组织不影响扫描。

## 7.2 服务 LedgerPlanService

```kotlin
@Service
class LedgerPlanService(
    private val repository: LedgerPlanRepository,
    @Value("\${share.ledger.max-plans-per-user:50}") private val maxPlansPerUser: Long,
) {
    fun create(userId: String, r: LedgerPlanCreateRequest): LedgerPlanResponse {
        if (repository.countByUserId(userId) >= maxPlansPerUser)
            throw ApiResultException(429, "方案数量已达上限($maxPlansPerUser),请删除后再创建")
        return LedgerPlanResponse.of(repository.save(normalize(userId, r)))
    }

    fun update(userId: String, id: String, r: LedgerPlanCreateRequest): LedgerPlanResponse {
        val existing = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(404, "方案不存在: $id")
        val merged = normalize(userId, r).copy(id = id, createdAt = existing.createdAt, updatedAt = Instant.now())
        return LedgerPlanResponse.of(repository.save(merged))
    }

    fun getById(userId: String, id: String): LedgerPlanResponse {
        val p = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(404, "方案不存在: $id")
        return LedgerPlanResponse.of(p)
    }

    /** 列表:返回轻量 PlanListItemDto(不含 cart_items/custom_packages 大明细),详情才用全量 */ 
    fun list(userId: String, version: String?): List<PlanListItemDto> =
        repository.findByUserIdOrderByUpdatedAtDesc(userId).filter { version == null || it.version == version }
            .map { PlanListItemDto.of(it) }

    fun delete(userId: String, id: String) {
        // 两段式删除:先查归属判 404,再物理删除(实现备注:替代 DeleteResult 派生删除)
        val existing = repository.findByIdAndUserId(id, userId)
            ?: throw ApiResultException(404, "方案不存在: $id")
        repository.deleteById(checkNotNull(existing.id))
    }

    /** 归一化:版本价格二选一 + 自定义 id 去冲突 + 摘要 */
    private fun normalize(userId: String, r: LedgerPlanCreateRequest): LedgerPlan {
        // 价格二选一校验(略)
        // 自定义 id 去冲突 + 回写 cartItems 引用(略)
        return LedgerPlan(userId = userId, name = r.name, version = r.version,
            exchangeRate = r.exchangeRate, initialPoints = r.initialPoints, cartItems = emptyList(), customPackages = emptyList(), summary = null)
    }
}
```

控制器 LedgerPlanController：@Tag + @RequestMapping("/hub/ledger/plan") + @RestController，写接口 helper.requireUserId()，@RequireJwt，@Valid，返回 success(...)。

---

# 八、安全设计

1. **默认认证**：账房方案是私有数据，接口全部走默认 authenticated()。**不新增任何 permitAll/白名单**。/hub/ledger/plan 不撞 /hub/post/** 规则（精确前缀，决策 5）。
2. **归属强制**：一律 AuthenticationHelper.requireUserId() 取当前用户；仓储层带 userId 条件杜绝越权。
3. **响应收敛**：响应 DTO 不暴露 shareToken/shared；列表走 PlanListItemDto。
4. **限流**：写接口(POST/PUT/DELETE)加 @AccessLimit(times=10, second=60) 防高频保存（实现备注:3 次/10 秒过紧,「创建+立即改名/覆盖」的正常操作流即可能触发 429,实现放宽为 10 次/60 秒）。
5. **文档**：写接口 @RequireJwt 展示 OpenAPI 鉴权；@Tag("广陵账房")。

---

# 九、错误码约定

由 GlobalExceptionHandler 转 ApiResult：

| 场景 | status_code | message(例) |
|---|---|---|
| 成功 | 200 | success |
| 参数校验(@Valid) | 400 | 参数校验错误: 方案名不能为空 |
| 版本价格二选一失败 | 400 | 代号鸢自定义礼包必须填 price_usd |
| 未认证 | 401 | (AuthenticationEntryPoint 统一) |
| 方案不存在/不属于本人 | 404 | 方案不存在: {id} |
| 存在性乐观冲突(可选) | 409 | 方案已在其他端被修改 |
| 配额超上限 | 429 | 方案数量已达上限(50),请删除后再创建 |
| 服务器异常 | 500 | 服务器内部错误 |

> **越权与不存在统一返回 404（不泄露他人方案存在性）；429 用 ApiResultException(429,...)。**
> **前端只依赖 401 / 400 / 404 / 409(可选) / 429**（成功以 status_code===200 为准）。403 在本期不触发——越权一律按 404 处理；仅在将来公开分享等场景引入公开资源权限控制时才有可能出现 403，届时另行约定。
> **DELETE 成功返回 data=true（Boolean）**，供前端以 200+data 判定成功。

---

# 十、部署注意

- **无新库/连接**：数据写入现有 HubBackend，不改 MongoMultiConfig；share.mongo.hub-uri 保持现状。
- **仓储扫描铁律**：LedgerPlanRepository 必须在 com.lhs.share.hub.repository 顶层，否则落主库。
- **snake_case**：实体/DTO camelCase 字段，Jackson SNAKE_CASE 输出，无需逐字段注解；Instant → ISO-8601。
- **索引**：首次启动由 @Indexed / @CompoundIndex 自动建索引——单字段 {userId:1} 与复合 {userId:1,updatedAt:-1} 各自建立（见 §3.1）。
- **配置**：新增 share.ledger.max-plans-per-user=50 到 application.yml / application-template.yml / ShareProperties(可选)。
- **跨库**：方案私有且含 userId，通常无需 HubUserInfoService 联查用户名；UI 用户名用前端 auth.userInfo 即可。

---

# 十一、展望（后续可选）

1. 公开分享：启用 share_token，加 GET /hub/ledger/plan/share/{token} 公开只读（token 失效/防枚举）。
2. 回收站：如需再引入 deletedAt 软删除（本期硬删除）。
3. 分页：当前上限 50 已足够，暂不分页。
4. 导入/导出：POST /hub/ledger/plan/import 支持 JSON 导入重建方案。
5. 目录版本对齐：记录目录版本/hash，实现跟随最新目录的一键回填。
6. 存在性乐观锁：多端编辑常态化后启用 expected_updated_at 409。

---

# 附：前端接入要点速览（供 T3）

- 新增 src/api/ledger.js，照 api/user.js 风格：入参 camelCase、内部转 snake_case、auth:true 调 request()。
- 列表/详情加载 → cart.vue 用快照复原（version/exchangeRate/initialPoints/cartDaihao|cartRu/customPackages）。
- 保存：打包当前源状态 → POST/PUT；读取后由前端重算全部派生量。
- **自定义礼包 id 必须以后端响应为准**：服务端会重生成自定义礼包 id 并同步回写 cart_items 中 custom=true 条目的引用（决策 2）。前端在保存/更新后必须用响应快照回写本地 custom_packages 的 id、以及购物车中自定义条目的引用，避免以本地的 Date.now() 时间戳继续引用导致对不上。
- 导出仍走 html2canvas；持久化后「导出」与「保存到云端方案」并存。
- /cart 路由的保存/读取需 auth.isLoggedIn（游客仅本地展示）。
- DELETE 删除：接口成功返回 data=true（Boolean），以「statusCode===200 且 data===true」判定删除成功；404 表示方案不存在且删除失败。

---

# 附：决策点对照表

| # | 决策点 | 决断 | 理由速记 |
|---|---|---|---|
| 1 | 快照 vs 引用 | 快照+目录回填 | 目录会改版,快照保旧方案可读 |
| 2 | 自定义礼包 id 冲突 | 服务端重生成 | 前端毫秒时间戳不可靠 |
| 3 | 每用户上限 | 50 可配 | 防滥用 |
| 4 | 空购物车 | 允许(name 非空即可) | 先建方案后加购 |
| 5 | 命名 | /hub/ledger/plan + hub_ledger_plan | 复刻 hub 基建,不撞 /hub/post/**,不新增放行 |
| 6 | 版本粒度 | 单 version 方案 | 对齐前端独立双模型 |
| 7 | 派生量 | 只存源(+可选 summary) | computed 由前端重算 |
| 8 | 删除语义 | 硬删除 | 私有草稿无审计需求 |
| 9 | 并发 | 整体替换+可选存在性乐观 | 快照式弱一致可接受 |
| 10 | 公开分享 | 预留字段,本期私有 | 需额外安全设计 |

