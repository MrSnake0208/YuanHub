# 04：双视图试点复盘与 Phase 2 建议

> 2026-10-14 后续状态：本文件的暂停扩面/等待确认等阶段范围已由 [方案 B 全站分层决策](pc-mobile-layered-architecture.md) 及用户 Goal 授权替代；历史证据保持原样。当前执行见 [迁移进度](pc-mobile-migration-progress.md)。

结论：**Adjust——保留库存历史试点，暂停扩面。** 业务单源、展示择一挂载已有源码和历史合成测试证据；尚不能证明移动端回归与维护成本实际下降。先确认本文 A1/A2 的最小修正任务，再决定是否开始一个后续模块。本次不修源码、不创建后续 task、不调整路由、不提交。

本轮交付风险 **L0：文档与静态审查，无行为变化**，`verification_owner=user`。候选实施风险单独标注，不把文档审查升级为全量测试任务。本文是 [01 ADR](responsive-view-boundaries-adr-20261013.md) 的复盘及任务建议；[responsive-development.md](../standards/responsive-development.md) 仍是唯一响应式规范，本文不晋升为新标准。

## 1. 审查基线、计划与证据边界

执行顺序：确认双仓 Git/worktree 与规范 → 读 02/03 及本地产物 → 追踪视图/父层/测试/CI → 分级候选 → 仅补复盘及 ADR 证据索引 → 检查精确 diff、链接和已有改动保护。

| 范围 | 2026-10-13 本轮观察 | 限制 |
| --- | --- | --- |
| 根仓库 | `master@cd1d4a29af258ca3ccd414db34f8bf5159ae3c59`；AGENTS、Trellis、测试/发布等已有大量 dirty 文件 | 没有修改根文件、任务状态或 journal；rapid inline 文档交付不新建 task |
| 前端 | 独立仓库 `YuanHub/`，`main@56a6666356ded6548424b9f49dd932f310a1df9b` | 审查 HEAD 加当前未提交的 03；HEAD 本身尚无双视图，不能把试点称为已提交/已上线 |
| 前端原有 dirty | 4 个 tracked 修改：历史测试、ADR、inventory 父页、浏览器脚本；7 个 untracked：视图测试、03 文档、3 个 View、展示 JS/CSS | 原 11 文件已采内容摘要；除 ADR 追加本轮段落外均保护原内容 |
| 登记 worktree | 根另有 `ao/yuanhub-all-9`、`ao/yuanhub-all-2`、`ao/yuanhub-all-4`；前端另有 `ao/yuanhub-all-9@f7d9e9f…`、`ao/yuanhub-all-4@05cc0ae…`，两者 status 干净 | 不代表这些分支已合并；不借用、不改动、不清理。任务记录可能落后于实际交付 |
| 服务与外部系统 | 本轮无需运行页面或 API | 没有启动、访问、重启或停止服务；没有运行浏览器、截图、真实账号操作或外部写入 |

已读取根/前端 AGENTS、设计/响应式/页面规范、TESTING 与前端质量指南；按 UI/UX skill 检查受控状态、监听清理、焦点、不同输入方式及视口边界。skill 的 Vue 检索命中监听清理；焦点检索未准确命中跨视图恢复模式，不把通用搜索结果升为已验证规则。沿用项目触控规范，不恢复全站 44px 门禁。

### 02 与 03 的证据对照

以下数字来自本轮实际读取的**历史日志/JSON**，不是本轮重跑结果。历史记录没有完整的源码哈希清单，不能独立证明所有产物与当前工作树逐字一致。

| 证据层 | 02 基线 | 03 最终记录 | 本轮能得出的结论 |
| --- | --- | --- | --- |
| 静态 | 同一 ul/li + 640px 重排，稳定父页持业务 | 3 个 View + 展示映射/样式；父页 script 除一个 import 外与 HEAD 完全相同，本轮程序化比较为 true | 没有把 API、权限、草稿和订阅复制到两端；不能据此声称真实运行无竞态 |
| Vitest/jsdom | 原 54/54；扩展 66/68，暴露迟到确认；独立修复后 72/72 | `vitest.log`：5 文件 112/112；历史 50、视图 15、盘点 38、Tabs 7、Header 2 | 两端共用行为断言、真实奖励组件草稿及派发 matchMedia/resize；不是浏览器几何、触控、后端权限证据 |
| 真实 Chromium + 合成业务 | 11 组几何、14 张截图、2 次内存写入；旧统一尺寸规则产生 58 条 findings | 19 组几何、18 张截图、23 条 viewAssertions、2 次内存写入，findings/runtimeErrors 为空 | 浏览器是真实的，身份/API/SSE 是合成的；请求数 45→35 不是同条件性能对照，不能据此宣称优化 |
| 覆盖变化 | 未覆盖 430/1024；已发现的两项删除确认红测试保留并修复 | 补 430/1024、长字段、第二条分页记录焦点可达性、resize 零 API/SSE 增量 | 覆盖更完整；旧 58 条 findings 的消失部分源于项目取消统一 44px 门禁，不能写成修复了 58 个缺陷 |
| 构建与成本 | 没有同条件迁移前 build/耗时/包体对照 | `build.log` 有构建成功记录；本轮未构建 | 不能给出 gzip 增量、首屏收益、真实渲染帧耗时或维护工时下降百分比 |

历史产物位于 `YuanHub/.ux/audits/inventory-records-{baseline,dual-view}-20261013/`，本轮确认两组 JSON 列出的 14/14、18/18 截图文件存在，未重新审看截图或执行采集脚本。完整方法与局限见 [02](inventory-records-baseline-20261013.md)、[03](inventory-records-dual-view-20261013.md)。这些被忽略的产物不是可跨 clone 获取的证据，且不得随文档提交。

**仍未验证**：真实鉴权/内测/后端库存重放与事务、真实 SSE/401/超时、iOS/Android 系统键盘/安全区/动态地址栏/触控/屏幕阅读器、正式字体与放大/主题矩阵。本轮没有补充真实浏览器或真机结论。

## 2. 最终边界复核

| 所有者/实际入口 | 持有的状态与职责 | 复核结果 |
| --- | --- | --- |
| [inventory/index.vue](../../src/pages/inventory/index.vue)：1613、1706、3770–3873、4093–4147 | tabpanel/v-show；筛选、cursor、records、loading/error/busy/撤销；确认、读写、统计失效；账号 generation；SSE；盘点/奖励草稿及稳定编辑器 | script 除 import 外未变；分页 limit=50，读取有 seq/account/type 校验；确认返回有 generation/disposed 校验；写入完成阶段另见 A2 |
| [InventoryRecordsView.vue](../../src/components/inventory/InventoryRecordsView.vue)：14–92 | 只持 isMobile、expandedIds、DOM ref、布局序号/disposed；布局监听、语义焦点和滚动恢复；await 父级删除 callback | 不复制 records；无 API/store/router/dialog 或业务订阅；同步 matches、mounted 再同步、unmount 清理。同模式不换组件，跨 640 仅替换子视图 |
| [DesktopView](../../src/components/inventory/InventoryRecordsDesktopView.vue)、[MobileView](../../src/components/inventory/InventoryRecordsMobileView.vue) | 同一 props/formatter；删除 emit；Mobile 额外详情 toggle emit；纯呈现模板 | 同时只有一个实例。差异为阅读顺序、详情容器、时间语义与删除入口；权限、写入和恢复仍在父页 |
| [inventoryRecordsView.js](../../src/components/inventory/inventoryRecordsView.js)、[局部 CSS](../../src/components/inventory/inventoryRecordsView.css) | props 定义、类型标签/fallback，共用 scoped 样式 | 没有业务复制；但展示布局/公共外观混合，独立调整约定不足，见 A1/A3 |

权限来自既有 `/inventory` 的 `requiresAuth/requiresBeta` 与后端授权；展示 `disabled` 只是交互状态，不能替代父级或服务端校验。`requestDelete` 的异步 callback 用于确认关闭后的焦点恢复，普通 emit 无法提供等待完成的 Promise；不应机械改成 emit 后丢掉该能力。

resize 不搬迁/卸载父控制器、盘点或奖励编辑器，历史数据/筛选/分页/错误/确认仍由原所有者持有。详情展开在宿主保留；筛选/空列表/账号变化会让父层条件卸载这个宿主，**这是业务变化，不属于 resize 保持承诺**。两端都将缺 record_id 的删除禁用，都不提供 consumption_delta 单独删除；恢复入口只有父层一份。历史行为套件在 390/1440 各运行同一组 25 项，未发现新增的双端动作分叉。

保护区核对：`App.vue`、`IslandSidebar.vue`、`MobileHeader.vue`、`src/router/routes.js`、`src/store/`、`src/stores/`、`src/styles/` 共 21 个现有文件，与前端 HEAD 比较没有改动。03 没有新增全局断点；640 内容断点与 1080 导航断点保持独立。没有 JSX、第二套路由、双 store、两视图各订阅 SSE 或 CSS 隐藏双业务实例。

## 3. 缺陷与风险清单（仅建议，不修源码）

严重度：P1 阻断/安全或数据错误；P2 应在相关扩面前解决；P3 可控维护成本。以下没有新增 P0/P1 的已执行复现证据；A2 是源码可达路径判断，禁止写成真实越权事件。

| ID / 严重度 | 文件定位与具体情况 | 最小建议及验证 |
| --- | --- | --- |
| **A1 / P2，样式隔离验收缺口** | DesktopView:61、MobileView:32 同引 CSS；`inventoryRecordsView.css`:9–38 的 record flex/对齐/record-main/record-top 与公共外观混放。例：为桌面提高 `.record` border-radius 或改 `.record-top` flex-wrap，手机仍继承这些值。scoped 防止污染其它组件，却不隔离“两个组件各编译同一源文件”的修改 | 已有 DOM 可以各自修改；桌面专属样式必须在 Desktop 自身或 desktop 根限定下调整，Mobile 同理。仅保留明确双端共用的字段/标签/token 规则；最小是划清局部样式职责，不复制全部 CSS。用一次桌面局部改动/一次手机局部改动确认另一端结构与对应样式来源不变。不是声称当前 CSS 已发生视觉回归 |
| **A2 / P2，继承的写入完成竞态及测试缺口** | `inventory/index.vue`:3835–3847、3855–3871：delete/restore await 后只比较 accountId，catch 同样；没有 disposed/generation 检查。确认已通过、写请求 pending 时卸载页面，成功返回仍会调用 loadRecords/reloadCurrent；A→B→A 或同账号身份变化也能通过 accountId 比较。Ux 测试:217 覆盖迟到确认，244 覆盖写入期间 resize，未覆盖写入完成时卸载/上下文往返 | 单独修复父级写入完成保护：成功、失败、finally 和后续 await 链均受发起上下文约束，保持有效写入原刷新语义；不用视图补丁。先补 delete/restore × late success/failure × unmount/账号往返/身份变化回归。只阻止旧 UI 回写与额外刷新，不宣称能撤销已发往服务器的写入。涉及并发/身份的修正按 **L3** 重新规划并确认实施 |
| **A3 / P3，包体/维护增量未量化** | 两个 style scoped src 将 3075-byte CSS 各编译一份，scope id 不同；本轮用已安装 Vue compiler 对两个 scope 只读编译，均无错误且生成两份不同作用域规则。生产源码相对 HEAD 净增 **173 行 / 8043 bytes**；两视图静态 import，择一挂载不会择一下载 | 同一条 CSS 源码没有人工复制，但编译有重复，不能宣称 tree-shaking 移除了另一端。当前不新增懒加载、虚拟列表或依赖；若后续一个试点确需优化，再评估单宿主限定的公共 CSS。应先取得同条件构建 chunk/gzip 对照；这些源码数字不是网络包体增量 |
| **A4 / P3，CI 成本目标要区分本地与远端** | `.github/workflows/ci.yml`:push main / PR 对所有改动执行 static/repo/behavior/build；没有 CSS path 豁免。03 未改 CI。本地文档/纯 CSS 按 L0 可只检查 diff，但一旦 push/PR 仍会跑现有全量前端 CI | 迁移任务不要求本地逐项跑全量，也不把远端现状说成优化成果。若验收必须做到“小 CSS 的远端 CI 也定向”，这是独立 **L4** CI 任务，需另授权，保留全量发布/核心风险保障；本轮不改 workflow |

模板共有的记录类型/项目/状态字段是同一业务信息的必要呈现重复，类型映射与格式化已单源，不建议为几十行标签再引入通用行 schema/渲染器。Desktop 的 `expandedIds` 未使用、`viewProps` 动态筛选有少量阅读成本，未发现足以阻断的错误，不单独扩张成清理任务。

已审阅测试/浏览器脚本的完整 tracked diff：跨视图的旧 DOM 节点相等断言改为单列表、记录/禁用/焦点/请求不变量，符合允许替换展示 DOM 的契约；新增视图套件仍保留同模式节点相等断言。原迟到确认安全断言保留，无新增 skip。浏览器移除统一 44px 判定与现行规范一致，仍保留尺寸记录、横溢/遮挡检查并让 findings 导致失败；不据此推断所有控件触控体验合格。

性能判断基于每页 50 条、用户可追加多页的实际路径。渲染只存在一份列表，不存在双视图 DOM 翻倍；跨阈值焦点/锚点扫描为 O(n)，expandedIds 的 includes 随展开数增加。没有长列表帧耗时或堆内存证据，不能声称性能已经下降，也不能承诺无限分页规模；只在真实慢路径出现后另测，不先加虚拟化。

## 4. 合格门槛与是否减少维护负担

| 门槛 | 当前判断 | 放行所需证据 |
| --- | --- | --- |
| DesktopView 可独调，MobileView 不变 | 模板边界具备；专属 CSS 可以新增在 Desktop，但共享 CSS 的职责尚不清晰（A1） | 桌面专属改动限定文件/根，手机无需配套修补；共同样式变化明确作为双端变化验收 |
| MobileView 可独调，DesktopView 不变 | 手机已有局部 scoped block；共用基础 CSS 仍须双端回归 | 手机专属排列/详情改动不改 Desktop 与业务源；桌面关键字段与动作不退化 |
| 业务修复两端同时受益 | 结构支持，02 generation 修复仍由两端同一 callback 执行；03 两端迟到确认测试有历史通过记录 | A2 只修父级并由双端同一不变量覆盖，不各自补业务分支 |
| 所有关键行为一致 | 现有合成范围支持分页/错误/确认/删除恢复/草稿/resize；写入完成上下文和真机边界不完整 | 先补 A2；真实设备按下文验收，未获得结果不得写“全行为已一致” |
| 小 CSS 不触发全量验证编排 | 本地规范满足；03 未引入新全量门禁。远端现有 CI 不满足字面上的定向目标（A4） | 局部 CSS 本地只 diff/受影响人工验收；远端 CI 保留现状或另立 L4 决策，不混入迁移 |

**结构上可能减少的负担**：业务修复只改一个入口；手机 DOM/详情层级可在 Mobile 文件改；相同参数/次数/账号隔离断言可复用。**已观察到的成本**：多出宿主、切换/焦点逻辑和测试，公共 CSS 变更仍触达两端；尚无迭代工时/返工率的对照。

扩面前用同一个小区域记录一次“桌面专属”“手机专属”“业务修复”的实际改动文件、是否迫使另一端配套修补、定向验证命令和实际耗时；与 02 同类改动按相同口径比较。现在没有这些观察，不能用文件行数下降、用例数增长或截图数增长代替维护收益。若成本无改善，保留一级响应式或局部差异即可，不追求拆分数量。

## 5. 下一批分类与回归矩阵

**以下全是候选，不是实施或任务创建授权。** 每次开始前重新核对两个仓库 branch/HEAD/status、目标 diff、登记 worktree 和任务负责人；当前干净不代表无未合并工作。风险为建议范围：只动视觉降 L0/L1，增加模式切换为 L2，触及业务并发/身份/持久化升 L3，构建/CI/嵌入产物发布升 L4。

矩阵记号：M1=390/1440 手动受影响 UI；M2=320/390/768/1440、实际断点两侧及必要横屏；M3=规范完整 320/390/430/768/1024/1440 与横屏。均需核心字段/操作可达、长内容/焦点；真实手机键盘/安全区按所触区域补验。浏览器自动化仍须当前任务明确授权。下表的测试名是应复用的现有套件，不表示本轮已执行。

| 模块与优先级 | 决策 / 实际文件 | 复杂度与主要风险 | 最小回归矩阵 / 测试 | 登记任务与阻塞 |
| --- | --- | --- | --- | --- |
| **1 库存统计展示** | **保留响应式**；`src/pages/inventory/index.vue`、`src/components/inventory/ResourceBalanceReport.vue`、`AcquiredPeriodReport.vue` | L1；已有独立报告、局部图表 view/选中/tooltip；不要为双视图卸载重建 | M1；影响图表断点则 M2+760 两侧；只有展示行为改变才扩受影响测试 | `10-05-inventory-resource-remediation=review`；先确认报告范围交接及 A1/A2，不抢改 |
| **库存清单/奖励编辑** | 清单仅候选 **抽出局部差异组件**；`inventory/index.vue` 清单卡/筛选；`RewardEntryWorkspace.vue` **保留响应式、稳定挂载** | 局部 UI L2；盘点、奖励草稿/确认及导入并发若迁移升 L3；不拆全部工作区 | M2+640；`inventoryStockBaseline.spec.js`、`workspaceTabs.spec.js`；数据账户往返/取消/保存失败保草稿 | `09-22-inventory-type-switch-layout`、`09-23-inventory-reward-workspace-dialog`、`10-03-inventory-training-quick-entry=in_progress`；需逐文件交接 |
| **2 密探图鉴 catalog** | **抽出局部差异组件**；`src/pages/operator/index.vue` catalog 筛选/卡片，复用 `src/components/operator/OperatorFilterDossier.vue` | L2；不改账号、quickDrafts/card drafts、详情/编辑/星石装配；从图鉴一个区域起步 | M2+640/641；`operatorFilterDossier.spec.js`、`workspaceTabs.spec.js`；同一筛选/排序/详情/禁用动作，resize 零请求 | `09-27-operator-catalog-mobile-filter`、`10-05-operator-quick-remediation`、`09-29-operator-scan-review=in_progress`；外部 quick worktree 记录不能视为有效交接 |
| **密探养成** | **保留响应式**；`operator/index.vue` current/tracking、`src/components/operator/OperatorGrowthTracker.vue`、`OperatorGrowthFilters.vue` | L2 展示；业务并发/规划持久化 L3；已有 visitedTabs 懒挂载和 async Tracker，不整页双视图 | M2；`operatorGrowthOwnership.spec.js`、`operatorAwakening.spec.js`、`operatorAwakeningPlan.spec.js`；草稿、只读、计划确认、切账号 | `10-13-operator-awakening-continuity`、`10-12-pr22-pr11-star-completion-integration`、`10-03-operator-oddity-completion=in_progress`；只列候选 |
| **3 招募记录** | 时间线 **保留响应式**，编辑器需要时 **抽出局部差异组件**；`src/pages/recruitment/{RecruitmentTimeline,RecruitmentWorkspace,PoolEditor,EntryEditor}.vue`、`useRecruitment.js` | L1 时间线；L2 编辑展示；CAS/requestId/拖拽持久化 L3。不能因 resize 重建 PoolEditor 的 rows/originals/orderRevision | 时间线 M1+768/1200；编辑 M2+430/431/520/700 与软键盘；`recruitmentTimeline.spec.js`、`recruitmentPoolEditorClose.spec.js`、`recruitmentOrder.spec.js` | `10-13-recruitment-editor-polish`、`10-12-recruitment-avatar-drag`、`10-08-recruitment-daily-record`、`10-01-recruitment-timeline=in_progress`；avatar worktree 路径须重确认，当前主树无 dirty 不代表已交接 |
| **4 活动日历** | **抽出局部差异组件（复用已有）**；`src/pages/calendar/index.vue`、`src/components/calendar/{CalendarFilterControls,CalendarFilterSheet,CalendarAgendaView,CalendarTimelineView,CalendarMonthView,CalendarSubscriptionControls}.vue` | L2 局部；query、订阅/private drafts、跨账户或离开保护升 L3。agenda/timeline/month 是用户选择，不是 PC/Mobile，不再平行复制成六套 | M2+1024；`activityCalendarFilters.spec.js`、`activityCalendarViews.spec.js`；涉及编辑另加 `activityCalendarUnsaved.spec.js`、`activityCalendarSubscriptions.spec.js`；resize 保用户 view/草稿 | `10-03-activity-calendar-multi-view`、`10-03-activity-calendar-mobile-filter`、`10-09-activity-calendar-unsaved`、`10-10-calendar-private-date-range`、`10-12-calendar-recruitment-integration=in_progress`，重叠多，先交接 |
| **星石：暂不排实施日期** | **保留响应式**；`src/pages/star/index.vue`、`embedLifecycle.js`、`starCloudCoordinator.js`、`starCompletionPort.js`、`RecognitionTutorial.vue`；展示根 `#product-root` 和 `public/yuanstar-embed/` 既有产物 | L3 云端/账号/本地草稿；嵌入构建发布 L4。不是复制两个 Vue 就能分离的渲染内核，不能双 mount 嵌入产品 | 若未来实施 M3；`starCompletionEmbed.spec.js`、`starRecoveryUx.spec.js` 与对应 node 云同步/草稿测试；OCR 本地草稿、离线恢复/账户隔离 | `10-07-star-onboarding`、`10-11-dual-pr-star-integration`、`10-12-pr22-pr11-star-completion-integration`、`10-05-star-ocr-import-remediation=in_progress`；先完成集成与产物来源交接 |
| **5 管理后台与简单表单** | 默认 **保留响应式**；密集表格确有需求才 **抽出局部差异组件**。实际 `src/pages/{admin/roles,feedback/admin,operator/admin,calendar/admin,recruitment/admin,user/login,user/profile}.vue` | 表单 L0/L1、表格视图 L2；权限/危险动作/路由 L3。只选一页，不造统一后台双视图 | M1；表格 M2；按页面选择 `adminWorkbench.spec.js`、`adminCatalogHeader.spec.js`、`recruitmentAdmin.spec.js`、`profileConnectionsUx.spec.js`，不全跑 | `09-28-feedback-admin-developer-workflow`、`09-25-feedback-admin-publish-merge`、`10-13-feedback-types-calendar=in_progress`；反馈/后台优先冻结，无明确任务的单一简单表单可在有用户价值时前移 |

**完整双视图：本批无批准候选。** 大文件、复杂业务、多断点或多个已有视图都不是充分理由。只有多个呈现区域的任务编排确实不同、局部差异不足且编辑会话能稳定存活时，才另提完整工作区设计；这会至少按 L3 评估，不在本文默认执行。

## 6. 可复制迁移模板（后续任务的填写项）

模板是既有规范的落地检查表；已观察模式与待验证改进分开，禁止将 A1/A2 的建议当作已实现标准。

| 项目 | 后续单模块必须写清的契约 |
| --- | --- |
| 范围/决策 | 精确到区域/文件；列用户核心任务及 PC/Mobile 的结构差异；按“保留响应式 → 局部差异 → 完整双视图”取最小充分方案；列不得触碰的相邻区域、当前负责人和 task/worktree |
| 容器职责 | 唯一 records/draft/filter/cursor/loading/error/busy/权限/账号/撤销源；既有业务 composable 只调用一次；API/确认/订阅/持久化仍在稳定所有者；路由、编辑器与确认框不受 layout-mode key 控制 |
| props/emits | 两视图同一只读数据/formatter/最终 capability；不复制 ref、不改 props、不向父层报告设备名。事件为意图（如 `delete-record(record)`、`toggle-details(id, open)`），两端 payload/disabled 语义相同；普通事件 emit。确需等待动作结束恢复焦点时，沿用单一异步 callback 并注明 Promise 完成语义，不复制 API 或创建通用命令总线 |
| layout-mode | 只在 DOM/信息层级确有差异时由稳定展示宿主择一挂载；CSS 能解决的不用 JS；按内容解释 query，setup 同步 matches、mounted 再同步、同 callback cleanup；同模式不重建。缺 matchMedia fallback 可测；不用 UA、全局 mobile store 或业务 view/query 联动。当前只有一个试点，不为复用先建通用 composable |
| 状态/样式与退出边界 | 跨切换展开/焦点/滚动锚点在稳定宿主；业务输入在控制器/稳定编辑器；账号/身份变化按原规则失效。两端私有布局分别限定，公共样式明确是双端变更；共享 token 保留。上下文 generation 与 disposed 防止迟到结果回写，不能依赖按钮 disabled；有风险则先另修再迁移 |

UI/UX 验收写进具体任务：同一核心任务与关键字段在两端可达；长中文/ID、不规则数据、空/失败/忙/只读状态可理解；无整页横溢；不用 hover-only；详情/危险动作键盘可达；切换不抢弹窗焦点，仍能滚到原记录；控件可辨认且不误触。Modal/固定栏触及处才补 dvh/Safe Area/软键盘检查。按项目规定选择尺寸，不强制全站按钮像素值。

| 风险 | 验证职责与最小门禁 |
| --- | --- |
| L0/L1 文案/专属 CSS、局部呈现 | 精确 diff/相关文件；不创造无意义测试、不 build/全量 lint。用户按 M1 检查受影响视口；纯文档不要求 UI 验收 |
| L2 模式/受控交互 | 更新受影响 SFC 行为测试，真实派发 change/resize；覆盖初值/跨阈值/独占/清理/动作等价/草稿与请求增量；用户或获明确授权的 Agent 做 M2，不能用 jsdom 冒充排版验收 |
| L3 账号/并发/路由/持久化 | 重新规划业务边界；相关隔离/安全/契约测试与模块级检查，`verification_owner=user` 时如实列待跑命令；真实数据库语义只能在 owned disposable containers 验证 |
| L4 CI/构建/发布 | 独立基础设施任务，才考虑完整 CI 对齐或专项检查；不搭车进入视图迁移 |

禁止事项：复制业务核心/账号权限/API/订阅；按尺寸卸载草稿或把控制器加 viewport key；双挂载后 CSS 隐藏或双 KeepAlive 代替单源；顺手改 App/导航/routes/store/公共 styles、嵌入产物/依赖/CI；弱化测试、覆盖他人改动、未授权浏览器/commit/push/PR/deploy。发现需要越界的修复先列独立任务并确认。

## 7. Phase 2 独立任务建议与放行/回退

**先决修正（未创建/未实施）**：A1 库存历史专属样式职责明确，L0/L1；A2 删除/恢复写入完成上下文保护与回归测试，L3，单独规划并确认。A3 先记录成本，不先优化；A4 先确认远端 CI 是否属于目标，不自动开 CI 改造。

以下顺序按价值、风险和当前并行工作排序，每次只开始一项。任一目标文件出现未交接 diff 或分支变更，重新评估顺序，不依据今天的清单抢改。

1. **库存统计报告维护验证，预计 1–2 个工作日（含用户验收）**：交接 `ResourceBalanceReport.vue`/`AcquiredPeriodReport.vue` 后选一个真实 UI 需求，保留响应式，确认既有独立组件已足够。只动一份报告；不为迁移制造差异。交付同口径改动范围/验证耗时记录及 M1/M2 用户验收；没有需求则跳过。
2. **密探图鉴一个局部展示边界，预计 2–3 个工作日**：mobile-filter/quick/scan 交接后，仅图鉴筛选或列表二选一，复用现有 dossier；父级状态、养成、编辑器不搬。交付两端同筛选/动作、零新增请求/订阅、专属样式独立的证据；先不拆养成。
3. **招募时间线或编辑器的局部差异，预计 1–3 个工作日**：editor-polish/avatar-drag/daily-record 交接后，先确认时间线 CSS 是否已满足需求；需要编辑器差异才选一个局部，稳定 PoolEditor 编辑会话与原 CAS。范围触及保存/排序则重新定 L3，不一并改 useRecruitment。
4. **日历筛选/卡片的维护收口，预计 1–2 个工作日**：重叠任务交接后复用已有 Controls/Sheet/三视图，不生成 PC/Mobile 页面。订阅 checklist 草稿仍在子组件；若改造会卸载它，先停止并另立草稿所有权任务，不能把 dirty 登记当草稿保存。
5. **一个后台列表或简单表单，预计 1–2 个工作日**：按实际用户痛点选单页；默认保留响应式，密集表格才评估卡片。相关后台任务交接前冻结；无重叠且价值更高的表单可前移。权限/路由保持，星石与完整工作区双视图留到集成稳定后另评估。

预计时间是建议任务的工作量，不是实施承诺；阶段开始前按文件现状重估。

**Go 条件**：A1/A2 有已确认并交付的修正或维护者明确接受的范围限制；直接相关测试有真实结果；两端关键行为和专属样式可独调有证据；受影响设备由用户验收；选择下一模块时没有未交接改动。此时只放行一个模块，继续记录收益，不等于全面迁移授权。

**维持 Adjust**：边界具备但样式/草稿所有权不清、历史证据未绑定现状、测试缺口或交接未闭环；保持现状，先处理当前区域。

**Stop / 回退条件**：resize 新增业务请求/订阅/写入、草稿丢失、跨账号数据/迟到结果污染、同动作双写、字段/危险操作不可达、连续试点仍需双端补丁且成本高于共享模板。先修安全/数据问题，不靠退回旧 UI 掩盖它们。当前未提交试点只能经用户确认后按精确 patch 回退；保护原 dirty 与 02 有效回归，不能整文件覆盖/reset/stash/clean。以后已授权提交也只回退试点自有 patch，不盲目 revert 混合提交；无路由/API/存储迁移，不存在数据回滚步骤。

## 8. 本轮检查与用户下一步

本轮只新增本文，并在 ADR 追加复盘索引与已观察边界；不改 standards、02/03 历史记录、源码或测试。没有新增自动化测试：属于无行为文档修改。

本轮实际检查：父页 script 精确比较（仅 import 不同）；21 个保护区文件与 HEAD 无差异；读取历史测试/构建/JSON 并确认截图路径存在；已安装 Vue compiler 对公共 CSS 的两种 scope 只读编译均 0 errors；交付前检查双仓 `git diff --check`、新文档 no-index whitespace、相对链接与原 dirty 内容保持。最终命令结果由本次会话交付汇报记录。

当前文档的最小用户检查：

```bash
git -C YuanHub diff --check
git -C YuanHub diff -- docs/architecture/responsive-view-boundaries-adr-20261013.md
```

本文为 untracked 时直接阅读，不会出现在普通 git diff 中；无需为本轮文档跑测试/build。若用户要复核当前试点的已有合成行为基线，可在 YuanHub 执行下列**可选定向命令**；A2 新增的场景尚无测试，现有用例即使全绿也不能关闭 A2：

```bash
npm run test:behavior -- behavior/inventoryRecordsUx.spec.js behavior/inventoryRecordsViews.spec.js behavior/inventoryStockBaseline.spec.js behavior/workspaceTabs.spec.js behavior/mobileHeader.spec.js
```

用户手动 UI 验收（不是本轮文档完成的必跑门禁）：

1. `/inventory` → 操作历史；390/768/1440 与 639/640/641，筛选/更多/失败重试后切宽度，记录/游标/错误保留，只有一份可操作列表。
2. 合成或获准可丢弃记录打开删除确认，跨尺寸取消后焦点回到可达入口；正常删除/撤销各一次，无重复写入，升级消耗无单独删除。不要用生产数据验收危险动作。
3. 保留盘点/奖励草稿与未完成确认，旋转或跨断点，输入不清空、不自动保存、不关闭确认；320、430、1024、1080/1081 及手机横屏补查长字段与核心动作。
4. 真实 iOS/Android 检查键盘、地址栏、安全区、触控、焦点/读屏；记录结果及设备，未测项保持未测。

下一步（2 分钟内）：阅读 A1/A2，确认先立哪一项最小修正；本轮不据此自动改代码、创建任务或提交。commit 未授权，因此没有本轮 commit SHA，也绝不 push。
