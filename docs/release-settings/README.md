# GitHub 远端切换配置与执行边界

2026-11-04 切换前基线：main 的经典 Branch protection 要求 PR 和严格 `PR merge gate`，enforce_admins=true；没有 Ruleset；唯一 collaborator/admin 为 MrSnake0208（ID 74225450）。三个生产 Environment 没有审批或分支限制。仓库部署开关=false，未发现 Webhook；Pages API 返回 404。旧 `MrSnake0208/BackEndV3-Share` 未归档且 Actions enabled=true，CI/Release 都 active，Release 由 v* Tag Push 触发，生产环境无审批、无分支限制，仍配置当前后端地址和 VPS Secrets。

本目录的 JSON 不会被工作流自动应用。2026-11-04 第 1、2 步已完成；所有者随后授权第 3 步：修复已知回归，提交并普通 fast-forward Push，从干净且同步的 main 冻结候选，首次运行集中 CI。第 4、5 步（生产配置/发布验证、旧通道退役）仍待授权；第 3 步不允许改规则、Environment、部署开关或创建正式 tag。

第 1 步已应用并通过 API 回读：review Ruleset `26521810` 为 active，唯一 bypass 是 User `74225450` / always；经典保护已移除 required PR/checks，仍 enforce_admins=true、禁止 force push 和删除 main。变更前后快照保存在本树忽略目录 `.dev/release-cutover/20261104T094251Z/`。未修改 Secrets、Variables、Environment 或线上服务器；旧后端 Actions 保持启用。

## 配置与授权状态

| 配置 | 变化 | 保留的约束 |
| --- | --- | --- |
| main review Ruleset | 创建 `main-review-ruleset.json`：外部贡献者必须 PR、1 个 CODEOWNER 审核、新提交撤销旧审核；仅 User 74225450 可以 always bypass | 不授予其他管理员、普通 write 成员或 App bypass；CODEOWNERS 全仓只有所有者 |
| main 经典保护 | 用 `main-protection.json` 移除 required checks、required PR；继续 enforce_admins=true | 禁止任何人强推、删除 main；该保护与 owner 的 PR bypass 独立 |
| 标签 Ruleset | 创建 `immutable-tags-ruleset.json` | frontend/v*、backend/v* 禁止更新/删除，无 bypass；允许首次创建 |
| 三个生产 Environment（待授权） | 审批模板为 `production-environment.json`；逐个核对实际 workflow ref 后配置 branch/tag 策略 | 只有所有者审批时必须保持 `prevent_self_review=false`；不能用仅 main 策略误阻断获准的 tag-ref 发布；现有 Secrets 不变 |
| 部署通道（待授权） | Monorepo **保持 `YUANHUB_MONOREPO_DEPLOY_ENABLED=false`**；新通道生产发布和回滚验证前，旧后端 Actions/发布/回滚能力继续保留 | `legacy-backend-actions.json` 只作最终退役提案，不能在代码合入阶段应用；真实启用、生产发布及旧通道停用分别授权 |

GitHub 当前已支持仓库 Ruleset 的单用户 bypass，使用 `actor_type=User`，避免把特权扩散到整个管理员角色。依据：[官方变更说明](https://github.blog/changelog/2026-05-07-repository-rulesets-user-bypass-and-branch-renaming/)、[REST Rules API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)。CODEOWNERS 配合 required code owner review 才能强制所有者审核：[官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)。

## 五阶段顺序与失败恢复

1. **已授权：规则切换。** 保存原 main protection、全部 Rulesets、collaborators、Environment；先创建并验证 active review Ruleset，再移除经典 required PR/checks。Ruleset 创建或验证失败立即停止，不放宽旧保护；后续失败保留基础保护，不自行删除有效 Ruleset。恢复旧 PR/checks 必须使用备份里的可写字段，不能把含只读 URL 的 GET 响应直接 PUT。
2. **已授权：代码合入。** 审查本轮完整 diff、CODEOWNERS 全仓 `* @MrSnake0208` 和本地隔离检查，commit 前确认没有无关改动；远端 main 仍为预期父提交时普通 fast-forward Push。禁止 force push、自动 merge 或 reset。远端变化则停止并报告；Push 后比对远端 SHA/树、CODEOWNERS errors、Ruleset 和 Actions runs。所有者直接 Push 避免过渡 PR 被已取消的自动 `PR merge gate` 卡住。
3. **已授权，执行中：独立集中检查。** 新 YAML 到达 main 后，以准确的新 main SHA 执行 `./release.sh --prepare`，保持生产开关 false。已知 `operatorGrowthOwnership.spec.js:668` 是日期选择器误取展示模式按钮，修复限定 `[data-date]`，保留账号/日期/保存/焦点断言。重新冻结并验证新 SHA；旧成功结果不能证明新候选。Runner、隔离 Mongo/Redis、artifact 和失败阻断须由实际 run 验收；失败不发布。
4. **待授权：生产通道配置和验证。** 核实服务器目标、Secrets/Variables 作用域、兼容顺序、Environment、不可变标签保护后，分别取得启用、正式 tag/发布和回滚演练授权。当前新版发布只接受 main-ref dispatch，因此 `main-deployment-policy.json` 仅适用于这种模式。若保留任何合法 tag-ref 工作流，须显式配置相应 `type=tag` 策略（如 `frontend/v*`、`backend/v*`），同时保留集中 SHA 门禁和人工确认；不能无条件套 main-only。只有所有者审批时不得开启 Prevent self-review。失败保持新通道关闭或按原安全流程恢复，不切换服务器。
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

以下均**未授权、未执行**，只供后续逐项审阅；Environment 策略须先按第 4 步核对，不可整段直接执行：

```bash
gh api --method POST repos/MrSnake0208/YuanHub/rulesets \
  --input docs/release-settings/immutable-tags-ruleset.json
# 仅在第 5 步另经授权且新通道发布/回滚均验证后考虑停用。
gh api --method PUT repos/MrSnake0208/BackEndV3-Share/actions/permissions \
  --input docs/release-settings/legacy-backend-actions.json
# 对 frontend-production、backend-production、production 分别执行，并逐次读取验证。
gh api --method PUT repos/MrSnake0208/YuanHub/environments/frontend-production \
  --input docs/release-settings/production-environment.json
gh api --method POST repos/MrSnake0208/YuanHub/environments/frontend-production/deployment-branch-policies \
  --input docs/release-settings/main-deployment-policy.json
```

单用户 bypass 已通过实际 API 写入和有效分支规则回读验证；Environment 和生产行为尚未验证。若后续平台拒绝保护配置，不扩大 bypass、不解除基础保护，保持部署关闭并报告。主分支和 tag 规则只约束保留规则期间的操作；仓库所有者仍能管理规则本身，这不是对所有者的权限隔离。贡献者 PR 审核配置可从 API 和 CODEOWNERS 识别结果验收，本轮不使用另一个贡献者账号尝试真实写入。
