## 测试与验证：按风险选择最小充分检查

测试要求与**行为变化**绑定，不与“修改了 Kotlin 文件”绑定。

| 等级 | 后端典型改动 | 默认处理 |
| --- | --- | --- |
| **L0** | 文档、注释、纯日志文案、确定不改变行为的格式化 | 检查 diff；不要求测试/build |
| **L1** | 局部实现细节、不改变 API/持久化/共享状态语义 | 只做直接相关的定向测试或编译/lint |
| **L2** | 一般 Service/Domain 行为、校验、数据转换、普通接口逻辑 | 同步更新相关单元/契约测试；建议用户运行受影响测试 |
| **L3** | API 契约、鉴权、账户隔离、持久化、事务、缓存、并发、幂等、共享核心 | 相关单元/契约 + 必要 integration；可使用 `./test smart` |
| **L4** | Gradle/依赖/CI/测试基础设施/部署发布/跨仓基础设施 | 才执行完整 CI 等价检查或 `./test all` |

### 测试代码

- 新增功能、接口或改变既有 API / 业务行为时，如果现有测试不能覆盖新行为，必须同步新增/更新测试。
- 修改业务规则、权限、账户隔离、幂等、配额、事务、缓存、并发、状态转换、错误处理或持久化语义时，需要对应行为测试。
- Bug 修复原则上补能复现该 Bug 的回归测试。
- 纯文档、注释、格式化或确定不改变外部行为的重构默认不新增测试。
- 不得为了通过 CI 删除有效测试、弱化关键断言、添加无理由的 skip/disable，或恢复废弃行为。

### 谁来执行验证

YuanHub-All 工作区默认由**用户/CI 执行回归与全量验证**。Agent 负责补齐必要测试代码并在最终汇报中列出最小必要命令；除非当前任务明确要求 Agent 代跑，否则不要自动执行完整 Gradle/容器测试套件。

当前仓库 CI 等价命令仍是：

```bash
./gradlew ktlintCheck --console=plain
./gradlew test --console=plain
./gradlew assemble --console=plain
```

默认 `test` 排除 `integration` / `architecture` / `api-schema` / `realistic` / `stress` 标签；普通单元、MockMvc 与未带这些标签的契约测试仍保留。各专用任务和 `check` 依赖不变。

容器依赖的 `integrationTest` / `apiSchemaTest` / `realisticTest` 只在修改真正触及对应语义时建议执行；`stressTest` 仅用于索引、分页、聚合、大规模导入/同步等规模敏感修改。不得把它们当成普通小改动的固定流程。

## 浏览器自动化默认禁用

- YuanHub 开发任务默认不运行 Playwright、Chrome DevTools、Puppeteer、Cypress、真实浏览器 E2E、自动页面/截图/视口矩阵；不得为此启动浏览器或重复启动服务、安装浏览器依赖、修复无关浏览器测试环境。只有当前任务由用户明确要求浏览器自动化时才可例外；普通“验证”或“集中回归”不视作授权。
- 后端开发仍按 L0–L4 保留必要的非浏览器定向单元、API/契约、权限、账户隔离和数据正确性验证；Mongo/Redis 集成检查必须使用隔离、可抛弃的自有容器。行为变化同步维护测试，不得删除有效测试或弱化 CI。
- 页面布局与交互由用户手动验收；最终报告实际执行的代码检查、未执行项、剩余风险及必要的人工验收步骤。

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong here — including a rare-looking case, if
this project actually produces it. Then keep the fix in scope:

1. This is not a security paper. Verification is welcome; over-defense is not.
   Unless this project states otherwise, assume a cooperating operator on their
   own machine; if it has a real adversary, it will say so and that scope wins.
2. Do not add hashes, checksums or fingerprints unless the hash replaces a
   materially more expensive operation AND its result changes what happens next.
3. No defensive scaffolding: no feature flags, migration frameworks, compat
   layers or wrappers for cases that do not occur here.
4. No corner-case obsession: exotic encodings, symlink races, RTL text and
   millisecond races are out of scope unless the case is reachable through this
   project's supported use — its documented inputs, its published interface, its
   real data. Reachable is enough; you do not need a reproduction. Constructible
   in principle is not enough.
5. Where judgement is needed, judge. Do not replace it with a scoring table, a
   checklist, or a re-verification loop over something already settled.
6. None of this overrides security, migration, verification or review that the
   user, this project's own conventions, or a higher-priority rule asked for.
   Those were requested; they are the work, not scope creep.
   Shapes already seen, for calibration. Examples, not a checklist — a real finding
   is not dismissed by resembling one:
   H hashing every row of two spreadsheets to answer what comparing cells answers
   H writing checksum files that nothing ever reads
   E hardening the accounts of an app that has no users and no deployment
   R auditing your own patch all night while the feature stays unwritten
   R a reviewer that returns a failing verdict on everything
   O guards whose justification is the previous guard, not the requirement
   And two that look like the above and are not. Report these:
   ✓ a digest that lets you skip re-reading a large file you already have
   ✓ a rare-looking input this project's own documentation example produces
   Before running any check, answer: what specific failure would this detect, and
   what would I do differently if it occurred? No answer means do not run it.
   Say plainly when something is correct. Do not manufacture findings.

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


## Local risk-based verification gate (2026-09-28)

When this repository is edited inside YuanHub-All, follow root `TESTING.md` and only the backend quality guideline. Trellis tasks should record `risk_level` and `verification_owner`.

- `verification_owner=user`: finish/archive must not require a local `quick/smart/all` report; keep behavior-test coverage/exceptions honest and report pending commands to the user.
- `verification_owner=agent`: run only the checks justified by the risk; L3 normally uses `smart`, L4 may use `all`.
- L0/L1 non-behavior edits may use an exact-file test-plan exception rather than creating artificial tests.

Mongo/Redis integration tests must always use owned disposable containers, never existing development or production services. Preserve unrelated dirty files; never reset, stash, clean, or include them to satisfy a gate.
