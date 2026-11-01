# 广陵账房 API 前端联调反馈（YuanHub 实测）

> 接收方：后端 AGENT ｜ 来源：YuanHub 前端（Vue3 + Vite）按 `docs/guangling-ledger/03-frontend-integration-guide.md` 接入后，对真实后端（http://192.168.31.55:8080）跑通 §6 自测清单（curl 全量 + 浏览器验收）后的反馈。
> 测试日期：2026-08-15 ｜ 测试账号：Mr.Snake（测试产生的方案已全部删除，账号当前方案数为 0）。
> 结论先行：接口主流程（创建/列表/详情/更新/删除，401/404/400 价格校验，DELETE 返回 data=true）**全部符合 T2 契约，前端已全量跑通**。以下为 2 个建议修复项 + 2 个口径确认项 + 已确认一致点清单。

---

## 一、建议修复（P1）：参数校验缺口

以下请求均被 200 接受并入库，而 T2/OpenAPI 契约期望拒绝：

| # | 请求 | 现状 | 契约期望 |
|---|---|---|---|
| 1 | `name: ""` | 200 入库（空名方案） | 400（指南：必填 ≤50） |
| 2 | `name: "长" × 51` | 200 入库 | 400（OpenAPI 已声明 `maxLength: 50`） |
| 3 | `version: "xxx"` | 200 入库 | 400（OpenAPI 已声明 `pattern: daihao|ru`） |

复现命令见附录 A。

**推测原因**：`LedgerPlanCreateRequest` 的 Bean Validation 未生效（控制器未加 `@Valid`，或 service 层未校验 name/version）。

**建议**：对 `LedgerPlanCreateRequest` 启用 Bean Validation，补 `@NotBlank` / `@Size(max = 50)` / `@Pattern(regexp = "daihao|ru")`。

> 前端已自行拦截这三项（保存对话框 required + maxlength=50 + 前端只发 daihao/ru），修复不影响前端，但可防御绕过前端直调 API 的客户端。

## 二、建议优化（P2）：自定义礼包 id 每次保存都无条件重生成

实测（浏览器网络日志确认请求体内容）：

- POST 提交 `custom_packages[].id = 1710000000000` → 响应重生成为 `1786816270005`，且 cart_items 引用同步回写 ✓（符合 T3 指南）。
- **PUT 再次提交「上次响应回写后的新 id」`1786816681876` → 响应又重生成为 `1786816708749`**。

即服务端每次保存（POST 与 PUT）都会重生成 `custom_packages[].id`，即使提交的 id 合法且无冲突。

**影响**：前端已按 T3 指南「保存成功后用响应快照覆盖本地状态（custom_packages 与 cart 引用）」，引用不会漂移，**功能无碍**。

**建议（可选）**：若希望 id 稳定（对客户端本地映射 / 幂等更友好），可改为「提交的 id 与内置目录及本方案内其他自定义礼包 id 均无冲突时保留原 id；冲突或缺失时才重生成」。若保持现状，请在接口描述中注明「custom id 每次保存均会重生成，客户端必须以响应为准」。

## 三、口径确认（P2）：summary.total_points 不含 initial_points

实测：`initial_points=100` + 年卡 2280 + 自定义 500 → `summary.total_points = 2780`（**不含** initial_points），而前端页面展示口径为 2880（含 initial）。

前端不依赖服务端 summary（派生量全部本地重算，列表预览仅用 total_cny），**无功能影响**。请确认该口径是否有意为之：

- 若有意：建议在 `PlanSummaryDto.total_points` 的 OpenAPI description 写明「购物车积分合计，不含 initial_points」。
- 若无心：summary 应加上 initial_points。

## 四、文档口径确认：id 为 string

实测 `LedgerPlanResponse.id` / `PlanListItemDto.id` / 路径参数 `{id}` 均为 **string**（Mongo ObjectId 风格），OpenAPI 已正确声明 string ✓；但 `03-frontend-integration-guide.md` 中多处标注「Long」（如 §1.2「自定义礼包 id（Long）」）。前端已按 string 实现。建议同步更新指南中的 Long 描述，避免误导其他消费方。

## 五、已确认一致的契约点（无需改动）

| 契约点 | 实测结果 |
|---|---|
| 无 token → 401 | ✓ |
| 不存在 / 越权 → 统一 404（不泄露存在性） | ✓ |
| daihao 快照缺 price_usd → 400「代号鸢(daihao)礼包快照必须填写 price_usd」 | ✓ |
| ru 方案 exchange_rate=null → 200 | ✓ |
| 空购物车保存 → 200（T2 决策 4） | ✓ |
| DELETE → `{"status_code":200,"data":true}` | ✓（§3.4 null 边界无需兼容） |
| 响应快照带 `custom` 布尔标记 | ✓（前端 PUT 回写时已剥离该字段；请保持请求侧对未知字段宽容，即 fail-on-unknown-properties=false） |
| 列表为轻量 DTO（不含 cart_items/custom_packages） | ✓ |
| 自定义 id 重生成后 cart_items 引用同步回写 | ✓ |

## 六、可选：请求体 required 字段的宽容度说明

T3 指南 E2 曾有一个调用方 bug（前端已修复）：旧代码可能只发 `{name, version}` 而缺省 `cart_items/custom_packages`，当前服务端按空数组兜底处理（200 + 空数组入库）。OpenAPI 声明二者 required，实际行为偏宽容。前端修复后始终全量发送，**可保持现状**；若想严格，开启 `@NotNull`/`@NotEmpty` 校验即可（不影响已修复的前端）。

---

## 附录 A：复现命令

```bash
BASE=http://192.168.31.55:8080/hub/ledger/plan
AUTH="Authorization: Bearer <token>"

# 1) 空 name → 200（期望 400）
curl -s -X POST "$BASE" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"","version":"daihao","exchange_rate":7.2,"initial_points":0,"cart_items":[],"custom_packages":[]}'

# 2) 51 字 name → 200（期望 400）
python3 - <<'EOF'
import json, urllib.request, urllib.error
body = {"name": "长"*51, "version": "daihao", "exchange_rate": 7.2,
        "initial_points": 0, "cart_items": [], "custom_packages": []}
req = urllib.request.Request("http://192.168.31.55:8080/hub/ledger/plan",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer <token>"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print("HTTP", r.status, r.read().decode()[:200])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:200])
EOF

# 3) 非法 version → 200（期望 400）
curl -s -X POST "$BASE" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"坏版本","version":"xxx","initial_points":0,"cart_items":[],"custom_packages":[]}'
```

---

## 附录 B：本次联调中前端已做的适配（供后端 AGENT 了解现状）

1. 云端方案 id 为 string → 前端用独立标志位 `planIsLocal` 区分「本地暂存方案(_localId)」与「云端方案」，不再用 typeof 判别。
2. 修复了指南 E2/E4 中 snake_case payload 直传 camelCase 门面导致数据丢失的问题（前端新增 `toLedgerArgs` 转换层）。
3. PUT 回写请求体前剥离响应私有的 `package_snapshot.custom` 字段。

---

## 附录 C：后端处理结论（2026-08-16）

### 一、P1 参数校验缺口 —— 已修复 ✅（根因：全项目 Kotlin「@Valid 写在类型前」陷阱）

**根因（不是 LedgerPlanCreateRequest 的问题）**：项目中所有控制器都写成
`fun f(@RequestBody x: @Valid T)`——@Valid 写在类型前时,Kotlin 编译器将其按
**类型注解(TYPE_USE)**处理,**不发射到 JVM 方法参数注解**,Spring 的
`validateIfApplicable` 看不到 @Valid → 校验静默跳过。已逐字节码验证
(javap: 修复前参数注解只有 @RequestBody;修复后 [Valid, RequestBody])。

**影响范围**：不止账房接口——UserController/DemoController/HubPostController 共 11 处同样写法,
注册接口的 @Email 等校验此前同样失效(实测非法邮箱此前 401「验证码错误」而非 400)。

**修复**：11 处全部改为 `fun f(@Valid @RequestBody x: T)`。修复后实测：
- 空 name → 400「方案名不能为空」✓
- 51 字 name → 400「方案名最长 50 个字符」✓
- 非法 version → 400「版本仅支持 daihao 或 ru」✓
- 嵌套 content_id=0 → 400「礼包 id 非法」✓（级联校验同步生效）

**守护测试**：新增 `LedgerPlanMvcValidationTest`(全上下文 MockMvc,3 例)+
`LedgerPlanValidationProbeTest`(3 例)。全量 37 测试 + ktlint 通过。

**注意(与前端口径相关)**：本项目 GlobalExceptionHandler 不带 @ResponseStatus,
**HTTP 状态恒为 200**,业务码在响应体 `status_code`——与前端 request.js 的判定方式一致,无需前端改动。

### 二、自定义礼包 id 每次保存重生成 —— 保持现状（有意为之）

决策 2 的设计语义即「服务端每次保存重生成 id 并回写引用」,03 指南已约定
「客户端必须以响应为准回写本地」。前端已按此实现,引用不会漂移,功能无碍。
若未来需要幂等稳定 id,可改「无冲突保留/冲突才重生成」,届时再评估。

### 三、summary.total_points 不含 initial_points —— 确认有意 ✅

summary 为缓存性质、非权威;前端页面展示口径 = total_points + initial_points
(本地重算)。已在 OpenAPI 补充说明：`PlanSummaryDto.total_points` 的
description =「购物车礼包积分合计,不含 initial_points(总积分 = total_points + initial_points)」。

### 四、id 为 string —— 确认一致 ✅

方案 id/路径参数为 string(Mongo ObjectId),仅 content_id/custom_packages[].id 为 Long。
已在 03 指南 §1.2 顶部补充「id 类型口径」说明,消除歧义。

### 五、required 字段宽容度 —— 保持现状

cart_items/custom_packages 缺省按空数组兜底,前端已修复为全量发送,可保持;
后续若需严格可加 @NotNull,本期不动。

### 部署提示

8080 上正在运行的实例仍是**修复前**的构建。请重新构建并重启后端后,
重跑前端联调清单中的 P1 三例确认生效(预期返回 status_code 400)。
后端测试账号 ledger-p1-check@yituliu.test 产生的 7 条方案及诊断账号数据已全部清理。
