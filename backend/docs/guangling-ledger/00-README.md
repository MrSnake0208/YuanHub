# 广陵账房 · 云端方案存储（设计交付物索引）

> 目标：让 YuanHub「广陵账房」（/cart）从「零持久化、一次性导出」升级为
> 「登录用户可在 HubBackend 保存多条方案（1:N）、随时读取恢复」。
> 本目录由 AgentTeams 团队 guangling-ledger-design 产出，三份文档依次递进。

## 文档

2026-10-22 个人价格、折扣与多币种扩展以 [05-multicurrency-pricing.md](05-multicurrency-pricing.md) 为准；以下旧版设计中的单一价格币种限制仅适用于未携带 `pricing` 的旧方案。

| # | 文件 | 作者 | 内容 |
|---|---|---|---|
| 01 | 01-research.md | 调研员 | 前端状态模型（字段级+证据行号）× 后端 HubBackend 约定 × 10 条决策点 |
| 02 | 02-backend-design.md | 后端架构师 | 集合 hub_ledger_plan、/hub/ledger/plan 五接口、DTO、配额、安全、错误码、包结构 |
| 03 | 03-frontend-integration-guide.md | 文档工程师 | src/api/ledger.js 完整代码、cart.vue 改动点 A~G、错误处理、自测清单 |

## 定案摘要（实现时以此为准）

- **存储位置**：HubBackend 库，集合 `hub_ledger_plan`（独立集合承载，复用现有 hub 基建，无需新库配置）。
- **接口**：`/hub/ledger/plan`，全部需登录（默认 authenticated，不新增放行）：
  - POST 创建 / PUT {id} 整体替换 / GET {id} 详情 / GET 列表（轻量） / DELETE {id}
  - DELETE 成功返回 `success(true)`（data=true）。
- **数据模型**：一条方案 = name + version(daihao|ru) + exchange_rate(仅 daihao) + initial_points + cart_items(含 package_snapshot 快照) + custom_packages；派生量全部前端重算。
- **关键决策**：快照兜底+目录回填；自定义礼包 id 服务端重生成（前端以响应为准）；每用户上限 50（share.ledger.max-plans-per-user）；允许空购物车；硬删除；越权与不存在统一 404。
- **错误口径**：400 / 401 / 404 / 409(可选) / 429，成功一律 status_code===200。

## 落地清单

### 后端（BackEndV3-Share）✅ 已实现（2026-08）
- [x] 实体+仓储：com.lhs.share.hub.repository.entity.LedgerPlan.kt、repository.LedgerPlanRepository.kt（仓储在 repository 顶层包 ✓）
- [x] 服务+控制器：hub/service/ledger/LedgerPlanService.kt、hub/controller/ledger/LedgerPlanController.kt + request/response DTO
- [x] 配置：share.ledger.max-plans-per-user=50（ShareProperties.Ledger + application.yml / application-dev.yml / application-template.yml）
- [x] 验证：/hub/ledger/** 不在 SecurityConfig 放行列表（默认 authenticated）；写接口 @RequireJwt + @AccessLimit(10,60)
- [x] 质量：全量 37 测试通过（LedgerPlanServiceTest 12 + MVC 校验回归 3 + Validator 探针 3 + 既有 19）；ktlintCheck 通过
- [x] 联调修复：全项目 11 处「`param: @Valid T`」写法修正为「`@Valid param: T`」（Bean Validation 恢复生效，详见 04 文档附录 C）
- [ ] 联调：起服务后按 03 指南第六部分 curl 清单自测（需 MongoDB/Redis 环境）

### 前端（YuanHub）
- [ ] 新增 src/api/ledger.js（指南第二部分可直接复制）
- [ ] cart.vue 改动点 A~G（指南第四部分逐点定位）
- [ ] 可选：PlanSaveDialog / PlanListDialog 组件、useLedgerPlans composable
- [ ] 联调：按指南第六部分 curl 清单与浏览器验收步骤自测

## 关联文档（YuanHub 侧既有）

- YuanHub/docs/api-contract.md（用户接口契约，登录/刷新基建）
- YuanHub/AGENTS.md（设计规范 v1.0，UI 配色约束）
