# Monorepo 适用说明

本目录现在是根仓库的普通跟踪目录。Git 分支与提交以 `git rev-parse --show-toplevel` 定位的当前 Worktree 为准；不再要求本目录有独立 .git，也不单独 clone/push。依赖安装、测试、构建仍从本目录执行。以下原有安全、领域、UI 和风险规则继续适用；涉及历史“独立仓库/相邻仓库”的结构说明，以根 AGENTS.md 与 docs/monorepo-operations.md 为准。

## 开发与验证

- Git、服务管理、授权与最小充分验证要求以根 `AGENTS.md` 为准；测试入口见根 `docs/development/testing.md`。依赖、Gradle 测试和构建从 `backend/` 执行，服务只通过根 `./dev.sh` 管理；不要求 Mini-Trellis 或旧工作区。
- 现有组件检查为 `./gradlew ktlintCheck`、`./gradlew test`、`./gradlew assemble`（可加 `--console=plain`），不是每次改动的固定流程。默认 `test` 排除 integration/architecture/api-schema/realistic/stress 标签；各显式任务及 `check` 依赖不变。
- 日常不跑、不新增测试；仅鉴权/账号隔离或数据迁移、删除、批量写入改动跑相关测试类，可用 `./gradlew criticalTest --tests '<相关类>'`。`integrationTest`、`apiSchemaTest`、`architectureTest`、`realisticTest`、`stressTest` 与 mutation 均为手动诊断工具，不是门禁；发布本地门禁为 `ktlintCheck test criticalTest`，迁移 Node 与 beta npm 测试保留。

## 数据、交互与用户修改保护

- Mongo/Redis 集成验证复用本机服务，只能使用 TestMongo 分配并注册的随机测试库与 TestRedis 的进程专属键命名空间，不依赖 Docker。不得访问 MaaBackend/HubBackend 或生产数据，不绕过夹具，不 flush Redis。
- 上述数据禁用范围针对自动测试。本地开发与调试可按根规则使用 MaaBackend/HubBackend 和 Redis DB 0 的开发数据；写入须在任务授权范围内，破坏性操作另行确认。
- 旧文档中的 TestMongo 容器描述仅反映历史环境，不是当前测试前置条件；当前隔离方式以根 `docs/development/testing.md` 和测试夹具为准。历史验证与授权记录不构成新任务的执行授权。
- 根浏览器授权边界同样适用：默认不运行浏览器自动化、真实页面访问/登录、截图或 E2E，不为此启服务、装依赖；“验证/集中回归”不隐含授权。影响 UI/交互时同时遵守根与前端的 ui-ux-pro-max 和页面规范；真实页面由用户手动验收。
- 不覆盖已有修改，不 reset、stash、clean，不擅自 commit、push、创建 PR 或部署；不终止/重启现有服务。报告实际验证与未验证风险，不把代码检查当作运行时验收。

## Inventory domain standards

Tasks involving inventory, reward records, inventory import/export, inventory snapshots, or the inventory exchange protocol must read and follow these repository-local standards before implementation:

- `docs/standards/inventory/backend-design.md`
- `docs/standards/inventory/exchange-protocol-v1.md`

Machine-readable protocol schema:

- `docs/standards/inventory/schema/inventory-exchange-v1.schema.json`

These documents are the authoritative inventory-domain specifications for this repository. Non-inventory tasks do not need to read them.

### Inventory invariants

- Current inventory state and historical reward records are different facts; do not derive ordinary current-stock reads by replaying the full reward history.
- `reward_delta` is an increment event; `stock_snapshot` is an absolute observation. Do not interchange their semantics.
- `record_id` is the idempotency key for exchanged records; repeated imports of the same record must not apply stock changes twice.
- Cross-platform object identity uses the stable `(entity_type, id)` pair. Display names are not database or protocol identity keys.
- Snapshot baseline rules determine whether a delayed reward changes current stock; historical rewards may remain valid for statistics without changing current stock.
- Protocol behavior and field semantics must stay aligned with `exchange-protocol-v1.md` and its JSON Schema.


## 发布入口

所有者可直接开发/Push 根 main，不强制 PR；外部贡献者 PR 由所有者审核。日常事件不跑完整 CI。正式版本通过根 `./release.sh --prepare` 确定，`--status` 查询集中门禁，`--publish` 须另行授权；不单独提交版本 PR。以根 docs/monorepo-operations.md 为准。
