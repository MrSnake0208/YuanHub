# T3 前端接入指南：指挥 YuanHub 接入广陵账房存储

> 文档工程师：doc-writer ｜ 输入：T2 后端设计（02-backend-design.md，契约主结构）＋ T1 调研（01-research.md）＋ YuanHub 现有代码
> 适用范围：YuanHub 前端（Vue3 + Vite + vue-router 4，无 pinia / 无 axios）
> 目标：让记忆只停留在 Vue ref() 里的广陵账房，能「保存 / 读取 / 管理 / 导出」云端方案，并对游客提供本地暂存兜底。
> 前置：后端已按 T2 落地 /hub/ledger/plan 五接口（本指南基于该契约编写）。

> 2026-10-22 增补：个人价格、折扣、多币种字段及旧客户端回写保护见 [05-multicurrency-pricing.md](05-multicurrency-pricing.md)。下列代码示例描述旧接口，接入新版时须一并传递 `pricing` 和礼包的显式标价字段。

---

## 〇、结论速览（先看这个）

1. **新增一个文件即可打通存储**：src/api/ledger.js（照 src/api/user.js 风格，auth:true 调 request()）。
2. **cart.vue 三处改动**：工具栏（L27-39）挂「方案管理」入口；ReceiptPanel 动作区（cart-actions，L80-83）挂「保存」；新增保存对话框 + 方案列表 UI。整体遵循 AGENTS.md 设计规范 v1.0（配色用 --surface/--cream/--yellow/--accent 等既有 CSS 变量，禁纯黑/大蓝填充）。
3. **加载即重算**：恢复 version/exchangeRate/initialPoints/cartDaihao|cartRu/customPackages 源状态即可，全部派生量（积分/抽数/合计/奖档次）由前端现有 computed 自动重算，**不入库、不回填**。
4. **自定义礼包 id 以响应为准**：服务端保存时重生成 id 并回写 cart_items 引用。前端 **POST/PUT 成功后必须用响应快照覆盖本地状态**（custom_packages 与 cart 中 custom 引用），否则第二次保存会把旧 id 又发给服务端（服务端无碍，但会导致引用对不上）。
5. **内置礼包是「快照」**：方案里冗余存 package_snapshot，旧方案在新目录下仍可读。**本期默认展示快照价格**；若当前目录里无该 id，用快照重建一个「存档礼包」条目显示，**不崩溃、不空白**。
6. **成功判定一律 status_code===200**；request() 对非 200 已统一 throw Error(message)，message 可能缺省（null），界面需兜底。DELETE 存在「data 为 null 被 request() 当失败」的边界，本指南给出防御写法。

---

# 第一部分：接口契约与前端基建对齐

## 1.1 后端接口（T2 契约主结构，前端以此为唯一依据）

统一前缀 /hub/ledger/plan，**全部需登录**（auth:true）。响应统一 ApiResult={status_code,message,data}，字段 **snake_case**，时间 ISO-8601。

| 方法 | 路径 | 语义 | 返回 data |
|---|---|---|---|
| POST | /hub/ledger/plan | 创建方案 | LedgerPlanResponse（全量，含 cart_items + custom_packages）|
| PUT | /hub/ledger/plan/{id} | **整体替换**（更新） | LedgerPlanResponse（全量）|
| GET | /hub/ledger/plan/{id} | 方案详情（含大明细） | LedgerPlanResponse（全量）|
| GET | /hub/ledger/plan | 我的方案列表 | PlanListItemDto[]（**轻量** + summary，不含大明细）|
| DELETE | /hub/ledger/plan/{id} | 删除方案 | data=true（Boolean ✓）|

- 列表可选 ?version=daihao 过滤；默认按 updated_at 倒序。
- 更新=整体替换（PUT 全量）；可选带 expected_updated_at 触发存在性 409（本期前端可不传）。
- 越权与不存在**统一 404**（不泄露他人方案存在性）。

## 1.2 请求 / 响应字段（snake_case）总览

> **id 类型口径（重要）**：方案 id（响应 `id`、`user_id`、路径参数 `{id}`）均为 **string**（Mongo ObjectId 风格）；只有礼包 id（`content_id`、`custom_packages[].id`）是 **Long**（number）。前端本地暂存方案用 `_localId` 区分，勿用 typeof 判别云端/本地（详见附录 B 前端适配说明）。

**请求体（POST/PUT 相同）：**
```json
{
  "name": "周年庆-代号鸢",                    // 必填 ≤50
  "version": "daihao",                        // 必填，仅 daihao | ru
  "exchange_rate": 7.2,                       // 仅 version=daihao 生效；ru 传 null 即可
  "initial_points": 1200,
  "cart_items": [
    {
      "content_id": 1,                         // 内置礼包 id 或自定义礼包 id（Long）
      "quantity": 2,                          // ≥1 且 ≤9999
      "package_snapshot": {                    // 内置也冗余快照（T2 决策 1）
        "name": "年卡", "category": "超值", "points": 2280, "draws": 180,
        "limit": 1, "price_usd": 37.99, "sort_id": 10, "extra": null
      }
    }
  ],
  "custom_packages": [
    { "id": 1710000000000, "name": "我的礼包", "category": "自定义",
      "points": 500, "draws": 40, "limit": 999,
      "price_cny": 99.0, "sort_id": null, "extra": null }
  ]
}
```

**版本价格二选一（服务端 service 层校验，违反 → 400）：**
- version=daihao → package_snapshot 与 custom_packages 里必须 price_usd 非空（price_cny 忽略/可缺省）。
- version=ru → 必须 price_cny 非空（price_usd 忽略/可缺省）。

**响应（详情/创建/更新 LedgerPlanResponse）：** id, user_id, name, version, exchange_rate, initial_points, cart_items[{content_id,quantity,package_snapshot}], custom_packages[{id,...}], summary{total_cny,total_points,total_draws}, created_at, updated_at。

**列表响应（PlanListItemDto，每条）：** id, name, version, exchange_rate, initial_points, summary{...}, created_at, updated_at —— **不含** cart_items / custom_packages 大明细，加载单个方案需再 GET 详情。

## 1.3 request() / auth 基建（已具备，无需改造）

- request(path, {method, body, auth})：auth:true 自动带 Authorization: Bearer；401 时用 refreshToken 静默刷新并重放一次，刷新失败则清登录态跳 /login；**非 200 统一 throw new Error(message)**；成功返回 data（见 §3.4 边界）。
- auth.isLoggedIn（!!auth.accessToken）：判断是否需要引导登录。
- 结论：账房接口的鉴权 / 刷新 / 基础错误处理全部复用现有基建，**只需新增 src/api/ledger.js**。

---

# 第二部分：src/api/ledger.js（完整可复制）

> 照 src/api/user.js 风格：入参 camelCase 普通对象，内部转 snake_case body，auth:true。
> 每个函数返回后端 data；出错统一 throw Error(message)（message 可能是 null，见 §3 兜底）。

~~~js
// 广陵账房「方案」接口封装（对照 BackEndV3-Share T2 契约 /hub/ledger/plan）
// 全部接口需登录：auth:true。入参一律 camelCase，内部转 snake_case 请求体。
// 成功后返回后端 data：
//   createPlan / updatePlan / getPlan  → LedgerPlanResponse（全量，含 cart_items + custom_packages）
//   listPlans                          → PlanListItemDto[]（轻量 + summary，不含大明细）
//   deletePlan                         → 详见 §3.4 边界（data 可能为 null）
import { request } from './request.js'

const PATH = '/hub/ledger/plan'

// 创建方案（POST）——返回全量快照，自定义礼包 id 以响应为准
export function createPlan({ name, version, exchangeRate, initialPoints, cartItems, customPackages }) {
  return request(PATH, {
    method: 'POST',
    auth: true,
    body: {
      name,
      version,
      exchange_rate: version === 'daihao' ? exchangeRate ?? null : null,
      initial_points: initialPoints || 0,
      cart_items: cartItems,          // [{ content_id, quantity, package_snapshot }]
      custom_packages: customPackages // [{ id, name, ... , price_usd|price_cny, sort_id, extra }]
    }
  })
}

// 整体替换更新（PUT {id}）——请求体同创建
export function updatePlan(id, { name, version, exchangeRate, initialPoints, cartItems, customPackages }) {
  return request(PATH + '/' + id, {
    method: 'PUT',
    auth: true,
    body: {
      name,
      version,
      exchange_rate: version === 'daihao' ? exchangeRate ?? null : null,
      initial_points: initialPoints || 0,
      cart_items: cartItems,
      custom_packages: customPackages
    }
  })
}

// 方案详情（GET {id}）——全量，用于加载完整状态
export function getPlan(id) {
  return request(PATH + '/' + id, { auth: true })
}

// 我的方案列表（GET /）——轻量字段 + summary，加载单方案前先 getPlan 拿明细
export function listPlans() {
  return request(PATH, { auth: true })
}

// 删除方案（DELETE {id}）——后端已定案返回 success(true)，data=true
// 历史注记：旧版后端可能返回 data 为 null，request() 会抛「返回数据为空」；如需兼容旧实现，
// 可改为 .catch 判断 /返回数据为空/ 视为成功，见 §3.4。
export function deletePlan(id) {
  return request(PATH + '/' + id, { method: 'DELETE', auth: true }) // data=true
}
~~~

> **★ 关键实现细节（自定义 id 回写）**：createPlan / updatePlan 返回的是服务端重生成 id 与回写引用后的**权威快照**。调用方必须把响应快照**覆盖回本地状态**（§4.5 E3 applyPlan），而不是继续用本地旧 id。否则下次保存会再次把旧 id 发给服务端，浪费一次归一化、且 cart 引用可能偏离权威 id。

---

# 第三部分：错误处理与兜底方案

## 3.1 request() 的既有行为（直接影响账房错误提示）

- 非 200 → throw new Error(message)；**message 可能为 null**（T2 列表响应 success() 的 message 被 @JsonInclude(NON_NULL) 省略，详情若 message 缺省则 err.message 为 undefined）。
- 401 未登录：**不会以普通 catch 抛给页面**——request() 内部已用 refreshToken 静默刷新重放；刷新失败则 logout + 跳转 /login。
- 网络失败：fetch 抛 TypeError（Failed to fetch），err.message 非后端中文。

## 3.2 三种要提示的场景与推荐文案

| 场景 | 现状 | 前端提示方案 |
|---|---|---|
| **未登录**（游客点「保存」）| request() 不会把它抛给页面（会刷新/跳登录）| 前置拦截：!auth.isLoggedIn 时**不调接口**，弹「登录后可把方案保存到云端」+ 本地暂存兜底（§5.3）|
| **配额满（429）** | request() 抛 Error（"方案数量已达上限(50),请删除后再创建"） | 直接展示 err.message，并高亮「方案列表」删除入口，引导删除后重试 |
| **网络失败** | fetch 抛 TypeError: Failed to fetch | 用 humanErr 归一到「网络异常，请检查后端服务是否已启动」后展示 |

统一归一化辅助（放进 cart.vue 或 composable）：
~~~js
function humanErr(err, fallback) {
  if (fallback === undefined) fallback = '操作失败，请稍后重试'
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback                       // message 缺省（后端列表/详情 message=null）
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}
~~~

## 3.3 建议可选增强：让 request() 携带 statusCode

若希望按状态码区分处理（429「去删除」/ 409「已被他端修改，请刷新」），可在 request() 抛错前把状态码挂到 Error 上（改动很小）：
~~~js
// request.js —— 在最终 throw 前追加（两个 throw 点都加）
const e = new Error(message || '请求失败')
e.status = statusCode
throw e
~~~
> 本期不强依赖：仅展示 message 已能覆盖 400/404/429 的中文提示。此增强为**可选**。

## 3.4 DELETE 的 data==null 边界（重要）

> **★ 已定案：后端 DELETE 返回 success(true)，data=true，request() 正常返回 true；下面的 null 防御仅作兼容旧实现的历史注记，可保留。**

request() 逻辑：statusCode===200 且 data != null → 返回 data；否则 throw。而 DELETE 无业务数据，若后端 success() 返回 data:null，request() 会抛「请求失败（返回数据为空）」。**无法从错误对象区分「真是失败」还是「200 但 data 空」**。

- 推荐后端配合：DELETE 返回 success(true)（data 非空）→ 前端直接成功。
- 若后端仍是 null：ledger.js 的 deletePlan 用「message 含『返回数据为空』」兜底判定成功（见上面代码）。
- 建议在 T2 收尾时统一 DELETE 语义为「data 可为 null，前端以 statusCode===200 判成功」，并让 request() 对这类接口提供只判 200 的入口。

---

# 第四部分：cart.vue 逐点改动

> 坐标均为当前 src/pages/tools/cart.vue（343 行的版本）。改动遵循 AGENTS.md v1.0：
> 只复用现有 CSS 变量（--surface/--cream/--ink/--tea/--yellow/--accent/--rouge）与既有类（.chip/.btn/.pill），不新增色值；按钮蜜黄/茶棕、大圆角；标题思源宋体 900 + 加宽字距已由全局样式接管。

## 4.1 改动点 A：import 与新增状态（<script setup> 顶部 L128-150 扩展）

在 L136-137 的 packages/rewards import 之后、L139 的 ref 声明区附近新增：

~~~js
import { createPlan, updatePlan, getPlan, listPlans, deletePlan } from '../../api/ledger.js'
import { auth } from '../../store/auth.js'          // auth.isLoggedIn 判游客

// ---- 方案管理状态 ----
const planName = ref('')                                       // 保存对话框里的方案名
const planId = ref(null)                                       // 当前已加载方案的 id（null=未保存到云端，新方案）
const showPlanSave = ref(false)                                // 保存对话框开关
const showPlanList = ref(false)                                // 方案列表抽屉/弹层开关
const myPlans = ref([])                                       // 云端方案列表（PlanListItemDto[]）
const planLoading = ref(false)
const planSaving = ref(false)
const _missingSnap = ref([])                                   // 目录缺失的内置礼包（由快照重建，见 §5.2）
const guestPlans = ref([])                                     // 游客本地暂存（读取见 §4.7）
~~~

> 保存/加载逻辑较多，推荐抽到 src/composables/useLedgerPlans.js（§4.8），cart.vue 只保留声明与触发；小项目直接写 cart.vue 内亦可。本指南以「直接写在 cart.vue」为例。

## 4.2 改动点 B：工具栏（L27-39）加「方案管理」入口

在现有 toolbar 的 .cart-switch（L28-31）之后的占位区附近，加两个按钮：

~~~html
<!-- toolbar（在 L32 的 .sp 占位附近插入） -->
<button class="btn ghost" @click="openPlanSave"><Save :size="16" />保存方案</button>
<button class="btn ghost" @click="openPlanList"><FolderOpen :size="16" />我的方案</button>
~~~

> auth.isLoggedIn 为游客时，两个按钮照常可点：保存走「本地暂存」兜底（§5.3），列表展示本地暂存 + 登录引导。
> 需在 L129 的 lucide import 增加 Save、FolderOpen、Pencil、X 图标。

## 4.3 改动点 C：ReceiptPanel 动作区（src/components/cart/ReceiptPanel.vue L80-83 cart-actions）加「保存」

在「清空 / 导出图片」旁加「保存」主按钮，点击回抛给 cart.vue：

~~~html
<!-- ReceiptPanel.vue cart-actions（L80-83）新增 -->
<button class="btn primary" @click="$emit('save-plan')"><Save :size="16" />保存</button>
~~~

ReceiptPanel 需把 defineEmits（L110）扩为 ['clear','update-initial','save-plan']，并在顶部 lucide import 加 Save。cart.vue 侧在 ReceiptPanel 标签（L77-96）绑定 @save-plan="openPlanSave"。

> **定位建议**：保存/导出这类「动作」放 ReceiptPanel 动作区最顺手；方案「列表/管理」放工具栏。二者入口都指向同一套保存对话框与列表，不重复逻辑。

## 4.4 改动点 D：保存对话框 + 方案列表 UI（新增模板片段，放在 <CustomPackageModal> 之后、</template> 前，约 L123 之后）

~~~html
<PlanSaveDialog
  v-if="showPlanSave"
  :name="planName"
  :existing="!!planId"
  :saving="planSaving"
  :logged-in="auth.isLoggedIn"
  @close="showPlanSave = false"
  @save="onConfirmSave"        <!-- 参数：{ name, overwrite } -->
/>

<PlanListDialog
  v-if="showPlanList"
  :plans="myPlans"
  :guest-plans="guestPlans"
  :logged-in="auth.isLoggedIn"
  :loading="planLoading"
  @close="showPlanList = false"
  @load="loadPlan"
  @rename="renamePlan"
  @remove="removePlan"
  @login="goLogin"
/>
~~~

> 推荐把两个对话框拆成组件 src/components/cart/PlanSaveDialog.vue、PlanListDialog.vue：样式沿用 .chip/.btn/.pill + 大圆角 + 奶油/暖白卡底色（--surface/--cream），Dialog 蒙层用半透明暖灰（禁纯黑）。组件只负责展示与 emit，**不持有业务状态**（由 cart.vue 传入/回调），保证方案状态单一来源。

## 4.5 改动点 E：<script setup> 里的核心逻辑

### E1 打包当前状态 → payload（buildPayload）

~~~js
// 用「source 状态」打包 payload；派生量不参与。
function snapshotOf(src, isDaihao) {
  return {
    name: src.name,
    category: src.category || '自定义',
    points: src.points,
    draws: src.draws,
    limit: src.limit,
    sort_id: src.sortId,
    extra: src.extra || undefined,
    ...(isDaihao ? { price_usd: src.priceUsd } : { price_cny: src.priceCny })
  }
}

function buildPayload(name) {
  const isDaihao = version.value === 'daihao'
  const cart = isDaihao ? cartDaihao.value : cartRu.value
  const customs = isDaihao ? customPackagesDaihao.value : customPackagesRu.value
  const builtin = isDaihao ? packagesDaihao : packagesRu
  const builtinIndex = new Map(builtin.map(function (p) { return [p.id, p] }))

  const cartItems = Object.entries(cart)
    .filter(function (e) { return e[1] > 0 })
    .map(function (e) {
      const contentId = Number(e[0])
      const quantity = e[1]
      const custom = customs.some(function (p) { return p.id === contentId })
      const src = custom
        ? customs.find(function (p) { return p.id === contentId })
        : builtinIndex.get(contentId)
      if (!src) return null          // 目录缺失的内置 id 且无快照 → 跳过（理论不出现，见 §5.2）
      return { content_id: contentId, quantity, package_snapshot: snapshotOf(src, isDaihao) }
    })
    .filter(Boolean)

  const customPackages = customs.map(function (p) {
    return {
      id: p.id, name: p.name, category: p.category || '自定义',
      points: p.points, draws: p.draws, limit: p.limit,
      sort_id: p.sortId, extra: p.extra || undefined,
      ...(isDaihao ? { price_usd: p.priceUsd } : { price_cny: p.priceCny })
    }
  })

  return {
    name,                                                    // 必填 ≤50（对话框里校验非空）
    version: version.value,
    exchange_rate: isDaihao ? exchangeRate.value : null,     // 汇率仅 daihao 生效
    initial_points: isDaihao ? initialPointsDaihao.value : initialPointsRu.value,
    cart_items: cartItems,
    custom_packages: customPackages
  }
}
~~~

---

### E2 保存（命名 / 另存为 / 覆盖）

~~~js
async function onConfirmSave(payload) {
  const name = payload.name || ''
  if (!name || !name.trim()) { alert('请填写方案名（最长 50 字）'); return }
  planName.value = name.trim()
  const body = buildPayload(planName.value)
  const overwrite = payload.overwrite

  // 游客：本地暂存兜底（§5.3），不调接口
  if (!auth.isLoggedIn) {
    upsertGuestPlan(body, overwrite)
    showPlanSave.value = false
    return
  }

  planSaving.value = true
  try {
    const saved = (planId.value && overwrite)
      ? await updatePlan(planId.value, body)   // 覆盖：PUT {id}
      : await createPlan(body)                 // 另存为新方案 / 新方案：POST
    planId.value = saved.id                    // 用响应 id 记录当前方案
    applyPlan(saved)                           // ★ 用响应快照覆盖本地（自定义 id 回写）
    showPlanSave.value = false
    alert('保存成功')
  } catch (err) {
    alert(humanErr(err, '保存失败'))
  } finally {
    planSaving.value = false
  }
}
~~~

> 保存对话框语义：**新方案**（planId==null）=「保存」即 POST；**已加载方案** = 提供「覆盖当前方案」（PUT {id}）与「另存为新方案」（POST，另起 planId），overwrite 由对话框按钮决定（重命名场景见 E4）。

### E3 加载详情 → 复原页面（核心 applyPlan）

~~~js
// plan 必须是 getPlan 或 create/update 返回的「全量 LedgerPlanResponse」
function applyPlan(plan) {
  const isDaihao = plan.version === 'daihao'

  // ① 版本（方案绑定单一 version，见 T2 决策 6）
  version.value = plan.version

  // ② 汇率：仅在 daihao 生效；其他版本忽略 exchange_rate
  if (isDaihao) exchangeRate.value = plan.exchange_rate == null ? 7.2 : plan.exchange_rate

  // ③ 自定义礼包：id 以响应为准（服务端已重生成 + 回写引用）
  const customs = (plan.custom_packages || []).map(function (p) {
    const o = {
      id: p.id, name: p.name, category: p.category || '自定义',
      points: p.points, draws: p.draws, limit: p.limit,
      sortId: p.sort_id, extra: p.extra
    }
    if (isDaihao) o.priceUsd = p.price_usd; else o.priceCny = p.price_cny
    return o
  })
  if (isDaihao) customPackagesDaihao.value = customs
  else customPackagesRu.value = customs

  // ④ 内置目录索引（把 content_id 对到快照，并探测缺失项）
  const builtin = isDaihao ? packagesDaihao : packagesRu
  const builtinIndex = new Map(builtin.map(function (p) { return [p.id, p] }))
  const customIndex = new Map(customs.map(function (p) { return [p.id, p] }))

  // ⑤ 购物车数量 + 缺失内置礼包快照重建
  const cart = {}
  const missing = []
  ;(plan.cart_items || []).forEach(function (item) {
    const cid = item.content_id
    const snap = item.package_snapshot || {}
    cart[cid] = item.quantity
    // 自定义：id 已含在 customs，引用随响应一致，无需额外处理
    // 内置：若当前目录无此 id，用快照重建一个「存档礼包」保证可展示（§5.2）
    if (!customIndex.has(cid) && !builtinIndex.has(cid)) {
      missing.push(Object.assign({}, snap, { id: cid, _fromSnapshot: true }))
    }
  })
  _missingSnap.value = missing

  // ⑥ 初始积分（按版本）
  if (isDaihao) initialPointsDaihao.value = plan.initial_points || 0
  else initialPointsRu.value = plan.initial_points || 0

  // ⑦ 购物车写回对应版本
  if (isDaihao) cartDaihao.value = cart
  else cartRu.value = cart

  // ⑧ 派生量全部由前端 computed 自动重算（cartItems/points/draws/cny/usd/奖档次），无需设置
}
~~~

> **为什么「内置快照」让旧方案在新目录下仍可读**：cart_items 自带 package_snapshot（name/points/draws/price），即使当前 packages.js 已删掉该 id，applyPlan 也会用快照重建展示条目（§5.2），保证零空白。

### E3b 响应 DTO → 请求体（payloadFromDto，供重命名等整体回写）

~~~js
function payloadFromDto(dto) {
  const isDaihao = dto.version === 'daihao'
  return {
    name: dto.name,
    version: dto.version,
    exchange_rate: isDaihao ? dto.exchange_rate : null,
    initial_points: dto.initial_points,
    cart_items: (dto.cart_items || []).map(function (it) {
      return { content_id: it.content_id, quantity: it.quantity, package_snapshot: it.package_snapshot }
    }),
    custom_packages: dto.custom_packages || []
  }
}
~~~

### E4 列表加载 / 重命名 / 删除

~~~js
async function openPlanList() {
  showPlanList.value = true
  if (!auth.isLoggedIn) return                 // 游客：列表只显示本地暂存
  planLoading.value = true
  try {
    myPlans.value = await listPlans()          // 轻量 PlanListItemDto[]
  } catch (err) {
    alert(humanErr(err, '加载方案列表失败'))
  } finally {
    planLoading.value = false
  }
}

async function loadPlan(plan) {
  try {
    const full = await getPlan(plan.id)        // 列表是轻量，需再取详情
    planId.value = full.id
    planName.value = full.name
    applyPlan(full)                            // 复原页面
    showPlanList.value = false
  } catch (err) {
    alert(humanErr(err, '加载方案失败'))
  }
}

// 重命名：本质 = 读取当前云端方案 → 改名 → PUT 整体替换
async function renamePlan(plan, newName) {
  if (!newName || !newName.trim()) return
  try {
    const full = await getPlan(plan.id)
    const payload = payloadFromDto(full)       // DTO → 请求体
    payload.name = newName.trim()
    await updatePlan(full.id, payload)         // 整体替换（语义见 T2 决策 9）
    myPlans.value = await listPlans()
    if (planId.value === full.id) planName.value = newName.trim()
  } catch (err) {
    alert(humanErr(err, '重命名失败'))
  }
}

async function removePlan(plan) {
  if (!confirm('删除方案「' + plan.name + '」？此操作不可恢复')) return
  try {
    await deletePlan(plan.id)
    myPlans.value = myPlans.value.filter(function (p) { return p.id !== plan.id })
    if (planId.value === plan.id) planId.value = null
  } catch (err) {
    alert(humanErr(err, '删除失败'))
  }
}

function goLogin() { location.href = '/login' }
~~~

> **重名注意点**：PUT 是整体替换，重命名也必须整体提交。最简单可靠的做法 = getPlan 拿全量 → 只改 name → payloadFromDto 转回请求体 → updatePlan。若直接改 planName 提交 buildPayload，也行，但必须保证当前页面状态与云端一致；推荐统一走「读→改→整体写」以贴合整体替换语义。

---

### E5 游客本地暂存兜底（§5.3）

~~~js
const GUEST_KEY = 'yh_ledger_plans'
function readGuestPlans() { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || [] } catch (_e) { return [] } }
function writeGuestPlans(list) { guestPlans.value = list; localStorage.setItem(GUEST_KEY, JSON.stringify(list)) }

function upsertGuestPlan(payload, overwrite) {
  let list = readGuestPlans()
  if (overwrite && planId.value) {           // 覆盖：按 _localId 匹配
    const localId = String(planId.value)
    const idx = list.findIndex(function (p) { return String(p._localId) === localId })
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], payload, { updated_at: new Date().toISOString() })
      writeGuestPlans(list); return
    }
  }
  const rec = Object.assign({}, payload, {
    _localId: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  list.unshift(rec)
  writeGuestPlans(list)
  planId.value = rec._localId                // 本地方案也记录 id，便于覆盖
}
~~~
> onMounted 时若 readGuestPlans() 非空，可在方案列表或页首提示「有未同步的本地暂存方案」。游客「保存」= 写本地暂存（不调接口）；「列表」优先展示本地暂存 + 顶部登录引导条 + 登录按钮（goLogin）。
> **登录后**：本地暂存不自动合并到云端（避免歧义），可在列表提供「把本地上传为云端方案」按钮（对选中的 guestPlan 调 createPlan(buildPayload...) 上传一份），按需实现。

## 4.6 改动点 F：接入 _missingSnap（兼容降级，让存档礼包可展示）

processedPackages（L162-188）当前 = 内置 + 自定义。为让「目录缺失的内置礼包」也能在网格/清单显示，把快照重建项并入 raw：

~~~js
// 在原 computed（L162-188）里，把 raw 从
//   const raw = version === 'daihao' ? [...packagesDaihao, ...customPackagesDaihao.value] : [...packagesRu, ...customPackagesRu.value]
// 改为：
const raw = version.value === 'daihao'
  ? packagesDaihao.concat(customPackagesDaihao.value, _missingSnap.value)
  : packagesRu.concat(customPackagesRu.value, _missingSnap.value)
~~~

> _missingSnap 里的对象已是「快照字段 + id」，与内置礼包同构（含 _fromSnapshot 标记），calculatedPriceCny 由现有 map 逻辑用快照的 priceUsd/priceCny 正确换算（沿用 L166-170）。旧方案的缺失礼包与正常礼包一起参与排序/筛选/合计，行为一致。

## 4.7 改动点 G：游客引导入口（openPlanSave）

~~~js
function openPlanSave() {
  // 游客时对话框内会显示「登录后可保存到云端」提示（由 PlanSaveDialog 依据 :logged-in 渲染），
  // 确定后走 onConfirmSave → !auth.isLoggedIn 分支 → 本地暂存兜底。
  showPlanSave.value = true
}
~~~

## 4.8 可选项：抽成 composable（src/composables/useLedgerPlans.js）

若不想把上述逻辑全部塞进 cart.vue，可抽成 export function useLedgerPlans()，内部封装 planId/planName/showPlanSave/showPlanList/myPlans/guestPlans 状态 + buildPayload/applyPlan/onConfirmSave/loadPlan/renamePlan/removePlan/openPlanSave 等，返回给 cart.vue 解构使用。cart.vue 仅保留：状态声明、processedPackages 里 merge _missingSnap、以及把 composable 触发接到模板按钮。**两种方案等价**，推荐小项目直接写 cart.vue 内（本指南以之为例），改动大时再抽 composable。

---
# 第五部分：加载恢复细节（source-of-truth 清单）

| 恢复项 | 来源字段 | 写入 | 说明 |
|---|---|---|---|
| version | plan.version | version.value | 方案绑定单一 version（T2 决策 6）|
| exchangeRate | plan.exchange_rate | exchangeRate.value | **仅 version=daihao 生效**；ru 忽略；缺省回退 7.2 |
| initialPoints | plan.initial_points | initialPointsDaihao/Ru.value | 按版本写对应 ref |
| 购物车数量 | plan.cart_items[].content_id + .quantity | cartDaihao/cartRu.value = {cid:qty} | 自定义引用 id 来自响应，天然一致 |
| 自定义礼包 | plan.custom_packages | customPackagesDaihao/Ru.value | **id 以响应为准**；价格字段按版本回填 priceUsd/priceCny |
| 缺失内置礼包 | plan.cart_items[].package_snapshot | _missingSnap（并入 processedPackages）| 目录无 id 时用快照重建展示（§5.2）|
| 派生量 | — | — | 全部由前端 computed 重算，**不回填** |

## 5.1 保存 → 加载闭环的正确性来源

- 保存：buildPayload 打包的是「源状态」（version / 汇率(仅daihao) / 初始积分 / cart 数量+快照 / 自定义）。
- 加载：applyPlan 只写源状态；cartItems/cartPoints/totalPoints/totalDraws/totalCny/priceForDraws/totalUsd 与奖档次（unlocked/next）全部由现有 computed（L214-234）基于 processedPackages/currentCart/currentInitialPoints 即时重算 → **100% 复原**，无需额外逻辑，也避免双写不一致（T2 决策 7）。

## 5.2 兼容降级：内置礼包 id 不在当前 packages.js

**现象**：老方案保存的 content_id 在当前 packagesDaihao/packagesRu 不存在（目录改版删礼包/改 id）。

**本期默认处理（T2 决策 1：快照兜底）**：

- 场景 A（购物车里有，目录没了）：applyPlan 命中缺失 → 用 package_snapshot 重建「存档礼包」进 _missingSnap，网格/清单正常显示，**价格/积分/抽数用快照值**，带 _fromSnapshot 标记（可供 UI 加「旧版本礼包」小角标，可选）。
- 场景 B（自定义礼包 id 与内置撞了/被服务端重生成）：服务端已在保存时去冲突，响应 id 即权威，applyPlan 直接用，无需前端处理。
- **快照 vs 实时价格口径**：本期**默认展示快照价格**（正确性优先，旧方案价格稳定可复现）。「跟随最新目录」的实时回填属于进阶功能（T2 展望：目录版本对齐），本期不做。文档在此明确：**渲染用快照值，不查实时目录**。

> 风险提示：若内置礼包 priceUsd/priceCny 在快照里被服务端因版本规则清理（理论上不会），加载时价格可能为 0/undefined——calculatedPriceCny 会按 (pkg.priceUsd ? ... : 0) 归 0（L169），不会 NaN，但显示会异常。因此 payload 打包时务必把快照的 price_usd / price_cny 填对（§4.5 E1 已处理）。

## 5.3 游客态（未登录）

- 判定：auth.isLoggedIn。
- 行为：保存 → 弹「登录后可把方案保存到云端」提示 + 转「本地暂存」；列表 → 展示本地暂存 + 登录引导按钮；导出仍可（不走存储）。
- 本地暂存与云端彻底隔离：guestPlans 存 localStorage key yh_ledger_plans，结构 = 云端 payload 形状（含 _localId/created_at/updated_at），相同浏览器内可用。
- **登录后**：本地暂存不自动合并到云端（避免歧义），可在列表提供「把本地上传为云端方案」按钮（createPlan 上传一份），按需实现。

---

# 第六部分：接口速查 + 自测清单

## 6.1 curl 自测清单（后端应已启动，先手动登录拿 token）

~~~bash
# 0) 登录拿 token（本地后端，见 api-contract.md）
TOKEN=$(curl -s -X POST http://localhost:8080/user/login -H 'Content-Type: application/json'   -d '{"email":"you@x.com","password":"********"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
AUTH="Authorization: Bearer $TOKEN"
BASE=http://localhost:8080/hub/ledger/plan

# 1) 创建（POST）——注意 response 里 custom_packages 的 id 已被服务端重生成
curl -s -X POST "$BASE" -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "name":"周年庆-代号鸢","version":"daihao","exchange_rate":7.2,"initial_points":1200,
  "cart_items":[{"content_id":1,"quantity":2,"package_snapshot":{"name":"年卡","category":"超值","points":2280,"draws":180,"limit":1,"price_usd":37.99,"sort_id":10}}],
  "custom_packages":[{"id":999,"name":"我的","category":"自定义","points":500,"draws":40,"limit":999,"price_cny":99.0}]
}'

# 2) 列表（GET，轻量，无大明细）
curl -s "$BASE" -H "$AUTH"

# 3) 详情（GET {id}）——拿列表第一条的 id 填入 {id}
curl -s "$BASE/<ID>" -H "$AUTH"

# 4) 更新（PUT {id}，整体替换）——用 1) 响应里的 id，可验证自定义 id 回写
curl -s -X PUT "$BASE/<ID>" -H "$AUTH" -H 'Content-Type: application/json' -d '{...同创建 body...}'

# 5) 删除（DELETE {id}）
curl -s -X DELETE "$BASE/<ID>" -H "$AUTH"

# 6) 边界：无 token 创建 → 401
curl -s -X POST "$BASE" -H 'Content-Type: application/json' -d '{"name":"x","version":"daihao"}'
# 7) 边界：越权读他人 id → 404（不泄露存在性）
# 8) 边界：name 空 / 超 50 → 400；daihao 缺 price_usd → 400
# 9) 边界：第 50 个方案后再创建 → 429「方案数量已达上限(50)…」
~~~

## 6.2 浏览器手动验收步骤

1. **游客保存**：未登录打开 /cart → 点「保存方案」→ 出现登录提示 + 写入本地暂存 → 「我的方案」能看到并加载本地方案（同浏览器）。
2. **登录保存**：登录后加购 + 自定义礼包 → 保存（POST）→ 成功 alert → **验证响应 custom_packages[i].id 与本地 customPackages 一致（控制台对比）** → 再保存一次（PUT 覆盖）确认走更新且 id 稳定。
3. **另存为**：已加载方案 → 保存对话框点「另存为新方案」→ 得到新 id，不覆盖原方案。
4. **加载复原**：清空购物车/改积分/切版本 → 从「我的方案」加载 → 核对：version、汇率（daihao 生效）、initialPoints、cart 数量、自定义礼包、合计/积分/抽数/奖档次全部复原；派生量由前端重算。
5. **缺失礼包降级**：用老版本目录存的方案在新目录加载 → 缺失 id 礼包以「存档礼包」形式仍在清单显示并参与合计，无空白/报错。
6. **删除与重命名**：列表删除（确认框）→ 消失；重命名 → 列表显示新名、若为当前方案则 planName 同步更新。
7. **网络失败**：停掉后端再保存/加载 → 提示「网络异常，请检查后端服务是否已启动」而非裸的 Failed to fetch。

## 6.3 边界用例

- 空购物车保存（T2 决策 4 允许）：buildPayload 产生空 cart_items，POST 应成功。
- 仅自定义礼包、无内置：cart_items 只含 custom 引用 + custom_packages 非空。
- 同一自定义礼包数量 >1：cart_items 单条 quantity 正确，加载后 cart{cid:qty} 复原。
- 多自定义同 id 冲突：服务端去冲突后响应唯一，前端一律以响应为准，本地不再自造 id。
- 汇率改 6.5 保存再加载，仅在 daihao 生效；ru 方案 exchange_rate 为 null，合计算 CNY 直接用 price_cny。
- 名为 50 字边界、0 字被前端拦截。
- 跨版本：一个 daihao 方案加载后不会污染 ru 侧的 cart/积分/自定义（applyPlan 只写 plan.version 对应 ref）。

---
# 附录 A：接口速查表（前端侧）

| 前端函数 | 方法/路径 | 入参（camelCase → snake_case） | 成功 data | 主要错误 |
|---|---|---|---|---|
| createPlan | POST /hub/ledger/plan | name,version,exchangeRate→exchange_rate,initialPoints→initial_points,cartItems→cart_items,customPackages→custom_packages | LedgerPlanResponse（全量）| 400 / 401 / 429 / 500 |
| updatePlan | PUT /hub/ledger/plan/{id} | 同上 | LedgerPlanResponse（全量）| 400 / 401 / **404**(不存在或越权) / 409(可选) / 429 |
| getPlan | GET /hub/ledger/plan/{id} | id | LedgerPlanResponse（全量）| 401 / **404** |
| listPlans | GET /hub/ledger/plan | 无 | PlanListItemDto[]（轻量+summary）| 401 |
| deletePlan | DELETE /hub/ledger/plan/{id} | id | true（Boolean ✓）| 401 / **404** |

> 错误码口径（T2 §九）：**400** 参数校验/版本价格二选一、**401** 未登录（request() 自动刷新或跳登录）、**404** 不存在含越权、**409** 存在性乐观冲突（可选，本期可不触发）、**429** 每用户上限 50。403 本期不触发。成功判据一律 status_code===200。

# 附录 B：前端状态 ↔ payload 字段映射表

| 前端状态（cart.vue ref） | payload（snake_case） | 方向 | 备注 |
|---|---|---|---|
| version | version | 双向 | 单 version |
| exchangeRate | exchange_rate | 双向 | 仅 daihao 生效；ru=null |
| initialPointsDaihao/Ru | initial_points | 双向 | 按版本 |
| cartDaihao/cartRu（{id:qty}）→ cart_items[] | cart_items[].content_id + .quantity | 双向 | package_snapshot 由 id 对内置或其自定义礼包生成 |
| — | cart_items[].package_snapshot | 入库方向 | 内置礼包拼快照（name/category/points/draws/limit/price/sortId/extra）|
| customPackagesDaihao/Ru | custom_packages[] | 双向 | **id 以响应为准**；price 字段按版本 price_usd/price_cny |
| 派生量（cartItems/points/draws/cny/usd/奖档次） | （不入库） | 只读出 | 加载后前端 computed 重算 |
| summary | response.summary | 只读（服务端缓存）| 列表预览用，非权威 |

# 附录 C：交付物与后续

- 本指南对应交付：src/api/ledger.js（新增，可直接复制）+ cart.vue 改动（改动点 A~G）+（可选）PlanSaveDialog / PlanListDialog 组件 与 useLedgerPlans composable。
- 完成后请在 YuanHub 侧提交，并本地起后端跑一遍 §6 自测清单。
- 若后端 DELETE 的 data 语义或「DTO→请求体」转换与实际后端有出入，以实际联调为准回报 captain 微调本指南。
