# 工具页身份与工作区

密探名册、背包库存、星石背包和礼包预算共用暖纸张、宋体茶棕标题、柔和细线与轻量交互语言，按各自任务组织正文。宣传页、内测介绍和反馈页沿用各自布局。

## 页头边界

`src/components/CompactToolHeader.vue` 保留名称，但只承载 `title`、可选一句 `description`、`account` / `actions` / `help` 插槽。取消 `primary` 插槽，不再要求每个页面在右上角放一个主按钮。Tabs、搜索、筛选、统计、核心操作和状态提示由页面组织。

标题为 28–32px 宋体、茶棕、高字重，不使用 Hero。内容容器不足 860px 时，标题和 Utility 同行，账号独立下一行；宽容器为标题、账号和 Utility 同行。768px 保持稳定两层，不逐个控件换行。

`DataAccountContextBar` 的 compact 模式使用轻奶油底色与截断名称。登录后账号入口展开共享 `AccountSwitcher`，直接切换现有 `activeAccount` 并留在当前路由；非 compact 账号条也复用相同选择逻辑。未登录仍使用原登录 redirect，错误与数据归属保持可见，完整名称保留在 title / aria-label。账号、帮助、更多保留 44px 命中区域，视觉不必形成 44px 高的实体按钮。

帮助默认收起；更多用于数据交换、低频设置与方案保存。更多操作选中后收起，并先把焦点还给触发入口，供原弹窗恢复焦点。

## 各页工作区

- **密探名册**：身份与账号 → 图鉴/招募轻统计 → 图鉴、养成总览、养成规划 → 搜索与录入 → 招募状态与更多筛选 → 原密探内容。桌面搜索和录入同行；手机搜索独立一行，录入与更多筛选同行，招募状态下一行。高级条件关闭后保留，「更多筛选 · N」继续统计原高级条件。养成总览也在筛选工作区保留录入入口。卡片数据、编辑与养成逻辑不变。
- **背包库存**：完整盘点时间与「更新库存」放在同一新鲜度区域，原录入工作台及全部校验不变；库存清单、统计报告、操作历史仍为 View。目录统计进入更多，避免重复 KPI。首次盘点只在无基准且无条目时出现；已建立的全零基准属于有效库存。编辑中隐藏首次引导，避免重复入口。
- **星石背包**：背包数量、计划与「✓ 已同步」为 metadata；「背包与核对」「养成计划」是 View，「导入截图」为正文 Action。导入后显示截图识别阶段与可展开说明。养成计划只改变嵌入工作区的可见区域，仍使用原 `review` 页签；`import` / `review` 的持久化契约、OCR、同步、采集恢复、快照与数据模型不变。低频条件及背包设置通过更多筛选展开，保存反馈、差异警告、同步失败和重试保持可见。
- **礼包预算**：版本与币种为 Context，汇率为可修改的轻量信息；搜索、分类、排序直接接礼包。我的方案作为 Utility，保存仍在更多。桌面保留右侧清单，≤1180px 继续使用原总价栏和清单抽屉。版本切换、已选条目、价格与清单计算不变。
- **招募档案**：复用同一工具页头，宽容器内账号位于标题右侧，手机账号独立下一行；备份入口在页头，面板在正文顶部展开。保留切换前的草稿确认、保存期间禁用，以及原时间线、卡池编辑和备份恢复流程。

## 状态驱动引导

三个数据工具复用简单的 `ToolTaskPrompt`（标题、说明、错误语义、操作插槽），不引入新的业务状态模型。

密探未登录显示登录入口，无账号显示创建/选择入口，读取中显示加载，读取失败显示原重试；无档案显示「开始录入密探」、快速补录和单角色入口。首次状态先展示下一步，可主动浏览图鉴；筛选无结果直接提供清除筛选，调用原重置与聚焦方法。

库存首次使用显示「开始首次盘点」，可先浏览目录再进入原报告与历史。登录、账号和读取失败分别显示对应下一步，禁用或隐藏的编辑入口不能绕过原操作守卫。星石空背包直接引导导入并说明本机识别，可查看截图说明或手动核对/恢复快照；仅收起空表和无任务占位，不隐藏嵌入警告、实际 OCR 复核、弹窗与错误反馈。

手机空态使用独立主 CTA，下方为文字次入口；正文避免 Card 包 Tabs、Card 包搜索等重复容器。

## 验证边界

本轮为 L2 展示状态与响应式改动；未改 API、权限、归属、计算、OCR 或持久化。已有开发服务通过 `./dev.sh` 管理，本轮直接复用。

Agent 使用 Playwright CLI 的隔离合成组件预览检查状态与布局，并阻止真实业务 API 写入。覆盖 320 / 390 / 430 / 768 / 1024 / 1440px，账房另含 1180px；检查正常/空态、密探登录/账号/错误/筛选无结果、星石同步成功/失败、长账号、帮助、更多、Tabs、筛选、原编辑入口、清单、版本与汇率。这个结果不代表真实登录账号端到端验证。

受影响的最小回归命令（在 `YuanHub` 目录执行）：

```sh
npm run test:behavior -- behavior/compactToolHeader.spec.js behavior/operatorEntryDefaults.spec.js behavior/inventoryStockBaseline.spec.js behavior/starRecoveryUx.spec.js
```

真实账号另在 390 / 768 / 1440px 补验账号管理、录入、星石导入和同步；账房在 1180 / 1440px 补验清单与方案。无需默认运行完整 CI 或无关后端检查。

## 游戏账号切换（2026-10-05）

`DataAccountContextBar` 展示上下文并接入 `AccountSwitcher`；`GameAccountManager` 共用一组 CRUD，在个人中心以 page 呈现，在工作区以 dialog 呈现。Switcher 按游戏分组，整行选择；当前项显示勾选和“当前”。超过 8 个账号才出现搜索，不建立最近使用存储。底部的新建和管理原地打开 Manager，不导航、不重置 View/Tab/筛选。Switcher 本身不暴露删除/改名；Manager 内部切换列表、新建、编辑、编号和更多视图，只有危险删除与真实 dirty 放弃使用统一确认。底部「账号与连接码 →」才进入 `/user/profile#game-accounts`。

768px 及以上使用入口旁的轻浮层；更窄时使用底部 Sheet，列表独立滚动、44px 行命中区域、Safe Area 和 VisualViewport 软键盘避让。复用 `useModalFocus` 处理焦点、Tab、Escape 和关闭后的恢复；打开期间的断点变化关闭浮层并清理监听与滚动锁。

选择前，页面通过 `beforeSwitch` 检查真实草稿，使用已有草稿确认或针对当前草稿的放弃提示。重要保存、盘点未确认结果、奖励入账锁定、招募写入期间禁用选择，显示原因。确认返回后再核对上下文代次/用户/目标账号，过期确认不改变全局状态；不提示“切换成功”。

密探同步清空主数据、编辑器/卡片/导入预览，并自动读取新账号；读请求及导入/导出结果以账号代次失效，文件读取也绑定上下文；切换后不下载旧导出或弹出旧错误。库存沿用同步清空与读请求保护，复用盘点草稿检查及奖励工作台锁；招募沿用 composable 的同步 reset/请求失效，关闭编辑器/备份并保护其草稿。快捷录入复用现有草稿确认；今日一览同步清空账号摘要再读取。星石沿用最新串行同步与本地草稿 flush，准备期间隐藏旧嵌入数据及数量；OCR 进行中仍由嵌入层拒绝切换、保留原账号与解释。不修改生成的嵌入产物、账号模型、持久化或权限。

本次风险为 L3（共享账号上下文与异步隔离）。Agent 仅执行受影响 SFC 的编译与 diff 自检，行为回归和真实浏览器几何由用户/CI 执行：

```sh
npm run test:behavior -- behavior/accountSwitcher.spec.js behavior/activeAccount.spec.js behavior/compactToolHeader.spec.js behavior/operatorOddityCompletion.spec.js behavior/inventoryStockBaseline.spec.js behavior/rewardEntryWorkspace.spec.js behavior/starRecoveryUx.spec.js behavior/recruitmentPage.spec.js behavior/recruitmentExchange.spec.js behavior/operatorQuickFlow.spec.js behavior/todayActivitySummary.spec.js
```

浏览器补验 320 / 390 / 430 / 768 / 1024 / 1440px 与 767/768px 临界；手机横屏、Safe Area、搜索键盘、长名称、焦点/Escape/恢复、真实账号 A→B→A、OCR 拒绝及数据写入期间切换。静态编译或 jsdom 不证明这些浏览器结果。


### 原地账号管理（2026-10-06）

创建沿用自动设为当前账号的规则，但先经过当前 Workspace 的 `beforeSwitch` 与保存锁；当前账号所属游戏变更和当前账号删除同样检查草稿。确认期间 Context/身份变化时不发送写请求；创建请求期间 Context 变化时接收同用户结果，不抢占后来选择。修改游戏仍是原子 PATCH，后端订阅历史/实质招募档案限制保持。

CRUD 使用身份绑定的 `accountList` 通知同步当前 Workspace 列表，发布列表先于切换当前账号。`listAccounts` 对 CRUD 前的在途 GET 返回最新快照，防止被删账号复活或丢掉新账号；通知不替代加载器，也不长期缓存 GET。删除使用返回时的有效当前选择，否则首个剩余账号或空。列表没有 dirty 退出提示；新建/编辑真实 dirty 时才确认。

原地 Manager 在 Desktop/Tablet 为 520px 上限居中 Dialog，Mobile 为动态视口 Bottom Sheet；内部视图不堆叠 CRUD 弹窗，复用焦点栈、滚动锁、safe-area、16px 输入及 44px 操作。Profile 继续承担 MaaYuan、连接码、应用授权和数据访问范围。

最小新增回归：`npm run test:behavior -- behavior/accountSwitcher.spec.js behavior/gameAccountManager.spec.js behavior/accountListUpdates.spec.js behavior/compactToolHeader.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/todayComingSoon.spec.js behavior/profileConnectionsUx.spec.js behavior/starRecoveryUx.spec.js`。真实账号 CRUD、手机软键盘与各 Workspace 数据刷新由用户/CI 补验；无需全量 CI。

账号 API 契约与星石导出副本：`node --test test/contract.test.js test/starArchiveExport.test.js`。本轮已用隔离合成组件预览验证六个宽度、原地 CRUD、焦点/草稿和模拟 VisualViewport 缩小；该预览阻止真实业务 API，不能替代真实账号与手机验收。
