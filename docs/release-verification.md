# 本轮发布流程验证记录（2026-11-04）

## 第 3 阶段：真实集中检查准备

所有者已授权修复、commit/普通 Push 及 `./release.sh --prepare`，不含生产发布。已复现 `operatorGrowthOwnership.spec.js:668`：展示模式按钮先匹配 `aria-pressed=true`，没有 `data-date`；将选择器限定 `[data-date][aria-pressed="true"]` 后，该文件 46 tests 全部通过，账号、日期、保存次数及焦点断言均保留，未修改页面业务代码。

启动前审查：集中 workflow 与三个 reusable CI 无生产 Environment、Secrets 继承、SSH 或部署步骤。GitHub-hosted Runner 创建一次性 Mongo 7 副本集和 Redis 7；TestMongo 注册随机自有库，TestRedis 使用 DB 15 和进程键前缀，Gradle 测试过滤生产连接环境变量并固定测试配置，beta Mongo 用例只清理随机自有库。前端行为测试使用 jsdom/API mocks，意外 fetch 会失败。prepare 仅对公开版本元数据执行 GET，不访问生产数据库；构建 API URL 仅注入配置。部署开关保持 false，不创建正式标签。

本地定向通过不代表集中 CI 已通过。最终候选以 `.dev/release/candidate.json` 的完整 SHA/run ID，以及同 SHA、同 attempt 的成功 run 和 immutable candidate artifact 为准；失败修复后需重新提交并 prepare。实际运行链接和下载核验记录保存在本树忽略目录 `.dev/release-stage3/`，不能用下方历史验证代替。

## 前两阶段历史记录

风险：L4。下表记录本地实施阶段的验证，当时 HEAD/origin/main 为 `19c8e9008c40caefe5b86fa5397a40cc65825d8a`，源码尚未提交。本记录不是正式发布凭据；不能把这些本地产物当作后续新 SHA 的集中 CI 结果。

远端切换第 1、2 步已获所有者授权。第 1 步实际回读确认 review Ruleset `26521810` active、仅 User `74225450` always bypass；经典 required PR/checks 已移除，enforce_admins 和禁止强推/删除仍保留。第 2 步提交/Push 后，以 GitHub main 的实际 commit/树和 CODEOWNERS errors 回读为准；不运行集中 CI。备份及 API 证据保存在 `.dev/release-cutover/20261104T094251Z/`。

第 2 步提交前重新执行：上述发布基础设施组合 44 tests / OK（22.385 秒）、前端 buildInfo 7 pass / 0 skipped、actionlint（关闭未安装的 shellcheck/pyflakes）、入口 Shell 语法及 diff 格式检查均通过。没有重跑全量业务回归、真实构建或远端 CI；原构建记录仍仅用于说明本地构建机制。

| 已执行检查 | 真实结果 | 目的 |
| --- | --- | --- |
| `python3 -m unittest scripts.testing.test_monorepo_ci scripts.testing.test_monorepo_release scripts.testing.test_artifact_deploy scripts.testing.test_server_prebuild` | 最终 44 tests，OK | 必需检查失败/取消/跳过阻断；run/SHA/attempt/版本/API/有效期绑定；模拟 gh 协议；临时 Git 不可变 tag；发布顺序与失败恢复 |
| 上述组合另含 `scripts.testing.test_release_workflow` | 77 tests，OK（较早一轮，之后新增用例由最终 44 项覆盖） | 确保历史脚本加拒绝入口后，原独立 fixture 兼容覆盖仍可执行 |
| `node --test test/buildInfo.test.js`（frontend） | 7 pass，0 skipped | 发布参数覆盖本地默认、非法版本拒绝、版本显示字段保持兼容 |
| `npm run test:static`（frontend） | 874 checked，0 failed | 改动的构建/测试源文件可以编译 |
| actionlint 1.7.12（`-shellcheck= -pyflakes=`） | exit 0 | 全部根 workflow YAML、Actions 表达式及 reusable 参数检查；不包含 shellcheck/pyflakes |
| `YUANHUB_VERSION=9.8.7 npm run build` | exit 0 | 真实 dist/build-info.json 的版本与完整 HEAD 一致；页面资源含 9.8.7；SW 存在 |
| JDK21 下 `YUANHUB_BACKEND_VERSION=9.8.7 ./gradlew bootJar --console=plain` | BUILD SUCCESSFUL | 真实 JAR 的 git.properties 完整 SHA 和根 META-INF/build-info.properties 的 build.version=9.8.7 均核对成功 |
| `bash -n`（根入口及三份历史脚本）、`git diff --check`、离线双组件 dry-run | exit 0 | 脚本语法、差异格式与不访问远端的发布计划 |

上述历史构建使用当时未提交源码，产物里的 Git SHA 只说明元数据注入结果，不证明此 SHA 已覆盖本轮代码。正式候选必须先经授权 commit/push，再从干净且与远端一致的 main 冻结。测试 JAR 已移入忽略的 `.test-artifacts/`，不混入日常 backend/build/libs。所有测试日志和工具仅在本树忽略目录中。

## 覆盖与未验收边界

- 已证明本地 YAML 不含 Push/PR/schedule/tag 自动入口；集中 gate 不接受任一必需 job 失败、取消或跳过。旧成功记录不能证明新 SHA 或新 attempt；旧 JAR 不能被标成新版本。已验证后端失败不启动前端、原后端公共检查失败会恢复旧 slot、前端构建失败保持 current、不可变历史目录/标签冲突停止。
- 旧后端仓库 BackEndV3-Share 的 Actions/Release 仍启用，生产环境没有审批且仍指向当前 API；Monorepo 部署开关不能阻止它。新通道生产发布及回滚验证前保留旧能力；最终退役另行授权。正式切换须人工约束两仓并发并验证旧 tag 入口边界，不能提前停用回滚通道。
- main 远端规则已按上文切换；CODEOWNERS 使用全仓 `* @MrSnake0208`。所有者直推以实际 Push 成功为证，其他贡献者 PR+CODEOWNER 要求以有效 Ruleset、经典保护和 GitHub 文件识别结果共同核验；本轮不使用贡献者账号做真实写入测试。配置见 [release-settings](release-settings/README.md)。
- 没有实际触发 GitHub Actions，没有在真实 Runner 上验证一次性 Mongo/Redis、mongosh wrapper、Environment 审批或 artifact 下载；没有执行浏览器自动化或 UI 运行时验证。本轮不运行完整业务回归/真实数据库语义测试，也没有修改业务页面或删除测试。
- 当前 SHA 的历史完整回归 run [41743234153](https://github.com/MrSnake0208/YuanHub/actions/runs/41743234153) 失败于 `frontend/behavior/operatorGrowthOwnership.spec.js:668`，日期 aria 属性预期 2026-11-05、实际 undefined。该问题未在本任务修复；首次集中发版前必须定位并修复/重验，禁止 skip 放行。
- 本地实施阶段未 SSH、打 tag、commit/push、更新远端或部署；后续第 1、2 步仅授权 main 保护配置和本轮代码 commit/Push，不含生产操作。此前只读生产元数据显示 frontend 0.1.14 / a8a3eb6、backend v0.1.41 / e8cd247；deploy 开关保持 false。生产回滚只有原操作与隔离 fixture 证据，未做线上演练。

后续人工验收：代码进入 main 后先完成规则和 SHA 回读；第 3 步获授权后才运行 prepare，解决已知回归并验证失败不能 publish。第 4 步按实际 workflow ref 配置 Environment，只有所有者审批时保持 prevent_self_review=false。生产发布另行授权；上线后手动核对网站显示版本、deploy-meta.json/build-info.json、后端 /version 和 SW 一致性，不能用本记录代替生产验收。
