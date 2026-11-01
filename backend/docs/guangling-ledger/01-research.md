# T1 调研报告：广陵账房前端状态模型 × HubBackend 后端约定

> 调研员：researcher ｜ 交付：事实性调研 + 字段级证据，供 T2 后端设计与 T3 前端接入文档使用
> 调研范围：YuanHub 前端（/cart 广陵账房）状态模型 × BackEndV3-Share（HubBackend）后端约定。
> 报告只列事实与决策点，不做设计决策。

---

## 〇、结论速览

- 广陵账房目前**零持久化**：所有用户数据在 Vue `ref()` 内存里，刷新即丢；导出是 html2canvas 一次性 PNG，**无任何恢复能力**。
- 需要持久化的是一份可完整复原页面的**状态快照**（version、exchangeRate、购物车、初始积分、自定义礼包），静态礼包目录/奖励档位**不入库**。
- 后端已有完整的多库、分层、认证、接口契约基建，可照 `com.lhs.share.hub.*`（HubPost 五件套）直接落地「用户 1:N 方案」；账房数据须放 **HubBackend**、唯一标识 `user_id` 一律取当前 JWT。
- 前端接入基建（request.js / auth.js）已具备，新增一个 `src/api/ledger.js` 即可接入；snake_case 已在 request.js 兼容。

# 第一部分：广陵账房前端状态模型

仓库：`/Users/mrsnake/Desktop/yituliu/YuanHub`（Vue3 + Vite + vue-router 4，无 pinia、无 axios）。
页面：`src/pages/tools/cart.vue`，组件 `src/components/cart/*`，数据 `src/data/{packages,rewards}.js`。

## 1. 需要持久化的完整状态清单

`cart.vue` 的 `<script setup>` 里所有状态都是普通 `ref()`：

| # | 前端符号（cart.vue） | 含义 | 类型 | 默认 | 证据行号 |
|---|---|---|---|---|---|
| 1 | `version` | 版本，`daihao`代号鸢 / `ru`如鸢 | string | `daihao` | L81 `const version = ref('daihao')` |
| 2 | `exchangeRate` | USD→CNY 汇率（仅代号鸢用）| number | 7.2 | L82 `const exchangeRate = ref(7.2)` |
| 3 | `cartDaihao` | 代号鸢购物车 `{pkgId:qty}` | object | `{}` | L83 `const cartDaihao = ref({})` |
| 4 | `cartRu` | 如鸢购物车 `{pkgId:qty}` | object | `{}` | L84 `const cartRu = ref({})` |
| 5 | `initialPointsDaihao` | 已有初始积分（代号鸢）| number | 0 | L85 |
| 6 | `initialPointsRu` | 已有初始积分（如鸢）| number | 0 | L86 |
| 7 | `customPackagesDaihao` | 自定义礼包数组（代号鸢）| array | `[]` | L87 |
| 8 | `customPackagesRu` | 自定义礼包数组（如鸢）| array | `[]` | L88 |

> 说明：`currentCart`/`currentInitialPoints`/`currentCustoms`（L93-95）只是按 `version` 在两组间切换的 `computed`，持久化时**两条 version 各自保存**（`cartDaihao` 与 `cartRu` 独立，互不覆盖——证据 L83/84、L93/94）。

### 1.1 自定义礼包的字段定义

自定义礼包由 `addCustomPackage(form)` 生成（cart.vue L199-216），字段与内置礼包一致，但价格按版本走不同字段：

```js
const newPkg = {
  id: Date.now(),          // 数字 id（时间戳，潜在冲突源，见决策点）
  name: form.name,
  category: form.category || '自定义',
  points: parseInt(form.points) || 0,
  draws: parseInt(form.draws) || 0,
  limit: parseInt(form.limit) || 999,
  extra: form.extra || undefined,
  sortId: form.sortId ? parseInt(form.sortId) : undefined
}
if (version === 'daihao') newPkg.priceUsd = parseFloat(form.price);
else newPkg.priceCny = parseFloat(form.price);
```

- 证据：cart.vue L199-216（`addCustomPackage`），L229-235（`deleteCustom`）。
- **前端口径**：`id` 由 `Date.now()` 生成（毫秒时间戳，number）；`priceUsd` 仅代号鸢、`priceCny` 仅如鸢；`sortId`/`extra` 可选。

### 1.2 派生量是否需要入库存？

下列均为**计算属性**（computed），由源状态即时算出，**不应入库**，加载时前端重算即可 100% 复原：

| 派生量 | 计算逻辑（cart.vue） | 行号 |
|---|---|---|
| `calculatedPriceCny` | daihao: `priceUsd*exchangeRate`；ru: `priceCny` | L105-112 |
| `cartItems` | `cart` 中 qty>0 的条目 | L118-120 |
| `cartPoints` | Σ points*qty | L121 |
| `totalPoints` | cartPoints + initialPoints | L122 |
| `totalDraws` | Σ draws*qty | L123 |
| `totalCny` | Σ calculatedPriceCny*qty | L124 |
| `priceForDraws` | 有抽数礼包 Σ calculatedPriceCny*qty | L125 |
| `totalUsd` | daihao Σ priceUsd*qty | L126-128 |
| `unlocked1/2`、`next1/2` | 由 totalPoints 对照 rewards.js 档位 | L121,136-145 |
| `track1Cd/track2Cd` | 硬编码截止时间倒计时 | L154-155 |

**结论**：只存源状态（version/exchangeRate/initialPoints/cartItems 快照/customPackages），派生量全部由前端重算。

## 2. 内置礼包数据字段与版本差异

`src/data/packages.js`：`packagesDaihao`（101 个，L1起）+ `packagesRu`（41 个，L163起）。

内置礼包字段：`id`(number)、`name`、`points`、`limit`、`draws`、`priceUsd`(代号鸢) **或** `priceCny`(如鸢)、`category`、`sortId`、`extra`(可选)。

两版本差异：
- **代号鸢**用 `priceUsd`（USD 计价），页面展示时经 `exchangeRate` 换算成 CNY（L105-112）；
- **如鸢**直接用 `priceCny`（CNY 计价），无需汇率（`showUsd`/`exchangeRate` 仅 daihao 生效，cart.vue L37-40、L173）。

示例（packages.js）：
```js
// 代号鸢（USD），packages.js L3-4
{ id: 1, name: "年卡", points: 2280, limit: 1, draws: 180, priceUsd: 37.99, category: "超值", sortId: 10 }
// 如鸢（CNY），packages.js L165
{ id: 1, name: "年卡", points: 2480, limit: 1, draws: 180, priceCny: 248, category: "超值", sortId: 10 }
```
> 注意：两版本 `id` 可能相同但数值/价格不同（如 id=1 代号鸢年卡 vs 如鸢年卡不同价）。故「方案」里的 cartItems 需**同时记录 version 与礼包快照**，避免跨版本混淆。

奖励档位 `src/data/rewards.js`：`track1`（14 档，周年限时累充）+ `track2`（14 档，男主限时累充），全部静态，不入库。

## 3. 导出流程现状与痛点

- 现状：`exportReceipt()`（cart.vue L251-259）与 `ReceiptPanel.exportImage()`（ReceiptPanel.vue L108-119）用 `html2canvas` 把 `.receipt` DOM 截图成 PNG 下载。
- 痛点：
  1. **一次性**：导出的是图片，无法编辑、无法恢复购物车状态；
  2. **无持久化**：任何刷新/退出，购物车、汇率、积分、自定义礼包全部丢失；
  3. **方案不可复用**：用户无法保存多套「账单/方案」并在不同版本/金额间切换。

→ 这是本次后端存储要解决的核心问题。

## 4. 前端登录态与请求封装（接入新接口的基建）

### 4.1 store/auth.js
- 单例 `export const auth = reactive({...})`，`localStorage` key **`yh_auth`** 持久化（L20 STORAGE_KEY）。
- 状态：`accessToken` / `refreshToken` / `userInfo`；`get isLoggedIn()` = `!!auth.accessToken`（L38）。
- 方法：`login(email,password)`（L45）、`refresh()`（L55，静默刷新）、`logout()`（L64，清状态跳 /login）。
- `setTokens()`（L83）从登录/刷新响应的 `{token,refresh_token,user_info}` 更新并持久化。

### 4.2 api/request.js
- `API_BASE = import.meta.env.VITE_API_BASE || "http://192.168.31.55:8080"`（L28）。
- `request(path,{method=GET,body,auth=false})`：自动 JSON 序列化；`auth:true` 时自动带 `Authorization: Bearer <accessToken>`（L38-46）。
- **401 幂等静默刷新并重放一次**：`statusCode===401 && auth && !refreshed` → `store.refresh()` → 重试（L83-94）；刷新失败或无 refresh 则 `logout()` 跳 /login。
- **统一响应解析**：读 `payload.status_code ?? payload.statusCode ?? res.status`（L58-62，兼容后端 SNAKE_CASE）；`statusCode===200` 返回 `data`，否则 `throw new Error(message)`（L70-77）。
- 结论：**前端无需为账房接口再写鉴权/错误处理**，只需新 API 文件按 user.js 风格调用 `request()` 并标注 `auth:true`。

### 4.3 api/user.js（代码风格模板）
- 入参用 camelCase 普通对象，内部转 snake_case 请求体（如 `user_name`、`registration_token`），带 `auth:true` 调 `request()`。新增 `src/api/ledger.js` 应完全照此风格。

## 5. 前端路由与侧栏（T3 的接入落点）
- `src/router/routes.js`：已有 `/cart`（广陵账房）、`/login`、`/register`、`/forgot` 路由。
- `src/router/index.js`：`beforeEach` 恢复登录态 + `meta.requiresAuth` 守卫（L19-30）。
  - `/cart` 路由目前**未设** `requiresAuth`（routes.js L44-52）——游客可访问，仅展示本地；方案保存/读取需登录态（`auth.isLoggedIn`）。
- 侧栏 `src/components/IslandSidebar.vue`：已接入登录态（用户名 + logout）。方案管理 UI 可挂在 cart 页工具栏或侧栏。

# 第二部分：HubBackend 后端约定

仓库：`/Users/mrsnake/Desktop/yituliu/BackEndV3-Share`（Kotlin 2.2 / JDK21 / Spring Boot 3.5 / spring-security JWT / springdoc / MongoDB 双库 / Redis / Caffeine）。
包根：`com.lhs.share`（源码 `src/main/kotlin/com/lhs/share/`）。

## 6. 双库架构与 HubBackend 配置

`config/mongo/MongoMultiConfig.kt`：
- `MaaMongoConfig`：主库 `mongoTemplate`，库名从 `spring.data.mongodb.uri` 解析（L24-49）。仓储扫描 `basePackages=["com.lhs.share.repository"]`（L18-21）。
- `HubMongoConfig`：`hubMongoTemplate`，**库名固定 `"HubBackend"`**（L86-92）。`share.mongo.hub-uri` 为空时复用主库连接、仅切换库名（L77-81）；非空则独立连接。仓储扫描 `basePackages=["com.lhs.share.hub.repository"]`（L63-66）。
- **关键机制**：新业务仓储**必须放 `com.lhs.share.hub.repository` 顶层包**才能被路由到 `hubMongoTemplate`；主库仓储放 `com.lhs.share.repository`。两包互相独立，不能混。
- 配置项 `share.mongo.hub-uri` 见 `config/external/ShareProperties.kt`（`Mongo.hubUri`，L93-96，默认空）与 `application-template.yml`（L20-23）。

## 7. hub 模块分层惯例（可直接照抄的五件套范例）

现有范例 `com/lhs/share/hub/**`（HubPost 一用户多记录）：

| 层 | 文件 | 要点 |
|---|---|---|
| entity | `hub/repository/entity/HubPost.kt` | `@Document("hub_post")`；`@Id` id:String?=null；`@Indexed` userId:String；createdAt:Instant=Instant.now()；Serializable |
| repository | `hub/repository/HubPostRepository.kt` | `MongoRepository<HubPost,String>`；派生查询 findByUserIdOrderByCreatedAtDesc |
| service | `hub/service/HubPostService.kt` | @Service；注入仓储；ApiResultException(NOT_FOUND,…)；列表批量联查 |
| response | `hub/controller/response/HubPostResponse.kt` | companion of() 映射；含联查的 userName |
| controller | `hub/controller/HubPostController.kt` | @Tag + @RequestMapping("/hub/post") + @RestController；写接口 helper.requireUserId()；返回 ApiResult<T> |

> 注释风格：类/接口/字段用 KDoc（/** … */）说明语义（尤其跨库、权限、赋值约束）。

## 8. 认证与安全

`config/security/SecurityConfig.kt`：
- **默认 anyRequest().authenticated()**（L54）——新写接口**无需放行**即需登录。
- URL_WHITELIST（匿名，L84-90）：/user/login、/user/register、/user/sendRegistrationToken。
- URL_PERMIT_ALL（公开，L93-104）：/、/error、/version、/demo/**、/user/info、/user/search、/user/password/**、/user/refresh、swagger。
- **先例**：requestMatchers(GET, "/hub/post/**").permitAll()（L45-46）——HubPost 是公开读。但账房方案是私有数据，不应放行，T2 应保持默认 authenticated。
- 认证链：JwtAuthenticationTokenFilter（config/security/）从 Authorization: Bearer 提取并解析 JWT。头名由 share.jwt.header 配置，默认 Authorization（ShareProperties.kt L44）。
- 当前用户 id：AuthenticationHelper.requireUserId()（config/security/AuthenticationHelper.kt L30-32），未认证抛 401。账房方案归属 user_id 一律取它，绝不可由前端传。
- JWT：service/jwt/JwtService.kt，issueAuthToken(subject=userId,…)，expire=21600s（6h）、refreshExpire=604800s（7d）（ShareProperties Jwt L43-60；application.yml L28-34）。JWT 载荷 subject 即 userId。
- 文档鉴权展示：@RequireJwt（config/doc/RequireJwt.kt）→ OpenAPI SecurityRequirement。

## 9. 接口契约约定

- 统一响应 controller/response/ApiResult.kt：ApiResult{statusCode,message,data}；成功 statusCode=200 + success()；失败 fail(code,msg)。
- 业务异常 ApiResultException(statusCode, errorMessage)（ApiResultException.kt），由 GlobalExceptionHandler 转 ApiResult。
- handler/GlobalExceptionHandler.kt 统一转换：
  - ApiResultException → 对应状态码（L51-64）
  - @Valid 校验失败 MethodArgumentNotValidException → 400 "参数校验错误: <defaultMessage>"（L94-102）
  - ResponseStatusException → 其状态码+reason（L109-112）
  - 兜底 Exception → 500（L114-118）。
- 参数校验：入参 DTO 用 Bean Validation（@field:NotBlank/@Size 等，message 中文），Controller 方法参数标 @Valid（HubPostCreateRequest.kt 示例）。
- 限流：config/accesslimit/AccessLimit.kt（默认 @AccessLimit(times=3, second=10)），基于 Redis 计数，注册于 AccessLimitConfig。
- **JSON 命名**（application.yml L21-26 spring.jackson）：property-naming-strategy: SNAKE_CASE、date-format: ISO、时区 UTC、FAIL_ON_UNKNOWN_PROPERTIES: false。即请求体与响应体字段一律 snake_case，时间 Instant → ISO-8601。
- config/JacksonConfig.kt：注册 JavaTimeModule + 忽略未知字段（配合上面的命名策略）。

## 10. 跨库联查（用户信息）

hub/service/HubUserInfoService.kt：
- 数据在 HubBackend，用户信息在 MaaBackend，跨库无法 join，应用层联查。
- 单查 get(userId)：@Cacheable(cacheNames=["hubUserInfo"])（Caffeine 5 分钟）。
- 批量 getDict(userIds)：一次 findAllById（$in）返回 Map，消列表页 N+1。
- 对账房场景：方案私有且本身含 user_id，加载时通常不需要联查用户显示名；HubUserInfoService 主要用于公开列表页展示用户名，T2 一般无需引入。

# 第三部分：决策点清单（只列出，不决策）

供 T2 后端设计时权衡，本报告不做选择：

1. **数据快照 vs 引用**：packages.js 会随版本更新（礼包增删/改价）。方案里内置礼包条目只存 pkgId+qty（实时跟随当前目录），还是冗余完整礼包快照（旧方案在新目录下仍可读）？倾向：快照兜底 + 当前目录回填（T2 需定取舍）。
2. **自定义礼包 id 冲突**：前端 id=Date.now() 是毫秒时间戳（number），同一毫秒/不同条可能冲突。服务端需校验或重新生成，还是接受前端 id 原样保存并按 (version,name) 去重？
3. **每用户方案数上限**：设不设上限、默认多少（如 50）？
4. **空购物车能否保存**：无任何条目时是否允许创建/更新方案（影响 UI 与校验）；
5. **命名**：接口路径（/hub/ledger/plan？）、集合名（hub_ledger_plan？）、方案改名/重名策略（同 version 下是否允许重名，还是服务端唯一？）；
6. **版本粒度**：一个方案限定单一 version（daihao/ru），还是一个方案同时含两版本购物车？前端当前模型两版本独立（cartDaihao/cartRu），倾向单 version 方案 + 两套各自保存；
7. **派生量**：只存源状态（已确认计算属性不入库），是否额外缓存 totalCny 等用于列表展示（可选，非必存）；
8. **删除语义**：硬删除（物理删）vs 软删除（deleted 标记）；
9. **并发**：同用户多端同时保存的冲突策略（整体替换 vs 版本号乐观锁）；
10. **公开分享**：是否预留 shareToken 公开只读（本期不做，仅设计预留）。

---

## 附：证据文件清单

- 前端：YuanHub/src/pages/tools/cart.vue、src/components/cart/{PackageCard,ReceiptPanel,CustomPackageModal}.vue、src/data/{packages,rewards}.js、src/api/{request,user}.js、src/store/auth.js、src/router/{index,routes}.js、README.md、AGENTS.md、docs/api-contract.md、docs/auth-research.md
- 后端：BackEndV3-Share/src/main/kotlin/com/lhs/share/ 下 config/mongo/MongoMultiConfig.kt、config/security/{SecurityConfig,AuthenticationHelper,JwtAuthenticationTokenFilter}.kt、config/external/ShareProperties.kt、config/doc/{RequireJwt,SpringDocConfig}.kt、config/accesslimit/{AccessLimit,AccessLimitConfig}.kt、config/JacksonConfig.kt、controller/response/{ApiResult,ApiResultException}.kt、controller/response/user/{MaaLoginRsp,MaaUserInfo}.kt、controller/{UserController,DemoController}.kt、handler/GlobalExceptionHandler.kt、service/jwt/JwtService.kt、service/UserService.kt、hub/**、resources/application.yml、application-template.yml