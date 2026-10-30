# AGENTS.md — MaaYuan Share（YuanHub）

本仓库是 **MaaYuan Share 作业分享站**（Vue 3 + Vite + vue-router 4）的复刻/自建实现。

本仓库必须能够在被单独 clone 后独立开发，因此所有开发必需规范均以仓库内文件为准，不依赖父目录或外部工作区文件。

## 权威规范

按**本次改动实际涉及的范围**读取规范，不要为了一个小改动把所有文档都加载一遍：

1. 涉及 UI/视觉/组件：读取前端设计规范 `docs/standards/design-system.md`。
2. 涉及布局、响应式、移动端/桌面端呈现：读取 `docs/standards/responsive-development.md`。
3. 涉及页面、表单、交互、提示文案或样式：按范围读取 `docs/standards/page-development.md` 的玩家体验章节；仅新增页面或路由时读取其中的目录与注册说明。
4. 只有功能延后开放、灰度/开关控制时，读取 `docs/standards/feature-flags.md`。

以上规范是对应领域的唯一权威来源。`AGENTS.md` 只保留必须首先看到的硬约束摘要；不要为无关任务加载无关规范。

## 玩家体验底线

- 先明确使用者与主任务。新页面、功能扩展或流程变化先按 `docs/standards/page-development.md` 第 6 节写简短交互说明，目标明确后直接实施；小文案或局部样式不写长方案，不新增固定审批环节。
- 字段按必要输入、可靠默认、长期配置、情境设置和内部字段分层；配置不代表真实行为已发生，未知不得当零。
- 保留业务能力和完整有效信息，允许在任务范围内替换旧表单；辅助录入、管理和历史不得挤走页面主体。
- **功能扩展默认增量设计，不顺手重做页面。** 一批需求先按玩家任务归类，再说明功能归属、既有任务的保护边界与界面净变化；不得逐项堆常驻卡片，也不得把一切藏进“更多”。按页面规范第 11 节区分功能实现与体验验收，保护原有常用路径。
- 默认、展开、零数据、加载和失败按需覆盖。真实页面由用户手动验收，构建不能替代；遵守下文 Skill、风险分级与浏览器授权约束。

## UI 设计自由度（视觉建议不等于全站强制模板）

- **用户在当前任务提供的具体设计稿、效果图和视觉提示词优先决定该区域的外观。** `design-system.md` 记录默认品牌方向与现有实现，不要求每个页面使用同一套卡片、Tab、按钮、页头、字号、配色、圆角、间距或信息密度；没有新设计要求时保留该模块现有风格。
- **取消全站 44×44px 最小点击目标及固定控件尺寸门禁。** 不因遵守统一像素值而机械放大按钮、筛选标签和图标，或制造多余空白。按页面密度、输入方式和误触风险选择尺寸；仍须保证可识别、可操作及适用的网页无障碍要求。
- 允许不同页面采用不同视觉方案，复用业务逻辑、数据、权限、路由和必要交互语义，不必为了外观统一抽取共享组件或批量调整已验收页面。明确的设计要求可覆盖非功能性视觉默认项，但不得破坏键盘/焦点可达性、错误提示、跨视口核心操作及安全边界。

## 测试与验证：风险分级，不做无差别全量检查

测试要求由**具体回归风险**决定，不因“文件发生修改”“行为变化”或“修复 Bug”自动强制补测、跑测。先判断风险，再选择最小充分验证；独立 clone 时同样适用以下策略：

| 等级 | 前端典型改动 | 默认处理 |
| --- | --- | --- |
| **L0** | 文案、注释、纯 CSS/视觉、静态资源、不会改变交互的布局微调 | 检查 diff 和相关文件；不要求测试、build、全量静态检查 |
| **L1** | 单组件展示/局部交互，不涉及共享状态/API | 默认检查 diff 与相关文件；有具体风险时才做定向检查，不默认补测、跑测或 build |
| **L2** | store/composable、API 请求、数据转换、缓存/轮询、一般业务分支 | 按具体风险选择最小定向检查；权限、跨账号或数据损坏风险上调至 L3 |
| **L3** | API 契约、登录鉴权/权限、账号隔离、路由/全局状态、持久化/迁移、事务/并发、共享核心 | 必须取得受影响关键约束的可复核定向证据；不默认全量检查 |
| **L4** | Vite/依赖/CI/测试基础设施/发布流程 | 按影响考虑完整 CI 等价检查或工作区 `./test all`，不机械运行无关检查 |

### 测试代码

- L0/L1 默认只做相关文件/diff 自检；L2 仅为明确的回归风险选择定向检查，不为覆盖率或流程门禁创造测试。
- 优先复用能覆盖风险的现有测试；需要时再新增/更新。合理行为变化使已有断言过时时，调整为新的正确预期，不恢复废弃行为迎合测试。
- L3/L4 的鉴权、账号隔离、数据正确性、持久化、迁移、事务等关键约束必须取得必要的定向证据；不能以交给用户、DSH 或 CI 为由放弃开发期安全检查。验证不足时明确剩余风险。
- 不得为了通过 CI 删除有效测试、弱化关键断言、增加无理由的 skip/disable，或破坏现有测试发现范围。

### 谁来执行验证

默认由**用户、用户另行安排的 DSH 或 CI 执行常规回归与全量验证**。Agent 负责实现、diff 自检及本次风险确实需要的最小开发期验证，不自动启动独立测试 Agent。只在仍有必要的待验收事项时给出简短路径或命令，不因小修改列出整套 CI；低风险任务不以等待 DSH 为完成门槛。

当前仓库发布 CI 的快速检查命令是：

```bash
npm run test:static
npm run test:repo
npm run build
```

完整回归使用 `npm run test:all`（包含 `npm run test:behavior`），由独立 `regression.yml` 每日或手动运行，不阻塞发布。以上命令是 CI/发布对齐工具，不是每次前端修改都必须本地依次执行的固定流程。L0/L1 任务也无需为了确认这一点先通读完整 `.github/workflows/ci.yml`。

## 浏览器自动化默认禁用（UI 由用户验收）

- 当前任务未获用户明确授权时，**不运行 Playwright、Chrome DevTools、Puppeteer、Cypress、真实浏览器 E2E、自动页面截图/视觉 diff、自动登录或 320–1440px 浏览器视口矩阵**；不启动浏览器、不安装/修复浏览器测试依赖，也不以 UX 审查为由访问运行中的页面。仓库规范中的浏览器命令及完整视口矩阵仅作为用户人工验收或明确授权后的专项回归参考。
- 仍须遵守 `ui-ux-pro-max`、设计规范与响应式约束；按上文具体风险选择代码自检或必要的非浏览器单元/组件/契约检查，不因行为变化一律补测。关键安全验证不得省略，不得移除已有 E2E 或弱化 CI。
- 最终按改动风险向用户给出对应的桌面端/手机端人工验收路径、动作、预期与建议视口，注明真实视觉、触控、运行时交互尚未由 Agent 验证；集中回归也不隐含浏览器自动化授权。

## YuanHub-All 临时 Rapid Mode

当本仓库位于 YuanHub-All 工作区内，且父工作区 `.trellis/config.yaml` 配置为 `codex.dispatch_mode: inline` 时，启用临时快速清 backlog 规则：

- L0/L1 默认由主 Agent 直接实现并做 diff/相关文件自检，不为小改动自动运行完整测试、build、全量静态检查，也不创建无意义测试。
- 范围明确且局部的 L2 只做 targeted check；回归/全量验证继续默认交给用户/CI。
- 不为 L0/L1 自动启动额外的完整 UX 审计、`trellis-check`、全视口矩阵或逐任务 commit；已有 UI 硬约束 `ui-ux-pro-max` 仍必须遵守。
- L3/L4、登录/权限、跨页面共享状态、持久化、关键 API/路由、Vite/依赖/CI/发布不适用减负，继续走现有高风险验证规则。
- 独立 clone 本仓库、或父工作区恢复 `codex.dispatch_mode: auto` 时，本节不生效。

## UI/UX Skills 与用户视角审查（硬约束）

前端界面相关任务必须使用 `ui-ux-pro-max`；其它 UX Skills 按改动风险触发，避免小改动也启动完整审计流程。

- **`ui-ux-pro-max`：所有 UI 工作的基础门禁。** 新增、修改、Review 页面/组件/样式/响应式布局/交互/可访问性前，必须先读取并应用该 Skill；实现阶段遵守项目的功能、响应式和可访问性底线；具体视觉优先服从本次明确设计要求，设计规范中的默认外观不构成全站统一样式门禁。
- **`usability-audit`：结构性 UX 改动才触发。** 当任务明确要求完整 UX Review，或改动导航/信息架构、多步骤流程、危险操作、跨页面账号上下文、关键表单/弹窗流程等 L2/L3 体验结构时使用。纯文案、颜色、间距、局部样式和已有交互的小修不需要额外跑完整 usability audit。
- **`audit-cuj`：核心旅程变化才触发。** 当改动实际改变已存在于 `.ux/cujs/` 的核心流程，或用户明确要求回放关键旅程时使用；不因普通组件样式变化自动触发。
- **证据优先。** UX 审查默认使用静态源码与组件证据；只有当前任务获用户明确授权浏览器自动化或实时页面访问时，才使用 live/hybrid 证据。静态审查不能证明真实浏览器像素、触控或运行时交互，必须标记这些事项为未验证。不得为了审查擅自启动、重启或停止开发服务，仍遵守本仓库既有服务管理约束。
- **审计产物隔离。** `usability-audit` / `audit-cuj` 的报告与截图只能写入 `.ux/audits/`；其中可能包含登录后页面截图，不得提交到 Git。

## 关键硬约束

- 页面统一放在 `src/pages/<模块>/` 下，新页面必须在 `src/router/routes.js` 注册。
- `src/router/index.js` 只负责创建路由实例并导入 `routes`，不要另建第二套路由注册体系。
- 新增页面、组件或视觉样式前必须读取 `docs/standards/design-system.md` 与 `docs/standards/responsive-development.md`。
- 任何 UI 改动都必须考虑手机、平板与桌面的影响；不得新增明显的跨视口退化。
- **完整 320 / 390 / 430 / 768 / 1024 / 1440px 矩阵只用于新页面、导航/页面结构、关键响应式行为等高风险 UI 改动。** 文案、颜色、间距等 L0 改动不要求完整矩阵；局部组件布局按 `responsive-development.md` 的风险分级检查受影响视口。
- 暖纸张配色、宋体标题、Archivo 数字、吉祥物背景等是当前品牌默认表现，不是每个页面的强制视觉模板；独立的页面设计可按明确要求调整配色、字体和背景，未涉及的共享站点壳层保持现状。
- 不以历史的配色禁令、固定字号、统一卡片/按钮样式或点击尺寸否定具体设计；但需保证文本可读、交互状态可辨认、焦点可见，且不得无授权批量改造其他页面。
- 运行时资源必须来自本仓库 `public/`，不要依赖仓库外的图片、原型目录或绝对路径。
- 延后开放的前端功能必须注册到 `src/config/features.js`，生产构建默认关闭，并通过 `FEATURE_KEYS` 与 `isFeatureEnabled` 接入。
- 该功能开关是构建时的前端展示控制，不是认证或安全边界；后端限制必须单独实现。

## 设计资源约定

运行时资源以本仓库以下目录为准：

- 吉祥物 / 共建方图标：`public/icons/`
- MaaYuan 背景图：`public/maayuan/maayuan-pattern.webp`

历史原型名称（如 `index.html`、`detail.html`）可能仍出现在 README、注释或数据说明中，它们只表示设计来源，不代表运行时依赖。

## 改动前按需自查

以下条目是**触发式检查**，不是每次修改都要逐项执行的固定 checklist。只检查与本次风险和改动范围有关的项。

- [ ] 已读取 `docs/standards/design-system.md`
- [ ] 涉及任何 UI 改动时已读取 `docs/standards/responsive-development.md`
- [ ] 涉及任何 UI 改动或 UI Review 时已读取并应用 `ui-ux-pro-max`
- [ ] 已按范围读取 `docs/standards/page-development.md`；新页面、功能扩展或流程变化有简短说明，扩展包含功能归属、页面保护与界面净变化
- [ ] 仅当改动属于结构性 UX / L2-L3 流程变化或明确要求完整 UX Review 时，才执行 `usability-audit`
- [ ] 仅当实际改变已有 `.ux/cujs/` 核心旅程时，才执行 `audit-cuj`
- [ ] 已按风险选择响应式检查范围；L0/L1 未被无理由升级为完整视口矩阵
- [ ] 涉及页面新增或路由调整时已读取 `page-development.md` 的目录与注册说明
- [ ] 新页面位于 `src/pages/<模块>/` 并注册到 `src/router/routes.js`
- [ ] 未引入重复路由体系；局部视觉差异化不被误判为违反全站统一模板
- [ ] 遵循本次明确设计方案，没有为统一按钮尺寸、配色或组件外观牺牲信息密度与可用性
- [ ] 背景与吉祥物资源仍来自本仓库 `public/`
- [ ] 没有新增指向父目录、个人绝对路径或其他本地工作区的开发依赖
- [ ] 验证按具体风险选择；没有因小改动自动补测、跑全量，关键安全/契约/隔离约束有必要证据
- [ ] 最终汇报列出了用户应执行的**最小必要验证**，未无差别复制完整 CI
- [ ] 功能扩展同时交代新能力和受影响旧任务的检查情况；功能实现与体验验收分开，未把代码检查或用户待验收事项写成视觉通过


## Local risk-based verification gate (2026-09-28)

When this repository is edited inside YuanHub-All, follow root `TESTING.md` and only the frontend quality guideline. Trellis tasks should record `risk_level` and `verification_owner`.

- `verification_owner=user`: do not require a local `quick/smart/all` report before finish/archive; keep tests/exceptions honest and report pending commands to the user.
- `verification_owner=agent`: execute only risk-justified checks; L3 requires focused evidence for affected critical invariants, not a default full suite; L4 may use `all` when warranted.
- For an existing Trellis task, record honest exact-file risk-based exceptions where checks are unnecessary; do not create a task or artificial tests merely because a local L0/L1 edit changes behavior.

Preserve unrelated dirty files; never reset, stash, clean, or include them merely to make a gate pass.
