# 测试与轻量 CI

## 日常开发

- UI、文案、样式、普通功能与普通 Bug 默认只看源码与 diff，不跑测试、不新增测试。
- 仅鉴权/账号隔离，以及数据迁移、删除、批量写入改动跑相关测试类，例如在 `backend/` 执行 `./gradlew criticalTest --tests '<相关类>' --console=plain`，不跑全量。
- 正常改动导致已有纯文本断言失败时，直接删除该断言，不修补以迎合；保留有效安全断言。
- DSH 仅在鉴权/账号隔离或数据结构/迁移的大改动时由用户按需启动，平时不用。
- 浏览器自动化默认关闭，须当前任务明确授权；真实页面、触控和视口由用户手动验收，不将源码检查当作运行时通过。

## CI

`.github/workflows/ci.yml` 在 Push 到 main、PR 或手动触发时运行，按 ref 取消旧任务。路径过滤只运行受影响组件；修改 CI 文件或手动触发时两端都跑。

- 后端（JDK 21）：在 `backend/` 执行 `./gradlew ktlintCheck test --console=plain`，失败时上传单元测试报告。默认 test 排除 integration、architecture、api-schema、realistic、stress，使用不可连接的数据库占位地址；CI 不启动 Mongo/Redis。
- 前端（Node 22）：在 `frontend/` 执行 `npm ci`、`npm run test:static`、`npm run build`。
- CI 失败再修；轻量 CI 不部署、不上传构建产物、不使用 secrets。旧组件、全量回归及差异诊断工作流保留手动入口。

## 发布门禁

根 `./release.sh --prepare` 冻结 main SHA，仅对所选组件执行以下本地命令，组件之间并行、组件内顺序执行：

- 前端（`frontend/`）：`npm run test:static`。
- 后端（`backend/`）：`./gradlew ktlintCheck test criticalTest --console=plain`；`--stress` 仍追加 `stressTest`。
- 后端迁移（`backend/`）：`node --test scripts/migrations/20260907-level-catalog.test.js scripts/migrations/20261015-recruitment-duplicate-pools.test.js`。
- beta（`backend/scripts/beta/`）：`npm test`；缺少 node_modules 时先 `npm ci`，Mongo 测试仍使用本机自有随机库。

criticalTest 使用本机 MongoDB 副本集，默认 4 个 fork 并行，可用 `-PcriticalForks=N` 调整（N 必须为正整数）。prepare 同时运行 GitHub 发布基础设施回归及 JAR 构建、服务器 A 前端预构建；每个所选组件都必须有匹配 SHA、命令和成功结果的本地记录。state 与日志保存在 `.dev/release/`，候选 run/attempt、版本与产物证据须匹配，最多有效 7 天。`--status` 查询，`--publish` 仍须另行明确授权；详见 [发布操作](../monorepo-operations.md)。

## criticalTest 覆盖

criticalTest 由 `backend/build.gradle.kts` 中的 `criticalTestClasses` 清单决定，新增关键类时只需加入该清单；以下 8 类保留 `@Tag("integration")`，在分配 fork 前按类文件过滤，默认 test 不运行它们，tasks.check 及其它套件不变。RecruitmentMongoTest 保持默认串行，每类共用 TestMongo 随机库和 client，集合及索引仅创建一次；每个用例开始前清空所有集合文档，服务与 mock 仍按用例新建。

| 测试类 | 保留理由 |
| --- | --- |
| AccountIndexMongoTest | 账号唯一索引与隔离约束。 |
| CalendarPrivateItemMongoTest | 私有日历事项的账号隔离与写入安全。 |
| OperatorShareMongoTest | 分享写入不得复活已删除账号或覆盖生命周期隔离。 |
| StarInventorySyncMongoTest | 星石与库存同步的事务和账号隔离。 |
| RecruitmentMongoTest | 招募持久化、事务与账号隔离。 |
| ActivityCalendarSubscriptionMongoTest | 日历订阅的账号隔离与并发写入安全。 |
| InventoryRestoreMongoTest | 库存恢复的数据一致性与账号隔离。 |
| OperatorResetMongoTest | 密探重置的批量数据安全。 |

两个一次性修复脚本测试已移出 criticalTest，仅保留 integration 标签；只在再次执行对应迁移脚本时，从 `backend/` 手动运行 `./gradlew integrationTest --tests 'com.lhs.share.hub.service.recruitment.RecruitmentDuplicateRepairMongoTest'` 或 `./gradlew integrationTest --tests 'com.lhs.share.hub.service.recruitment.RecruitmentRemainderRepairMongoTest'`，需要 mongosh。

## 手动诊断入口

`integrationTest`、`apiSchemaTest`、`architectureTest`、`realisticTest`、`stressTest`、mutation（PIT）、前端 `test:repo`/`test:contract`/`test:behavior`/`test:all`、根 `./scripts/test.sh quick/smart/all/stress/plan/doctor` 均保留为手动诊断工具，不是日常或默认发布门禁。只有显式 `--stress` 才把 stressTest 加入发布命令；现有 check 任务依赖不变。全量回归由用户按需执行，不构成浏览器授权。

## Safety for database suites

- 本地开发与调试可在授权任务内使用共享 MaaBackend/HubBackend 和 Redis DB 0；破坏性操作仍须确认。自动测试不得将开发数据当作夹具或清理对象。
- 数据库套件使用合成、确定性、可丢弃数据，连接现有本机 MongoDB 副本集（127.0.0.1:27017）和 Redis（127.0.0.1:6379），无需 Docker/Testcontainers；缺少基础设施应失败，不得 skip。
- TestMongo 仅允许访问本 JVM 随机分配并注册的测试库；自动测试不得访问 MaaBackend/HubBackend、生产库或外部传入的数据库 URI。
- TestRedis 使用 DB 15 与每 JVM 专属键序列化器，隔离普通键、Lua KEYS 和通配符清理；Spring StringRedisTemplate 使用同一序列化器，直接创建模板须用 `TestRedis.template(factory)`。不得绕过夹具或 flush Redis。
- JVM 退出只清理自己注册的数据库与命名空间键；强制终止可能留下可丢弃数据，不得批量清理其他会话。普通单元测试仍使用不可连接的占位地址，不能改为开发数据库连接。
