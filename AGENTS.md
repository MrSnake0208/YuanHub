# YuanHub 开发规则

## 工作树与边界

- 编辑前执行 `git rev-parse --show-toplevel`、`git branch --show-current`、`git status --short`；只编辑当前 Worktree，不切换写死的分支，不跳到旧工作区。保护已有修改，不 reset、stash、clean 或覆盖他人成果。
- 这是一个 Monorepo：`frontend/` 和 `backend/` 共享根 Git 与分支，不创建子仓、第二套分支或跨工作区符号链接。前端负责 Vue/Vite 页面、API 调用与公开开发者文档；后端负责 Kotlin/Spring API、权限与持久化。保留两端 AGENTS.md 的领域约束。
- 两端分别安装依赖、测试、构建与部署；API/DTO/协议变更同时检查调用方、两端契约及兼容发布顺序。操作见 [Monorepo 手册](docs/monorepo-operations.md)，旧多仓发布脚本仅作历史资产。
- 未经当前会话明确授权，不 commit、push、创建 PR、merge、远端写入或部署。所有者可在 main 直接开发及 Push，不强制 PR；外部贡献者须 PR 并经所有者审核。

## Codex Native 与项目记忆

- 普通开发直接进行，不强制 PRD、Design、Task、Research、Remember、固定阶段或归档门禁；复杂需求可用 Codex 原生 Plan。
- 默认由主会话完成探索、实现与最小自检。专项 Skills 按任务调用；仅用户明确要求或适用 Skill 明确需要时启用子 Agent，不自动调用 DSH。
- Mini-Trellis 只存放可复用知识与跨会话记忆。需要既有规则或历史决定时才检索，确认了长期有用的结论才记录；已有主题优先更新原文件，不重复存档。spec promotion 仍须用户确认。
- `.trellis/` 是本地忽略目录；Codex 集成可选，未安装 CLI、未初始化记忆或未批准 Hook 不阻塞普通开发、组件测试和构建。不引用旧 YuanHub-All 作为开发依赖，不自动导入历史知识。
- 先定位再读取，只加载相关规范与局部源码；搜索/日志输出通常控制在约 12 KB 或 160 行，必要安全证据不受此限制。改动接口、配置、脚本或用户行为时同步直接相关文档。

## 开发服务与数据安全

- 统一使用当前树 `./dev.sh`，优先复用现有服务；只有确实需要且尚未运行时才按需执行 `./dev.sh frontend`、`./dev.sh backend` 或 `./dev.sh preview`。不得自行运行 bootRun、npm run dev、vite 等重复启动命令。
- 不擅自重启、停止已有服务；确需操作先说明原因并获确认。端口占用时停止并报告，不终止他人进程。临时数据、日志、依赖与构建输出只放本树忽略目录。
- 默认共用本机 MongoDB 的 MaaBackend/HubBackend 与 Redis DB 0 开发数据，仅隔离应用端口和本地配置；保存、删除会影响共享数据，不自动清库或迁移。`./dev.sh --print-env` 查看地址；`preview` 监听 `0.0.0.0`，局域网可访问；`containers` 才显式使用原私有容器。不操作 Tailscale Serve/Funnel。
- 本地开发与调试可使用上述开发数据；写入限于当前任务已授权范围，破坏性操作仍须确认。此许可不适用于自动测试：自动测试继续使用下述隔离测试库与键命名空间，不把开发数据作为测试夹具或清理对象。
- 自动测试仅使用 TestMongo 分配并注册的随机测试库和 TestRedis 的进程专属键命名空间。不得对共享开发/生产数据运行事务或 Redis 语义测试，不得绕过夹具、flush Redis 或使用开发库；具体约束见 [测试文档](docs/development/testing.md)。鉴权、账号隔离与数据保护不得因减轻流程而弱化。

## 最小充分验证

- 默认检查相关源码与 diff；根据具体失败风险选择最小验证，说明检查要发现什么、失败会改变什么。文案、样式和局部交互不默认要求补测、跑测或 build。
- 涉及鉴权/权限、账号隔离、API 契约、路由/共享状态、共享核心、数据正确性、持久化/迁移、事务/并发、缓存或幂等时，必须取得受影响关键约束的可复核定向证据，不能推给后续 DSH 或 CI。
- 依赖、构建、CI、测试基础设施及部署发布改动执行对应专项检查；只有受影响范围确实需要时才运行全量或规模测试。测试入口与数据隔离要求见 [测试文档](docs/development/testing.md)；`./scripts/test.sh quick/smart/all/stress` 按需选用，不是固定流水线。
- 优先复用有效测试，有具体覆盖缺口才补；不因行为变化或 Bug 修复一律新增/运行测试。不删除有效测试、弱化关键断言、无理由 skip/disable 或恢复废弃行为迎合旧测试。本节优先于子文档中的泛化补测要求，具体安全约束继续适用。
- Codex 负责实现、diff 自检和必要最小验证；常规回归/全量由用户、独立 DSH 或 CI 负责。只报告实际执行的检查，不把源码检查当成浏览器或生产验收。

## UI/UX 与浏览器边界

- 涉及页面、表单、交互、提示文案、样式或响应式时，按范围读取 [页面开发与玩家体验规范](frontend/docs/standards/page-development.md)。`mobile-design-system` 主导移动端设计，`b-end-design-system` 主导管理后台与复杂业务页面设计；`ui-ux-pro-max` 负责调研、方案比较与建议，不主导最终设计。按任务读取适用 Skill，不机械叠加三套完整流程；不可用时如实说明。纯后端且不影响交互时不触发。
- 功能扩展默认增量设计，不隐含整页重设计；按页面规范第 6 节说明玩家任务、功能归属、旧任务保护与界面净变化，第 11 节同时检查新能力和受影响旧路径。局部改动可用几句话，不增加固定审批或全量审计。
- 浏览器自动化默认关闭。本任务未获用户明确授权时，不运行 Playwright/Puppeteer/Cypress/Chrome DevTools、真实页面访问/自动登录、E2E 回放、截图/视觉对比或视口矩阵；不为此启动浏览器/服务、安装依赖或修复无关测试环境。普通“测试”“验证”“集中回归”不构成浏览器授权。
- 真实布局、交互、触控与浏览器表现由用户手动验收；按本次影响提供简短的页面、操作、预期及必要视口。取消浏览器自动化不取消必要的非浏览器安全/契约/隔离验证，不删除已有 E2E。
- 子文档、历史方案及 Skill 中的实机、浏览器、截图和视口检查清单统一作为用户手动验收参考，不是 Agent 本地交付门禁；保留的浏览器脚本仅供用户选择使用，Agent 执行仍须当前任务另行明确授权。历史任务的授权与通过记录不延续到新任务。

## DSH 与交付

- DSH 由用户在独立会话启动，以原始需求、真实使用预期和最终 diff 独立找反例；不照搬开发者测试设计，不自动派发，不作为低风险改动完成门槛。
- DSH 按改动检查真实路径、边界、重复操作、失败/恢复及相关账号隔离；UI 扩展同时检查入口可发现与旧主任务，遵守相同浏览器授权和数据隔离边界。
- 核实问题后修复，不削弱断言迎合验收。最终只报变更范围、风险、实际检查、未验证事项与必要下一步；需要 DSH 交接时提供原始目标、改动范围和已知边界，不将自测结论当唯一标准。

## 发布

- 普通 Push、PR、merge、tag 不自动运行 CI 或部署；集中发布检查在明确准备发布时进行，手动诊断入口保留。
- 根 `./release.sh --prepare` 冻结 main SHA、选择组件版本并启动集中检查；`--status` 查询，`--publish` 须另行明确授权。不得修改 VERSION 只为版本 PR，不复用其它 SHA/attempt 的结果。
- GitHub 远端配置、正式 tag、部署、回滚分别确认，保持部署开关现状。见 [发布设置](docs/release-settings/README.md) 与 [操作手册](docs/monorepo-operations.md)。

<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi), `$mini-trellis-remember` (Codex), or the `mini-trellis-remember` skill (Cursor and DeepSeek Harness). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

Record only confirmed decisions, reusable research findings, or the session/compact handoff. Skip ordinary turns and unconfirmed guesses. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep confirmed rules short and faithful. Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, follow this short order: read the existing topic; edit that file; read it back and check the new rule, limits, and negations; run `python3 ./.trellis/scripts/add_session.py --title "..." --summary "..." --topic <actual-topic-path>`; read the journal and check its topic link. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->
