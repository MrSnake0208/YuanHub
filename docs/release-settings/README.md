# GitHub 远端切换配置与执行边界

2026-11-04 切换前基线：main 的经典 Branch protection 要求 PR 和严格 `PR merge gate`，enforce_admins=true；没有 Ruleset；唯一 collaborator/admin 为 MrSnake0208（ID 74225450）。三个生产 Environment 没有审批或分支限制。仓库部署开关=false，未发现 Webhook；Pages API 返回 404。旧 `MrSnake0208/BackEndV3-Share` 未归档且 Actions enabled=true，CI/Release 都 active，Release 由 v* Tag Push 触发，生产环境无审批、无分支限制，仍配置当前后端地址和 VPS Secrets。

本目录的 JSON 不会被工作流自动应用。2026-11-04 第 1、2 步已完成；2026-11-07 所有者授权提交/Push、集中检查，并另行明确授权配置标签保护、前后端 Environment 审批、启用部署及创建正式标签后先后端再前端发布。第 4 步配置及本次前后端发布已完成；回滚演练与第 5 步旧通道退役仍待另行授权。

2026-11-04 第 1 步已应用并通过 API 回读：review Ruleset `26521810` 为 active，唯一 bypass 是 User `74225450` / always；经典保护已移除 required PR/checks，仍 enforce_admins=true、禁止 force push 和删除 main。变更前后快照保存在本树忽略目录 `.dev/release-cutover/20261104T094251Z/`。该次未修改 Secrets、Variables、Environment 或线上服务器；旧后端 Actions 保持启用。

## 配置与授权状态

| 配置 | 变化 | 保留的约束 |
| --- | --- | --- |
| main review Ruleset | 创建 `main-review-ruleset.json`：外部贡献者必须 PR、1 个 CODEOWNER 审核、新提交撤销旧审核；仅 User 74225450 可以 always bypass | 不授予其他管理员、普通 write 成员或 App bypass；CODEOWNERS 全仓只有所有者 |
| main 经典保护 | 用 `main-protection.json` 移除 required checks、required PR；继续 enforce_admins=true | 禁止任何人强推、删除 main；该保护与 owner 的 PR bypass 独立 |
| 标签 Ruleset（已配置并回读） | `immutable-tags-ruleset.json` 已创建为 active Ruleset `26759576` | frontend/v*、backend/v* 禁止更新/删除，无 bypass；允许首次创建 |
| 前后端生产 Environment（已配置并回读） | `frontend-production`、`backend-production` 应用 `production-environment.json` 和 main branch 策略；独立的 `production` 保持原状 | 不设人工 reviewer，只接受 main-ref dispatch；现有 Secrets 不变；Agent 在 prepare 检查通过后汇报候选并询问是否部署，用户明确确认后才能运行 `--publish --yes` |
| 部署通道（已启用） | Monorepo `YUANHUB_MONOREPO_DEPLOY_ENABLED=true`；旧后端 Actions/发布/回滚能力继续保留 | 每次正式发布仍须授权；`legacy-backend-actions.json` 仅为退役提案，回滚演练及旧通道停用未授权、未执行 |

本次配置前后及逐项 API 回读快照位于本树忽略目录 `.dev/release-cutover/20261107T142958Z/`。只修改上述两个 Environment、组件标签保护和部署开关；没有修改 main 保护、Secrets、服务器目标或旧仓 Actions。

2026-11-09 经所有者授权，主控已移除 `frontend-production`、`backend-production` 的 required reviewer 并回读确认；保留 main 分支策略、Secrets 和部署开关。发布改为 Agent 在 `--prepare` 检查通过后汇报候选并向用户询问一次是否部署到生产，取得明确确认后才运行 `./release.sh --publish --yes`。

## 2026-11-07 生产发布结果

冻结提交 `f28845cc343325d0894b70b266679e01203d1cd4`，以下工作流全部成功：

| 环节 | 版本 / 证据 |
| --- | --- |
| 集中检查 | [42381109694](https://github.com/MrSnake0208/YuanHub/actions/runs/42381109694)，同一 attempt 的发布凭据与 JAR 校验通过 |
| 后端先发布 | `backend/v0.1.42`，[42382031887](https://github.com/MrSnake0208/YuanHub/actions/runs/42382031887)，蓝绿及公开 `/version` 检查通过 |
| 前端后发布 | `frontend/v0.1.15`，[42382307357](https://github.com/MrSnake0208/YuanHub/actions/runs/42382307357)，公开元数据与 Service Worker 摘要检查通过 |

`./release.sh --publish --yes` 完成并报告两端 healthy；随后独立读取生产前端 `deploy-meta.json`、后端 `/version`，版本与完整 SHA 均匹配冻结候选。两个正式标签经远端解析均指向该提交；审批请求按本次明确授权由所有者身份批准。快照目录内 `production-verified.json` 保存最终回读。浏览器/实机验收和回滚演练未执行，旧后端通道保留。

GitHub 当前已支持仓库 Ruleset 的单用户 bypass，使用 `actor_type=User`，避免把特权扩散到整个管理员角色。依据：[官方变更说明](https://github.blog/changelog/2026-05-07-repository-rulesets-user-bypass-and-branch-renaming/)、[REST Rules API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)。CODEOWNERS 配合 required code owner review 才能强制所有者审核：[官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)。

## 五阶段顺序与失败恢复

1. **已授权：规则切换。** 保存原 main protection、全部 Rulesets、collaborators、Environment；先创建并验证 active review Ruleset，再移除经典 required PR/checks。Ruleset 创建或验证失败立即停止，不放宽旧保护；后续失败保留基础保护，不自行删除有效 Ruleset。恢复旧 PR/checks 必须使用备份里的可写字段，不能把含只读 URL 的 GET 响应直接 PUT。
2. **已授权：代码合入。** 审查本轮完整 diff、CODEOWNERS 全仓 `* @MrSnake0208` 和本地隔离检查，commit 前确认没有无关改动；远端 main 仍为预期父提交时普通 fast-forward Push。禁止 force push、自动 merge 或 reset。远端变化则停止并报告；Push 后比对远端 SHA/树、CODEOWNERS errors、Ruleset 和 Actions runs。所有者直接 Push 避免过渡 PR 被已取消的自动 `PR merge gate` 卡住。
3. **已完成：独立集中检查。** 候选 `f28845cc343325d0894b70b266679e01203d1cd4` 的 [集中检查 42381109694](https://github.com/MrSnake0208/YuanHub/actions/runs/42381109694) 六个 job 全部成功；`./release.sh --status` 校验 SHA、run/attempt、版本、配置及证据有效期通过。前端 `0.1.15`、后端 `0.1.42`，未选择 stress。此前失败候选不能替代本次凭据。
4. **已完成配置及本次发布。** 先回读标签规则与两个 Environment，再启用部署开关；`./release.sh --publish --dry-run` 通过后，使用 `--publish --yes` 发布冻结候选，按所有者本次授权批准对应环境请求。前后端发布及独立公开元数据回读通过，见上表。当前新版只接受 main-ref dispatch；若未来保留合法 tag-ref 工作流，须另行配置相应 tag 策略并保留集中 SHA 门禁。回滚演练未获授权、未执行；不得把正常发布成功当作回滚验证。
5. **待授权：旧通道退役。** 新 Monorepo 生产发布和安全回滚验证成功后，再单独批准是否停用旧后端 Actions。切换发布窗口人工约束两仓并发，保留旧回滚能力；跨仓 concurrency 不互斥。在这之前不应用 `legacy-backend-actions.json`，不让旧 tag 发布与新发布同时运行。

第 1 步实际使用的 API（`gh api` 没有 `--repo`，仓库在完整路径中明确指定；**不要重复创建 Ruleset**）：

```bash
# 首先创建 review Ruleset；必须读取返回的规则 ID 并核对，才能继续。
gh api --method POST repos/MrSnake0208/YuanHub/rulesets \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  --input docs/release-settings/main-review-ruleset.json
# 核对 active review Ruleset 后才能移除旧的 PR/CI 强制条件。
gh api --method PUT repos/MrSnake0208/YuanHub/branches/main/protection \
  --input docs/release-settings/main-protection.json
```

以下为配置入口参考，不能整段重复执行：标签与两个 Environment 已按本次授权配置，旧通道退役仍未授权。变更前须核对实际状态与第 4 步的 workflow ref：

```bash
gh api --method POST repos/MrSnake0208/YuanHub/rulesets \
  --input docs/release-settings/immutable-tags-ruleset.json
# 仅在第 5 步另经授权且新通道发布/回滚均验证后考虑停用。
gh api --method PUT repos/MrSnake0208/BackEndV3-Share/actions/permissions \
  --input docs/release-settings/legacy-backend-actions.json
# 本次仅对 frontend-production、backend-production 执行并逐次回读；production 未改。
gh api --method PUT repos/MrSnake0208/YuanHub/environments/frontend-production \
  --input docs/release-settings/production-environment.json
gh api --method POST repos/MrSnake0208/YuanHub/environments/frontend-production/deployment-branch-policies \
  --input docs/release-settings/main-deployment-policy.json
```

单用户 bypass、组件标签规则与前后端 Environment 均已通过实际 API 回读验证；生产发布结果见本页记录，回滚能力尚未演练。若后续平台拒绝保护配置，不扩大 bypass、不解除基础保护，停止发布并报告。主分支和 tag 规则只约束保留规则期间的操作；仓库所有者仍能管理规则本身，这不是对所有者的权限隔离。贡献者 PR 审核配置可从 API 和 CODEOWNERS 识别结果验收，本轮不使用另一个贡献者账号尝试真实写入。

## 2026-11-09 发布提速改动（本地实现，未运行验证或发布）

`--prepare` 改为并发执行所选组件本地测试、GitHub release-check 保留发布基础设施回归，组件构建仅 assemble/校验/保存 JAR，以及取得 check run ID 后立即在服务器 A 预构建前端；全部等待完成后才报告 ready。本地 state/日志保存测试 SHA、组件、命令结果与时间，publish 拒绝缺失或不匹配的记录，前端须预构建成功。GitHub manifest 使用 `checks=artifact-only`，只发前端时 backend job 必须 skipped，选中后端时必须 success。前端 prepare 只校验 run 身份和未失败状态，不查 manifest/JAR/基线；release 的完整证据、基线、API 配置和后端就绪校验保留，不新增 GitHub 向服务器 A 上传前端产物的路径。

后端切流后的排空改为脱离 SSH 的后台任务，停止旧 slot 前核对 active slot；下一次 release 先取消待排空任务并同步收尾，prepare 不触碰运行服务，零等待仍同步停止。integrationTest 可按 fork 隔离目录并发执行，其它 Test task 仍为 1。以上仅为代码改动记录，不代表远端工作流已更新或运行通过；未改 Secrets、仓库变量、Environment、部署开关或服务器配置。Agent 仍须在 prepare 检查通过后汇报候选并询问用户，明确确认后才能执行 `--publish --yes`。历史检查与发布结果保持原样。
