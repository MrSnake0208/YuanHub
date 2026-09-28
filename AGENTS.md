# AGENTS.md — MaaYuan Share（YuanHub）

本仓库是 **MaaYuan Share 作业分享站**（Vue 3 + Vite + vue-router 4）的复刻/自建实现。

本仓库必须能够在被单独 clone 后独立开发，因此所有开发必需规范均以仓库内文件为准，不依赖父目录或外部工作区文件。

## 权威规范

按**本次改动实际涉及的范围**读取规范，不要为了一个小改动把所有文档都加载一遍：

1. 涉及 UI/视觉/组件：读取前端设计规范 `docs/standards/design-system.md`。
2. 涉及布局、响应式、移动端/桌面端呈现：读取 `docs/standards/responsive-development.md`。
3. 只有新增页面、路由或页面级结构时，读取 `docs/standards/page-development.md`。
4. 只有功能延后开放、灰度/开关控制时，读取 `docs/standards/feature-flags.md`。

以上规范是对应领域的唯一权威来源。`AGENTS.md` 只保留必须首先看到的硬约束摘要；不要为无关任务加载无关规范。

## 测试与验证：风险分级，不做无差别全量检查

测试要求与**行为变化**绑定，不与“文件发生修改”绑定。先判断风险，再选择最小充分验证：

| 等级 | 前端典型改动 | 默认处理 |
| --- | --- | --- |
| **L0** | 文案、注释、纯 CSS/视觉、静态资源、不会改变交互的布局微调 | 检查 diff 和相关文件；不要求测试、build、全量静态检查 |
| **L1** | 单组件展示/局部交互，不涉及共享状态/API | 只建议直接相关的静态或定向测试 |
| **L2** | store/composable、API、数据转换、权限、缓存/轮询、业务分支 | 同步更新相关测试；建议用户运行受影响测试与必要静态检查 |
| **L3** | 路由、登录、全局状态、跨页面共享逻辑、关键数据持久化 | 模块级/仓库级相关检查，可使用工作区 `./test smart` |
| **L4** | Vite/依赖/CI/测试基础设施/发布流程 | 才执行完整 CI 等价检查或 `./test all` |

### 测试代码

- 新增或改变用户可观察行为、业务逻辑、状态管理、API 请求/响应、校验、权限、缓存/轮询、异步竞态或错误处理时，如果现有测试不能覆盖新行为，必须同步新增/更新测试。
- Bug 修复原则上补能复现该 Bug 的回归测试。
- 纯文案、纯 CSS/视觉、静态资源、格式化或确定不改变外部行为的重构，默认不新增行为测试。
- 不得为了通过 CI 删除有效测试、弱化关键断言、增加无理由的 skip/disable，或恢复已经废弃的产品行为。

### 谁来执行验证

YuanHub-All 工作区默认由**用户/CI 执行回归与全量验证**。Agent 负责把需要的测试代码补齐，并在最终汇报中列出最小必要命令；除非当前任务明确要求 Agent 代跑，否则不要自动执行完整测试套件。

当前仓库的 CI 等价命令仍是：

```bash
npm run test:static
npm run test:repo
npm run test:behavior
npm run build
```

它们是 CI/发布对齐工具，不是每次前端修改都必须本地依次执行的固定流程。L0/L1 任务也无需为了确认这一点先通读完整 `.github/workflows/ci.yml`。

## UI/UX Skills 与用户视角审查（硬约束）

前端界面相关任务必须使用 `ui-ux-pro-max`；其它 UX Skills 按改动风险触发，避免小改动也启动完整审计流程。

- **`ui-ux-pro-max`：所有 UI 工作的基础门禁。** 新增、修改、Review 页面/组件/样式/响应式布局/交互/可访问性前，必须先读取并应用该 Skill；实现阶段仍以本仓库 `docs/standards/` 下的设计与响应式规范为最高项目约束。
- **`usability-audit`：结构性 UX 改动才触发。** 当任务明确要求完整 UX Review，或改动导航/信息架构、多步骤流程、危险操作、跨页面账号上下文、关键表单/弹窗流程等 L2/L3 体验结构时使用。纯文案、颜色、间距、局部样式和已有交互的小修不需要额外跑完整 usability audit。
- **`audit-cuj`：核心旅程变化才触发。** 当改动实际改变已存在于 `.ux/cujs/` 的核心流程，或用户明确要求回放关键旅程时使用；不因普通组件样式变化自动触发。
- **证据优先。** 有已经运行且获准访问的开发页面时，UX 审查优先使用 live/hybrid 证据；否则可以 static，但所有运行时判断必须标记为未验证。不得为了审查擅自启动、重启或停止开发服务，仍遵守本仓库既有服务管理约束。
- **审计产物隔离。** `usability-audit` / `audit-cuj` 的报告与截图只能写入 `.ux/audits/`；其中可能包含登录后页面截图，不得提交到 Git。

## 关键硬约束

- 页面统一放在 `src/pages/<模块>/` 下，新页面必须在 `src/router/routes.js` 注册。
- `src/router/index.js` 只负责创建路由实例并导入 `routes`，不要另建第二套路由注册体系。
- 新增页面、组件或视觉样式前必须读取 `docs/standards/design-system.md` 与 `docs/standards/responsive-development.md`。
- 任何 UI 改动都必须考虑手机、平板与桌面的影响；不得新增明显的跨视口退化。
- **完整 320 / 390 / 430 / 768 / 1024 / 1440px 矩阵只用于新页面、导航/页面结构、关键响应式行为等高风险 UI 改动。** 文案、颜色、间距等 L0 改动不要求完整矩阵；局部组件布局按 `responsive-development.md` 的风险分级检查受影响视口。
- 禁止使用纯黑、黑底黄字、荧光黄大标题块，以及大面积 `brand-blue` 填充。
- 标题体系使用设计规范指定的宋体方向；正文保持项目既有中文无衬线字体体系；数字按规范使用 Archivo。
- 页面必须保留 MaaYuan 的暖色纸张背景体系和 `/maayuan/maayuan-pattern.webp` 吉祥物背景，不得在无明确设计变更要求时移除。
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
- [ ] 仅当改动属于结构性 UX / L2-L3 流程变化或明确要求完整 UX Review 时，才执行 `usability-audit`
- [ ] 仅当实际改变已有 `.ux/cujs/` 核心旅程时，才执行 `audit-cuj`
- [ ] 已按风险选择响应式检查范围；L0/L1 未被无理由升级为完整视口矩阵
- [ ] 涉及页面新增或路由调整时已读取 `docs/standards/page-development.md`
- [ ] 新页面位于 `src/pages/<模块>/` 并注册到 `src/router/routes.js`
- [ ] 未引入第二套设计规范或重复路由体系
- [ ] 未违反纯黑 / 黑底黄字 / 大面积蓝色等设计禁令
- [ ] 背景与吉祥物资源仍来自本仓库 `public/`
- [ ] 没有新增指向父目录、个人绝对路径或其他本地工作区的开发依赖
- [ ] 行为变化已同步新增/更新必要测试；非行为修改没有为了过门禁创造无意义测试
- [ ] 最终汇报列出了用户应执行的**最小必要验证**，未无差别复制完整 CI
- [ ] 未声称用户尚未执行的验证已经通过


## Local risk-based verification gate (2026-09-28)

When this repository is edited inside YuanHub-All, follow root `TESTING.md` and only the frontend quality guideline. Trellis tasks should record `risk_level` and `verification_owner`.

- `verification_owner=user`: do not require a local `quick/smart/all` report before finish/archive; keep tests/exceptions honest and report pending commands to the user.
- `verification_owner=agent`: execute the checks justified by the task risk; L3 normally uses `smart`, L4 may use `all`.
- L0/L1 non-behavior edits may use an exact-file test-plan exception instead of adding artificial tests.

Preserve unrelated dirty files; never reset, stash, clean, or include them merely to make a gate pass.
