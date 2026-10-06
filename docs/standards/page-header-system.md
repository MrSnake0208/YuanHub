# YuanHub Page Header System

本文依据 2026-10-05 的真实代码审计制定：`src/pages` 下 46 个 Vue 文件，其中 42 个路由页面文件、4 个嵌入视图；`src/router/routes.js` 有 43 条页面路由记录，作业新建/编辑共用文件，首页另有 `/today` alias。

视觉服从 [设计规范](./design-system.md)，跨设备规则服从 [响应式规范](./responsive-development.md)，现有工具工作区继续遵守 [工具页身份与工作区](../tools-compact-header.md)。本文规定页面抬头的职责和层级，不改变 API、权限、数据模型、计算或持久化。

## 1. 为什么需要这个系统

旧全局 `.hero` 把大标题、黄色渐变、水印和统计应用到列表、编辑器和管理页面，推迟了实际任务。另一方面，四个工具页已完成紧凑工作区改造，反馈页已局部压缩，日历和招募管理也有自己的合理结构。需要统一判断规则，避免把已改善的体验再次重做。

**Hero 不是 YuanHub 普通页面的默认页头。**

只有 Marketing、Onboarding、Landing，以及确实需要解释和引导的特殊页面才允许大型 Hero。普通工具页、数据页、列表页、管理页、编辑页使用对应的紧凑 Page Header Pattern。

统一的是标题体系、Context/Utility 语言、字体、暖纸张视觉、间距节奏、响应式原则及 Action/View/Context 的层级关系，**不是统一 DOM，也不是所有页面长得一样**。

## 2. 六种 Pattern

| Pattern | 适用任务 | 抬头职责 | 内容边界 |
| --- | --- | --- | --- |
| Workspace Header | 密探、库存、星石、账房、招募档案、日历、个人账号工作区 | 页面身份、轻量账号/版本 Context、帮助/更多等 Utilities | View、搜索、筛选、录入、更新、导入和统计主要由正文组织；不用大 Hero |
| Discovery Header | 作业广场、反馈浏览、共建中心、更新日志、通知、建议列表 | 标题、极简说明、必要的创建/提交入口 | 尽快进入浏览工具与内容；不用宣传 KPI；没有搜索能力就不造伪搜索 |
| Admin Header | 管理工作台、权限、审计、目录/反馈/活动管理 | 返回或必要 Breadcrumb、具体管理任务、管理 Context、Utilities | 不用宣传 Hero；管理根页不强制返回管理根页自身；不复制一整条管理导航 |
| Detail / Editor Header | 作业详情/编辑、快速录入、对象弹窗、建议提交 | 返回上下文、对象/任务标题、已知状态、对象级 Action | 长对象说明归正文；长表单可保留底部保存，不为统一把所有操作搬上页头 |
| Marketing / Onboarding Hero | Promo、Beta、安装、Demo、产品 Landing | 解释产品、展示价值、说明资格/体验和下一步 | 可使用大标题与 Hero；真实状态、示例身份及继续入口优先于装饰 |
| Special / Dashboard | 今日一览、访问恢复、404 等特殊职责 | 首页准备状态/概览，或清楚的状态与恢复动作 | 独立结构；Dashboard 不是自动获得大型 Hero 的许可，必须有实际引导理由 |

认证页属于 Onboarding 的特殊紧凑 Auth Header，保留 `AuthLayout`，不增加大 Hero。错误/无权限页属于 Special 状态页，不要求套普通工具页结构。

## 3. Page Identity 与 H1

- 页面身份应在顶部明确，不只依赖侧栏、浏览器 title 或下一层 Tabs。反馈的“我的反馈”“反馈工作台”“权限配置”应能区分任务。
- 普通页面有一个主要 h1；组件渲染 h1 也有效。局部分区用 h2/h3，Modal 以 `aria-labelledby` 指向自己的对象/任务标题，不额外造页面 h1。
- Detail 的 h1 使用当前对象标题，缺失时提供明确兜底。Editor 新建态可用任务名，已有对象应有对象身份。长中文、ID 和英文标题允许安全换行，不能通过裁切丢失身份。
- 标题使用 `--font-s`、900 重、茶棕 `--tea`，常规功能页以 28–32px 为基准。对象标题可换行，营销标题可以更大；不让普通 h1 继承旧 Hero 的 56–104px 尺度。
- 不把口号、英文副题、统计或状态混成 h1 的一部分。不用 Heading 元素只为获得字号；标题层级保持连续。
- 迁移时检查下一级标题：正文 h2 不应继承比对象 h1 更大的旧展示字号，避免页面身份被分区标题压过。

## 4. Description、Context、Utilities

### Description

可选，通常一句，解释页面能做什么。页面任务已明确时可以省略。不得用长教程、实现细节或重复正文填满页头；教程进入帮助，对象打法说明进入正文。说明使用正文无衬线、弱化茶棕，通常 12–14px，不能以低对比隐藏重要警告。

### Context

Context 回答“当前在哪里/看谁的数据”：账号、游戏版本、币种、关卡、对象编号、公开/草稿、只读、数据新鲜度等。使用已有真实数据，不从页面可访问性推断未提供的发布状态，也不把旧版转换状态当作目标平台兼容性。

轻量文字、分隔符、少量必要状态即可，不把每项信息包成卡片/胶囊。长账号可截断但保留 title/aria-label 和管理入口；游戏账号 Context 通过共享 `AccountSwitcher` 原地选择，轻量 CRUD 原地进入共享 Manager Dialog，完整账号与应用设置仍属于个人中心（见 [工具页切换规则](../tools-compact-header.md#游戏账号切换2026-10-05)）；对象标题允许换行。读取失败、同步失败、冲突及归属警告保持可见，不能作为低频 Context 隐藏。

### Utilities

帮助、更多、低频设置、刷新、账号管理等辅助任务，通常在标题附近。保持既有可访问名称、44px 命中区域、focus-visible、展开状态和焦点恢复。视觉按钮不必形成 44px 高的实体框。Utilities 不应形成按钮墙；未使用的 Utility 区不留空占位。

帮助默认收起；更多承载低频操作，不能藏重要错误或强制下一步。共享 Header 不拥有账号、API 或弹窗业务状态。

## 5. Action、View 与正文

| 类型 | 判断方式 | 例子 | 默认位置 |
| --- | --- | --- | --- |
| Context | 说明当前范围/对象/状态 | 当前账号、如鸢、CNY、只读、更新时间 | 抬头轻量展示或贴近任务的正文区域 |
| View | 切换同一工作区的展示 | 图鉴/养成总览、月历/议程、库存报告 | Header 后的工作区导航，日历等任务可紧邻标题 |
| Action | 执行、创建或改变对象 | 录入、盘点、截图导入、保存、发布、创建作业 | Workspace 在正文任务位置；Discovery 可有必要入口；Detail/Editor 可有对象操作 |
| Utility | 辅助/低频操作 | 帮助、更多、刷新、方案管理 | 标题附近或工作区工具栏 |

- Tabs/Search/Filter 默认是正文工作区控制，不是公共 Header 的必填部分。它们可以视觉上紧接抬头，但仍由页面维护；日历 View 是允许的专用例外。
- “录入”“新增”“保存”不是 View，不混进 Tabs。切换 View 不伪装成主提交按钮。
- 不要求每页都有右上主 CTA。作业广场的创建入口与作业详情的编辑入口合理；密探录入仍跟着搜索/工作区。
- KPI 只有对当前任务有用才保留：总数/分页变为列表摘要，浏览/点赞/热度变为对象 metadata；删除没有事实依据的“在线实时更新”承诺。
- Empty State 不取代页面身份，也不把 Header 变成首次引导卡。Header 保留稳定身份，正文按未登录、无账号、读取失败、空数据或筛选无结果展示下一步，不增加重复 CTA。

## 6. Desktop / Tablet / Mobile

共有暖纸张与吉祥物背景、茶棕宋体标题、正文无衬线和 Archivo 数字；不增加大块品牌蓝或黄色标题墙。页头默认不再套 Card；先通过留白、排布和必要细线区分层级。

- 标题/说明与 Action 可宽屏并列，窄屏按阅读顺序分层；以容器可用空间决定重排，不假设视口等于正文宽度。
- 使用 `min-width: 0`、`minmax(0, 1fr)`、安全换行，保留 4/8px 间距节奏。普通页头建议上下 20/12px，说明间距 4–8px，层间 8–12px，正文衔接 12–24px；这是基准，不是锁定高度。
- 不固定 Header 高度，不根节点隐藏横向溢出，不无限缩字号，不隐藏核心操作或复制移动业务状态。
- 密探等现有 `CompactToolHeader` 继续使用标题/Utility 同行、账号第二层；容器 >=860px 后三者同行。不要为统一 primitives 改写该稳定布局。

| 视口 | 重点 |
| --- | --- |
| 390px | 稳定页面身份，Context 独立层，必要 Action 可单独一行；按钮可点，长标题/ID 不挤压；正文较早出现 |
| 768px | 真实中间态；考虑全站移动导航和页面 gutter 后的剩余空间，避免每个控制各换一行；保留有意的两层结构 |
| 1440px | 考虑桌面侧栏占宽；允许标题/操作同行，提高内容密度，但不放大标题或留白制造 Hero |

按响应式规范选择实际验证风险。样板至少实际检查上述三档；结构性高风险再补 320/430/1024 及必要横屏。检查身份、Context、Action/View、按钮墙、圆角框墙、内容位置、768 换行与品牌语言。合成预览必须标明，不能冒充真实登录端到端验证。

## 7. Hero 与旧 `.hero` 迁移

- Promo、Beta、安装、Demo 可保留大型 Hero。今日一览保留实际引导职责，成熟账号密度可独立评估。认证页保留紧凑 Auth Header。
- 普通工具、列表、管理、对象详情和编辑页面禁止新增大型 Hero；旧页按优先级逐步退出。
- 按渲染结构与覆盖样式判断，不能只看 `.hero` 名称。招募档案/管理已去大背景；反馈中心已通过 `.feedback-center` 压缩，局部调整即可。
- 不先全局修改 `.hero`：安装页及未迁移页面仍依赖它。逐页换结构与页面样式，保护数据、权限、加载/错误/空态、返回目标与对象 Action；最后再清理确定无用的旧选择器。
- Marketing 与 Special 不参与本轮四页样板迁移；不给“全站统一”批量改写许可。

## 8. Primitive 与 Pattern component 的边界

- Primitive 分享标题、说明、Context、操作语言和间距，不能承担页面业务。可使用 CSS 类，不强制创建 Vue 包装组件。
- 本轮 `src/styles/page-header.css` 提供 `.page-header`、标题/说明/Context、返回/操作等小型 CSS primitives；Admin/Discovery/Detail 各自组织 DOM。
- `CompactToolHeader` 保留名称、`title`、可选 `description`、`account/actions/help` 插槽；不恢复 `primary`，不改变其余工具页。
- Pattern component 只有在重复的真实结构稳定后才提取；Detail 的长对象标题与状态、Admin 的返回上下文、Workspace 的账号布局不是一个布尔开关的差异。
- **禁止制造一个几十个 props 的超级 PageHeader。** 不加入 pattern 切换、权限判断、API 读取、Tabs/Search/Filter 状态、账号业务和对象操作集合；不为未来迁移预先搭组件体系。

## 9. 本轮样板与边界

密探名册保留原 Workspace，只补齐主要内容跳转目标；管理工作台采用轻返回/任务身份/授权 Context；作业广场采用标题/简述/创建入口和正文列表摘要，空态仅保留正文创建入口；作业详情采用对象标题/来源及已知状态/返回/编辑，长打法说明与热度统计归正文，分区 h2 收敛至 24px 以保证对象身份优先。

未改变路由、功能开关、API、权限、数据模型、业务计算或持久化。真实路由仍执行其原访问条件。视觉检查可在已有 Vite 服务上挂载真实 SFC 的隔离合成预览，阻止后端业务写入。

## 附录 A：真实页面迁移表

以下“审计基线”为最初实施前状态，保留用于追溯；最右列为 2026-10-05 最终代码与 verification 核对后的状态。优先级仍表示原迁移顺序。W/D/A/E/M/S 对应上述六类，分类合计 W 7 / D 7 / A 13 / E 5 / M 7 / S 3 = 42 个路由页面文件。

| 页面 / 路由 | 源文件（src/pages/） | 审计基线页头 | 推荐 Pattern | 保留 / 迁移 / 例外 | 优先级 | 主要问题 | 迁移风险 | 最终迁移状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 密探名册 /operator | operator/index.vue | CompactToolHeader + compact 账号 | W | 保留，本轮样板 | 保留 | 已合理，不重做账号/搜索/录入 | 高：账号、录入、交换、焦点 | 明确保留：Workspace 样板，账号 / Utility / View 已合理 |
| 库存 /inventory | inventory/index.vue | CompactToolHeader + 新鲜度 | W | 保留 | 保留 | 盘点已在正文，不迁移 | 高：盘点基准/有效零库存 | 明确保留：CompactToolHeader 与正文盘点工作区 |
| 星石 /star | star/index.vue | CompactToolHeader + 同步 metadata | W | 保留 | 保留 | OCR/错误保持可见 | 高：嵌入/OCR/同步/恢复 | 明确保留：CompactToolHeader 与同步 / OCR 状态 |
| 账房 /cart | tools/cart.vue | CompactToolHeader + 版本/币种 | W | 保留 | 保留 | 无账号也是合理 Context | 高：版本清单/方案/抽屉 | 明确保留：CompactToolHeader 与版本 / 币种 Context |
| 招募档案 /recruitment | recruitment/index.vue | .hero 已透明化，无大水印 | W | 局部迁移 | P1 | 标题偏大，账号独立较远 | 高：revision/恢复/游戏不一致 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 日历 /calendar | calendar/index.vue | .calendar-header + 今天/View | W | 局部对齐，专用例外 | P2 | 字号可达52px，结构合理 | 高：URL/订阅/日期定位 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 账号 /user/profile | user/profile.vue | 缩小 .hero，连接水印 | W | 局部迁移 | P2 | 展示背景/留白偏重 | 高：账号/连接码/锚点 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 作业广场 /works | work/index.vue | 大 .hero + 四项KPI | D | 迁移，本轮样板 | P1 | KPI与重复标题推迟内容 | 中：分页/加载/空态 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 我的反馈 /feedback | feedback/index.vue | .feedback-center 紧凑覆盖 | D | 局部迁移 | P2 | h1“反馈中心”任务不明确 | 高：弹窗/附件/工单 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 反馈广场 /feedback/plaza | feedback/plaza.vue | .feedback-center + 工作区导航 | D | 局部迁移 | P2 | 任务身份与重复说明 | 中高：深链接/支持/详情 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 共建 /co-creation | co-creation/index.vue | 大 .feedback-hero | D | 迁移 | P1 | 桌面274px介绍区抢内容 | 中：目标/管理入口/旧链接 | 已迁移：紧凑身份 / Context，旧 Hero 退出 |
| 日志 /changelog | changelog/index.vue | 缩小 .hero + 版本胶囊 | D | 局部迁移 | P2 | 说明/副题/水印偏重 | 中：锚点/增量加载 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 通知 /notifications | notifications/index.vue | 缩小 .hero + 全部已读 | D | 局部迁移 | P2 | 操作容器与水印偏重 | 中高：已读/失败/跳转 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 我的建议 /calendar/suggestions | calendar/suggestions.vue | .calendar-header + 返回/入口 | D | 保留 | 保留 | 已紧凑；详情同路由切换 | 中：query/分页/焦点 | 保留专用流程；实测 52px 标题已局部对齐，返回与 768 同步收敛 |
| 管理工作台 /manage | admin/index.vue | 大 .hero | A | 迁移，本轮样板 | P1 | 宣传级标题/水印 | 中：权限/工具分组 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 反馈工作台 /feedback/manage | feedback/manage.vue | 紧凑 .feedback-center | A | 局部迁移 | P0 | h1 未说明管理任务 | 高：接单/分派/合并/公开 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 反馈权限 /feedback/admin | feedback/admin.vue | 紧凑 .feedback-center | A | 局部迁移 | P0 | 权限任务藏在导航 | 高：授权/板块/通知 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 开发目标管理 /co-creation/admin | co-creation/admin.vue | 大 .feedback-hero + 返回 | A | 迁移 | P1 | 管理表单前的展示区偏重 | 高：验收/关联/立即公开 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 内测管理 /admin/beta | admin/beta.vue | 大 .hero | A | 迁移 | P1 | 运营配置不需大标题 | 高：扩容/开放/审计/重置 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 角色 /admin/roles | admin/roles.vue | 大 .hero + 统计 | A | 迁移 | P1 | KPI抢占绑定列表 | 高：完整替换/超级管理员 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 审计 /admin/audit | admin/audit.vue | 大 .hero + 分页统计 | A | 迁移 | P1 | 页码重复，内容延后 | 低中：分页/重试 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 密探管理 /operator/admin | operator/admin.vue | 大 .hero + 统计 | A | 迁移 | P1 | 长说明/统计延后目录 | 高：公共目录/导入/编辑 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 关卡管理 /level/admin | level/admin.vue | 大 .hero + 统计 | A | 迁移 | P1 | 筛选/版本被放大为KPI | 高：revision/归档/导入 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 卡池管理 /recruitment/admin | recruitment/admin.vue | .hero 已奶油化/缩小 | A | 局部对齐 | P2 | 返回/crumb层次可压缩 | 高：UP/历史映射/dirty | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 招募访问 /admin/recruitment-access | admin/recruitmentAccess.vue | .hero 奶油底/无水印 | A | 局部对齐 | P2 | 标题32–56px偏大 | 高：开放/授权/撤销 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 日历管理 /calendar/admin | calendar/admin.vue | .calendar-header + AdminBackLink | A | 局部对齐 | P2 | 结构合理，字号偏大 | 高：来源只读/审核/冲突 | 局部对齐完成：身份 / 层级 / 密度 / 响应式，业务保持 |
| 日志管理 /admin/changelog | changelog/admin.vue | 大 .hero + 编辑双栏 | A | 迁移 | P1 | 挤占编辑/审核工作区 | 高：富文本/修订/发布 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 作业详情 /work/:id | work/detail.vue | 对象大 .hero + 热度KPI | E | 迁移，本轮样板 | P1 | 标题/长说明/统计抢内容 | 中高：来源/编辑权限/返回 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 新建/编辑 /work/new、/work/:id/edit | work/editor.vue | 大 .hero + editor-meta | E | 迁移 | P0 | 对象身份/状态/操作分散 | 高：保存/发布/冲突/离开 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| 快捷录入 /operator/quick | operator/quick.vue | 大 .hero + 统计，账号另层 | E | 迁移 | P0 | 账号/步骤/保存分散 | 高：逐页保存/归属/模式 | 已完成：既有样板 / 前批 verification 已核对，本 Goal 未重做 |
| BOX /operator/share/:token? | operator/share.vue | 大 .hero + 成功态统计 | E | 迁移，双状态例外 | P1 | 查看入口不需宣传大标题 | 中：token/失效/只读 | 已迁移：紧凑身份 / Context，旧 Hero 退出 |
| 补充建议 /calendar/suggestions/new | calendar/suggestion-new.vue | .calendar-header + 返回 | E | 保留，新建任务例外 | 保留 | 没有对象无需硬加标题 | 高：重复提交/结果不确定 | 保留专用流程；实测 52px 标题已局部对齐，返回与 768 同步收敛 |
| Promo /promo | promo/index.vue | .promo-hero 产品介绍 | M | 保留Hero | 保留 | 介绍职责真实，非工具 | 低：导航 | 保留 Hero：产品介绍与公开数据边界 |
| Beta /beta | beta/index.vue | .beta-hero-grid + 资格状态 | M | 保留Hero | 保留 | 状态/继续优先于装饰 | 高：报名/候补/redirect | 保留 Hero：体验资格 / 候补 / 继续入口 |
| 安装 /install | install/index.vue | .hero.install-hero | M | 保留Hero | 保留 | 允许安装引导 | 中：PWA/平台/浏览器能力 | 保留 Hero：安装引导与浏览器能力提示 |
| Demo /demo | demo/index.vue | .demo-hero + 示例身份 | M | 保留Hero | 保留 | 不能误作真实工作区 | 中：演示View/重置 | 保留 Hero：示例身份与产品演示 |
| 登录 /login | user/login.vue | AuthLayout | M | 保留紧凑Auth例外 | 保留 | 无需大Hero | 高：认证/redirect | 保留紧凑 AuthLayout：登录 / redirect |
| 注册 /register | user/register.vue | AuthLayout | M | 保留紧凑Auth例外 | 保留 | 无需大Hero | 高：验证码/校验 | 保留紧凑 AuthLayout：注册 / 校验 |
| 找回 /forgot | user/forgot.vue | AuthLayout | M | 保留紧凑Auth例外 | 保留 | 无需大Hero | 高：恢复流程 | 保留紧凑 AuthLayout：恢复流程 |
| 今日一览 /、/today | today/index.vue | .today-hero + 状态CTA | S | Dashboard例外 | 保留 | 成熟账号密度可独立评估 | 高：准备状态/数据/CTA | 保留 Dashboard：准备状态与下一步任务 |
| 无权限 /forbidden | user/forbidden.vue | .forbidden-panel | S | 状态页例外 | 保留 | 不套普通工具页头 | 高：权限复查/安全返回 | 保留 Special：权限复查 / 恢复 |
| 404 /:pathMatch(.*)* | site/not-found.vue | .not-found-panel | S | 状态页例外 | 保留 | 简洁恢复结构 | 低：首页跳转 | 保留 Special：不存在状态 / 返回 |

## 附录 B：非路由主要视图

| 视图 / 文件 | 当前结构 | 分类 / 建议 | 风险 |
| --- | --- | --- | --- |
| recruitment/PoolEditor.vue | 对象卡池名 + 关闭，状态在正文 | E Modal，保留 | 高：记录/保底/保存/只读 |
| recruitment/EntryEditor.vue | 新增/修改记录标题 + 关闭 | E；src未发现调用，暂不迁移 | 接入后高：历史计数 |
| recruitment/RecruitmentExchange.vue | 备份与恢复 h2 | W 局部分区，保留 | 高：预览/恢复/幂等 |
| recruitment/RecruitmentTimeline.vue | 时间线 h2 + 排序/年份 | W 局部View，保留 | 中：筛选/焦点 |
| recruitment/admin.vue 编辑态 | 返回 + 对象名 + 启用/dirty | E 样板参考，保留 | 高：稳定身份/未保存 |
| calendar/admin.vue 编辑态 | 返回 + 对象 h2 + dirty + 新建/编辑 | E，对象身份局部对齐完成 | 高：冲突/字段错误/焦点 |
| changelog/admin.vue 编辑态 | 对象 h2 + 状态/版本 + 编辑区操作 | E，对象身份与 Action 分层完成 | 高：富文本/审核/修订 |
| 反馈详情/新建、图鉴/关卡编辑、库存录入、星石佩戴、账房方案 | 既有局部/Modal任务标题 | E，按任务局部对齐，不替换为页面h1 | 高：关闭/焦点/保存/权限 |

## 附录 C：最终迁移状态

- 原 26 项“迁移 / 局部迁移 / 局部对齐”已全部完成；既有 14 页验收保留，本 Goal 完成其余 12 页。
- 最终实测发现两项原保留的活动建议页仍继承 52px H1，已独立小批只收敛字号、返回与间距，专用流程保留。最终 28 项已迁移 / 对齐，14 项明确保留（密探名册含已验收 Workspace 样板）。
- 本 Goal 共 9 个页面批次、14 个页面文件：2 页完整迁移、12 页局部对齐；另有独立最终审计任务。各批 Trellis verification 已 finish / archive，无 commit / push。
- 共享 `page-header.css`、`CompactToolHeader` 与既有公共样式未扩张；没有新增公共设计原则或万能 Header。
- 普通页面退出旧 Hero DOM。Promo / Beta / Install / Demo 保留真实介绍或引导 Hero；今日一览保留 Dashboard 任务引导；Auth 与 Special 保留专用紧凑结构。
- 全站旧 Hero 审计按真实依赖分类：全局 `.hero` 仍由安装引导使用；孤立的旧 feedback Hero / hero-stats 样式无普通页 DOM 依赖，作为明确 CSS 清理债务保留，本次不为清零关键词改动共享样式。
- 已完成真实 SFC 390 / 768 / 1440 与相关断点检查、只读真实路由代表页审计；合成布局不能替代真实授权账号的保存 / 发布 / 权限 / 同步 E2E。验证产物位于工作区 `.ux/audits/page-header-final/`，逐页状态与任务映射由 `state.json` 记录。
