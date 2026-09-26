# AGENTS.md — MaaYuan Share（YuanHub）

本仓库是 **MaaYuan Share 作业分享站**（Vue 3 + Vite + vue-router 4）的复刻/自建实现。

本仓库必须能够在被单独 clone 后独立开发，因此所有开发必需规范均以仓库内文件为准，不依赖父目录或外部工作区文件。

## 权威规范

任何新增或修改页面、组件、样式、配色、视觉元素前，必须先读取并遵守：

1. 前端设计规范：`docs/standards/design-system.md`
2. 页面开发流程：`docs/standards/page-development.md`
3. 功能开关发布规则：`docs/standards/feature-flags.md`

以上规范是详细规则的唯一权威来源。`AGENTS.md` 只保留必须首先看到的硬约束摘要；详细色板、字体、组件、页面流程与功能开关规则不要在这里重复维护。

## 测试与 CI 完成门禁（硬约束）

**前端功能代码 + 对应测试 + CI 对齐检查才算一次完整修改。** Agent 不得先改功能、把测试留到 CI 报错后再补。

### 修改前

- 先读取当前 `.github/workflows/ci.yml`，不得凭记忆假设 CI 会跑什么。
- 查找与受影响页面、组件、store、API、工具函数或业务规则相关的现有测试，并在修改实现前确定测试怎么跟着变。

### 必须同步补测试的修改

- 新增功能或改变用户可观察行为。
- 修改业务逻辑、状态管理、API 请求/响应、数据转换、校验、权限、条件判断、缓存、轮询、异步竞态或错误处理。
- 修复 Bug：原则上必须增加能复现该 Bug 的回归测试；默认先看到失败，再修到通过。
- 修改已有测试覆盖的行为：实现和测试必须在同一任务中同步更新。

纯文案、纯 CSS/视觉调整、静态资源替换、格式化或不改变外部行为的重构通常无需新增行为测试；但不得因此留下失效的已有测试。

### 禁止事项

- 不得为了通过 CI 删除有效测试、弱化关键断言、添加无理由的 `skip` / `disable`、缩小测试发现范围。
- 不得为了让旧测试变绿而恢复已经被新需求替代的产品行为。
- 不得在已知本次修改会导致 CI 失败时宣称“完成”、提交发布或直接推送。

### 前端 CI 等价本地门禁

当前 GitHub CI 的仓库级检查顺序为：

```bash
npm run test:static
npm run test:repo
npm run test:behavior
npm run build
```

在 YuanHub-All 工作区内还要遵守根目录 `TESTING.md` 与 Trellis 测试门禁；涉及任务上下文时按要求运行 `./test quick`、`./test smart --task ...`，共享测试基础设施或发布相关修改再运行 `./test all`。

如果当前任务明确由用户执行回归测试，Agent 可以不运行回归套件，但仍必须把需要的测试代码补齐，并在最终汇报中明确写“代码与测试已补，验证待用户执行”，同时列出上面的准确命令；不得声称 CI 已验证通过。

## 关键硬约束

- 页面统一放在 `src/pages/<模块>/` 下，新页面必须在 `src/router/routes.js` 注册。
- `src/router/index.js` 只负责创建路由实例并导入 `routes`，不要另建第二套路由注册体系。
- 新增页面、组件或视觉样式前必须读取 `docs/standards/design-system.md`。
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

## 改动前自查

- [ ] 已读取 `docs/standards/design-system.md`
- [ ] 涉及页面新增或路由调整时已读取 `docs/standards/page-development.md`
- [ ] 新页面位于 `src/pages/<模块>/` 并注册到 `src/router/routes.js`
- [ ] 未引入第二套设计规范或重复路由体系
- [ ] 未违反纯黑 / 黑底黄字 / 大面积蓝色等设计禁令
- [ ] 背景与吉祥物资源仍来自本仓库 `public/`
- [ ] 没有新增指向父目录、个人绝对路径或其他本地工作区的开发依赖
- [ ] 所有行为变化都已同步新增/更新对应测试；若没有新增测试，已确认本次改动属于非行为修改
- [ ] 已按当前 `.github/workflows/ci.yml` 核对需要运行的检查
- [ ] 若用户接管验证，最终汇报中已列出待执行的 CI 等价命令且未声称验证通过


## Local code-level test completion gate (2026-09-22)

Before implementing a feature or bug fix, read `TESTING.md` at the YuanHub-All root and both `.trellis/spec/*/quality-guidelines.md`. Keep the active task's `test-plan.json` mapping changed sources to changed tests and business invariants. Bug fixes require a regression test and, unless the current task explicitly delegates regression execution to the user, actual red→green logs; do not only check source strings. New Trellis tasks automatically receive these guidelines in implement/check contexts and a test-plan scaffold. The scaffold itself is not coverage.

Run root `./test quick` after edits and `./test smart --task .trellis/tasks/<task>` before completion; shared test infrastructure/release changes also require `./test all`. Mongo transaction/Redis semantics tests must use owned disposable containers, never existing development or production services. No unexplained missing tests, failed/skipped suites or stale results may be declared done. Actual Trellis `finish`/`archive` commands enforce fresh evidence before changing task state. Do not bypass this gate by directly changing task status or manufacturing reports. Preserve unrelated dirty files; explain them by exact path rather than resetting or including them in a commit.
