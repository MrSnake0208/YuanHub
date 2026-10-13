# PC/Mobile 迁移进度（唯一台账）

## 当前检查点

- 起点：主前端 main@c13f501；staged/unstaged/untracked 均为空。根仓 unrelated dirty 不属于本任务。
- 前置成果：库存受控双视图与 A1 独立 CSS、A2 写入完成上下文保护已在 HEAD，需本轮定向复核；历史测试数字不作本轮证据。
- 当前：23/43 条 UI 路由 verified_nonbrowser；库存 A1/A2 与已接入模块定向验证通过；manual_ui_status 全部 pending。尚未全站完成。
- 根任务：.trellis/tasks/10-14-yuanhub-pc-mobile-layered。完整目标仍为全站工程迁移。

## 真实路由覆盖

分母：44 条 records，43 条 UI 路由（42 个独立入口文件，work/editor 复用），1 条纯 redirect。/today 是 / 的 alias。feature 关闭页仍计入分母，未擅自开启。

| route/workspace | 当前入口（src/） | desktop 所有者 | mobile 所有者 | 共享业务所有者 | 状态 | 验证证据 | 阻塞及下一动作 | manual_ui_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /beta | pages/beta/index.vue | 待拆分 | 待拆分 | pages/beta/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/beta | pages/admin/beta.vue | 待拆分 | 待拆分 | pages/admin/beta.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /（alias /today） | pages/today/index.vue | components/today/today{Layout,Account,Onboarding,Lobby,Activity,Subscription}Desktop.css | components/today/today{Layout,Account,Onboarding,Lobby,Activity,Subscription}Mobile.css | pages/today/index.vue | verified_nonbrowser | B01：87 行为 + 12 Node + static/build | 无阻塞；待人工 UI | pending |
| /calendar（feature: activityCalendar） | pages/calendar/index.vue | pages/calendar/calendarPageDesktop.css + calendar/public-calendarDesktop.css + components/calendar/*Desktop.css | pages/calendar/calendarPageMobile.css + calendar/public-calendarMobile.css + components/calendar/*Mobile.css | 原页面/订阅/私人事项/建议控制器 | verified_nonbrowser | B08：307行为/183 Node/CSS/build | 原用户视图/权限/开关保持；人工UI待做 | pending |
| /calendar/suggestions/new（feature: activityCalendar） | pages/calendar/suggestion-new.vue | pages/calendar/calendarSuggestionNewDesktop.css + calendar/public-calendarDesktop.css + components/calendar/*Desktop.css | pages/calendar/calendarSuggestionNewMobile.css + calendar/public-calendarMobile.css + components/calendar/*Mobile.css | 原页面/订阅/私人事项/建议控制器 | verified_nonbrowser | B08：307行为/183 Node/CSS/build | 原用户视图/权限/开关保持；人工UI待做 | pending |
| /calendar/suggestions（feature: activityCalendar） | pages/calendar/suggestions.vue | pages/calendar/calendarSuggestionsDesktop.css + calendar/public-calendarDesktop.css + components/calendar/*Desktop.css | pages/calendar/calendarSuggestionsMobile.css + calendar/public-calendarMobile.css + components/calendar/*Mobile.css | 原页面/订阅/私人事项/建议控制器 | verified_nonbrowser | B08：307行为/183 Node/CSS/build | 原用户视图/权限/开关保持；人工UI待做 | pending |
| /admin/ledger | pages/ledger/admin.vue | pages/ledger/ledgerAdminDesktop.css + cart-workspaceDesktop.css + 组件Desktop.css | pages/ledger/ledgerAdminMobile.css + cart-workspaceMobile.css + 组件Mobile.css | 原账房/目录/方案/收据控制器 | verified_nonbrowser | B11：38行为/204 Node/CSS/build | 草稿/收据单实例/目录版本保持；人工UI待做 | pending |
| /calendar/admin（feature: activityCalendar） | pages/calendar/admin.vue | pages/calendar/calendarAdminDesktop.css + calendar/public-calendarDesktop.css + components/calendar/*Desktop.css | pages/calendar/calendarAdminMobile.css + calendar/public-calendarMobile.css + components/calendar/*Mobile.css | 原页面/订阅/私人事项/建议控制器 | verified_nonbrowser | B08：307行为/183 Node/CSS/build | 原用户视图/权限/开关保持；人工UI待做 | pending |
| /works（feature: workSystem） | pages/work/index.vue | 待拆分 | 待拆分 | pages/work/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/new（feature: workSystem） | pages/work/editor.vue | 待拆分 | 待拆分 | pages/work/editor.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/:id（feature: workSystem） | pages/work/detail.vue | 待拆分 | 待拆分 | pages/work/detail.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/:id/edit（feature: workSystem） | pages/work/editor.vue | 待拆分 | 待拆分 | pages/work/editor.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /cart | pages/tools/cart.vue | pages/tools/cartPageDesktop.css + cart-workspaceDesktop.css + 组件Desktop.css | pages/tools/cartPageMobile.css + cart-workspaceMobile.css + 组件Mobile.css | 原账房/目录/方案/收据控制器 | verified_nonbrowser | B11：38行为/204 Node/CSS/build | 草稿/收据单实例/目录版本保持；人工UI待做 | pending |
| /inventory | pages/inventory/index.vue | pages/inventory/inventoryWorkspaceDesktop.css + components/inventory/*Desktop.css/视图 | pages/inventory/inventoryWorkspaceMobile.css + components/inventory/*Mobile.css/视图 | pages/inventory/index.vue + 原奖励控制器 | verified_nonbrowser | B02–B05：真实父级/A1/A2/259行为/CSS/build | 无阻塞；人工UI待做 | pending |
| /operator | pages/operator/index.vue | pages/operator/operatorWorkspaceDesktop.css + components/operator/*Desktop.css + styles/operator-ledger-card.v*Desktop.css | pages/operator/operatorWorkspaceMobile.css + components/operator/*Mobile.css + styles/operator-ledger-card.v*Mobile.css | 原页面/功能组件控制器 | verified_nonbrowser | B06：321行为/262 Node/static/build | 无阻塞；人工UI待做 | pending |
| /recruitment（feature: recruitmentArchive） | pages/recruitment/index.vue | pages/recruitment/recruitmentRouteDesktop.css + recruitment*Desktop.css | pages/recruitment/recruitmentRouteMobile.css + recruitment*Mobile.css | 原useRecruitment/PoolEditor/交换控制器 | verified_nonbrowser | B07：231行为/118 Node/CSS/build | 原功能开关保留；人工UI待做 | pending |
| /operator/share/:token? | pages/operator/share.vue | pages/operator/operatorShareDesktop.css + components/operator/*Desktop.css + styles/operator-ledger-card.v*Desktop.css | pages/operator/operatorShareMobile.css + components/operator/*Mobile.css + styles/operator-ledger-card.v*Mobile.css | 原页面/功能组件控制器 | verified_nonbrowser | B06：321行为/262 Node/static/build | 无阻塞；人工UI待做 | pending |
| /star | pages/star/index.vue | 待拆分 | 待拆分 | pages/star/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /operator/quick | pages/operator/quick.vue | pages/operator/operatorQuickDesktop.css + components/operator/*Desktop.css + styles/operator-ledger-card.v*Desktop.css | pages/operator/operatorQuickMobile.css + components/operator/*Mobile.css + styles/operator-ledger-card.v*Mobile.css | 原页面/功能组件控制器 | verified_nonbrowser | B06：321行为/262 Node/static/build | 无阻塞；人工UI待做 | pending |
| /operator/admin | pages/operator/admin.vue | pages/operator/operatorAdminDesktop.css + components/operator/*Desktop.css + styles/operator-ledger-card.v*Desktop.css | pages/operator/operatorAdminMobile.css + components/operator/*Mobile.css + styles/operator-ledger-card.v*Mobile.css | 原页面/功能组件控制器 | verified_nonbrowser | B06：321行为/262 Node/static/build | 无阻塞；人工UI待做 | pending |
| /recruitment/admin | pages/recruitment/admin.vue | pages/recruitment/recruitmentAdminDesktop.css + recruitment*Desktop.css | pages/recruitment/recruitmentAdminMobile.css + recruitment*Mobile.css | 原useRecruitment/PoolEditor/交换控制器 | verified_nonbrowser | B07：231行为/118 Node/CSS/build | 原功能开关保留；人工UI待做 | pending |
| /admin/recruitment-access → /manage | 无 UI | n/a | n/a | routes.js | n/a | 路由源码 | 纯跳转不计 UI | n/a |
| /level/admin | pages/level/admin.vue | 待拆分 | 待拆分 | pages/level/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /demo | pages/demo/index.vue | 待拆分 | 待拆分 | pages/demo/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /promo | pages/promo/index.vue | 待拆分 | 待拆分 | pages/promo/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /install | pages/install/index.vue | 待拆分 | 待拆分 | pages/install/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /login | pages/user/login.vue | 待拆分 | 待拆分 | pages/user/login.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /register | pages/user/register.vue | 待拆分 | 待拆分 | pages/user/register.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /forgot | pages/user/forgot.vue | 待拆分 | 待拆分 | pages/user/forgot.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /forbidden | pages/user/forbidden.vue | 待拆分 | 待拆分 | pages/user/forbidden.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /user/profile | pages/user/profile.vue | 待拆分 | 待拆分 | pages/user/profile.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /manage | pages/admin/index.vue | 待拆分 | 待拆分 | pages/admin/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /feedback | pages/feedback/index.vue | feedbackMineDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | feedbackMineMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /feedback/plaza | pages/feedback/plaza.vue | feedbackPlazaPageDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | feedbackPlazaPageMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /co-creation/admin | pages/co-creation/admin.vue | coCreationAdminDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | coCreationAdminMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /co-creation | pages/co-creation/index.vue | coCreationPageDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | coCreationPageMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /feedback/manage | pages/feedback/manage.vue | feedbackManageDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | feedbackManageMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /feedback/admin | pages/feedback/admin.vue | feedbackAdminDesktop.css + feedback-workspaceDesktop.css + 功能组件Desktop.css | feedbackAdminMobile.css + feedback-workspaceMobile.css + 功能组件Mobile.css | 原页面/工单/共建控制器 | verified_nonbrowser | B09：174行为/236 Node/CSS/build | 回复/发布/流转状态保持；人工UI待做 | pending |
| /admin/roles | pages/admin/roles.vue | 待拆分 | 待拆分 | pages/admin/roles.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/audit | pages/admin/audit.vue | 待拆分 | 待拆分 | pages/admin/audit.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /changelog | pages/changelog/index.vue | pages/changelog/changelogPageDesktop.css + 正文组件Desktop.css | pages/changelog/changelogPageMobile.css + 正文组件Mobile.css | 原页面/通知/编辑器控制器 | verified_nonbrowser | B10：51行为/184 Node/CSS/build | 筛选/锚点/正文草稿保持；人工UI待做 | pending |
| /admin/changelog | pages/changelog/admin.vue | pages/changelog/changelogAdminDesktop.css + 正文组件Desktop.css | pages/changelog/changelogAdminMobile.css + 正文组件Mobile.css | 原页面/通知/编辑器控制器 | verified_nonbrowser | B10：51行为/184 Node/CSS/build | 筛选/锚点/正文草稿保持；人工UI待做 | pending |
| /notifications | pages/notifications/index.vue | pages/notifications/notificationsPageDesktop.css + 正文组件Desktop.css | pages/notifications/notificationsPageMobile.css + 正文组件Mobile.css | 原页面/通知/编辑器控制器 | verified_nonbrowser | B10：51行为/184 Node/CSS/build | 筛选/锚点/正文草稿保持；人工UI待做 | pending |
| /:pathMatch(.*)* | pages/site/not-found.vue | 待拆分 | 待拆分 | pages/site/not-found.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |

## 子工作区

| route/workspace | 当前入口（src/） | desktop 所有者 | mobile 所有者 | 共享业务所有者 | 状态 | 验证证据 | 阻塞及下一动作 | manual_ui_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /inventory 操作历史（概览/筛选/回执/分页/列表） | components/inventory/InventoryRecordsWorkspace.vue + InventoryRecordsView.vue | inventoryRecordsWorkspaceDesktop.css + InventoryRecordsDesktopView.vue | inventoryRecordsWorkspaceMobile.css + InventoryRecordsMobileView.vue | pages/inventory/index.vue | verified_nonbrowser | B02：141 行为 + CSS 编译 + build | 无阻塞；库存其余工作区仍 pending | pending |
| /inventory 抽卡资源报告 | components/inventory/ResourceBalanceReport.vue | resourceBalanceReportDesktop.css | resourceBalanceReportMobile.css | ResourceBalanceReport.vue + data/inventory/resourceBalance.js | verified_nonbrowser | B03：真实父级 resize/日期/趋势点 + CSS/build | 统计查询控件另列 pending | pending |
| /inventory 据点收获报告 | components/inventory/AcquiredPeriodReport.vue | acquiredPeriodReportDesktop.css | acquiredPeriodReportMobile.css | AcquiredPeriodReport.vue + data/inventory/acquiredStats.js | verified_nonbrowser | B03：真实父级排行/焦点 + CSS/build | 统计其余展示另列 pending | pending |
| /inventory 页面壳与工作区导航 | components/inventory/InventoryLayout.vue + InventoryWorkspaceTabs.vue | inventory{Layout,WorkspaceTabs}Desktop.css | inventory{Layout,WorkspaceTabs}Mobile.css | pages/inventory/index.vue | verified_nonbrowser | B04：220 行为 + CSS 编译 + build | 无阻塞；保留单一 slot 内容实例 | pending |
| /inventory 清单/筛选/盘点/统计查询 | pages/inventory/index.vue | inventoryWorkspaceDesktop.css | inventoryWorkspaceMobile.css | pages/inventory/index.vue | verified_nonbrowser | B05：40盘点+130历史父级行为/CSS/build | 原控制器/DOM保持；待人工UI | pending |
| /inventory 奖励/导入预览/日期弹层 | components/inventory/RewardEntryWorkspace.vue + RewardDateTimePicker.vue | reward{EntryWorkspace,DateTimePicker}Desktop.css | reward{EntryWorkspace,DateTimePicker}Mobile.css | 原两个功能组件 | verified_nonbrowser | B05：74奖励行为/父级联动/CSS/build | 唯一弹窗与日期实例；待人工UI | pending |
| /operator 图鉴/养成/规划/编辑 | pages/operator/index.vue + components/operator/ | operatorWorkspaceDesktop.css + 功能组件Desktop.css | operatorWorkspaceMobile.css + 功能组件Mobile.css | 原控制器/visitedTabs/全部功能组件 | verified_nonbrowser | B06：真实父级编辑/追踪清单/星石状态 + 原契约 | 保持功能开关；人工UI待做 | pending |
| /recruitment 时间线/卡池/记录/交换 | pages/recruitment/RecruitmentWorkspace.vue + PoolEditor/EntryEditor/RecruitmentExchange/RecruitmentTimeline | 对应recruitment*Desktop.css | 对应recruitment*Mobile.css | 原控制器及 PoolEditor | verified_nonbrowser | B07：真实行编辑/预览 resize与原排序/CAS测试 | rows/originals/orderRevision/CAS逐字保留；人工UI待做 | pending |
| /calendar 公共/个人/私人事项/三种视图 | pages/calendar/index.vue + components/calendar/ | calendar/public-calendarDesktop.css + 各局部Desktop.css | calendar/public-calendarMobile.css + 各局部Mobile.css | 原控制器/订阅编辑器 | verified_nonbrowser | B08：三视图/私人事项/订阅待办真实resize | agenda/timeline/month保持用户选择；人工UI待做 | pending |
| /star 嵌入内部（背包/计划/OCR） | pages/star/index.vue | 待核实源码 | 待核实源码 | 唯一 iframe 业务实例 | pending | 主站入口存在 | 定位真实源码与同步流程；禁止直接修改构建产物 | pending |

## B01：今日一览（L2，整体任务 L3）

- 真实入口 `pages/today/index.vue` 使用 `TodayLayout.vue` 的实际区域组合和共享受控 `TodayDataOnboarding.vue`；不引入第二套路由/请求/状态。控制器正文与 c13f501 逐字一致。
- 主区域、账号摘要、建档、值守、活动、待办的 Desktop/Mobile CSS 独立文件且媒体条件互斥；共享 SFC 样式只保留刻意公共字段外观。原值守/活动/待办 CSS 在 10 个宽度的 30 组声明投影与基线一致（源码比较，不是像素验证）。
- `npx --no-install vitest run behavior/todayComingSoon.spec.js behavior/todayLobby.spec.js behavior/todayActivitySummary.spec.js behavior/todayCalendarSubscriptions.spec.js`：87/87；新增 4 个真实父级挂载用例覆盖 390/1440 起步、767/768/981 两侧、账号草稿/确认、焦点、实例唯一和零额外读写。挂载账号管理器的测试有 router-view 缺失提示；不代表浏览器路由验收。
- `node --test test/todayPage.test.js test/todayLayoutStyles.test.js test/todayData.test.js`：12/12；外部 CSS 实际 scoped 编译、每条设备规则都有媒体归属。库存 `behavior/inventoryRecordsViews.spec.js behavior/inventoryRecordsUx.spec.js`：139/139，A1/A2 未修改。
- `npm run test:static`：600 文件、0 失败；`npm run build`：Vite/PWA/OCR 压缩成功，产物 `YuanHub/dist/`。本批不是最终全站构建；源码行为冻结后仅调整模板缩进和测试断言，无业务代码变化。
- `git diff --check` 通过；API/store/router/依赖未修改。批次日志保存于父仓忽略目录 `.test-artifacts/pc-mobile-layered/batch-01-*.log`。首批精确本地提交 `832355a`（main，27 文件）。

## B02：库存操作历史完整展示工作区（L2）

- 概览/筛选/回执/加载与错误/分页移入真实接入的 `InventoryRecordsWorkspace.vue`；Desktop/Mobile 以 640px 内容断点独立持有 CSS。列表继续使用原试点，父页唯一 A2 业务脚本除新增 import 外逐字不变。
- `npx --no-install vitest run behavior/inventoryRecordsUx.spec.js behavior/inventoryRecordsViews.spec.js`：141/141；新增两端真实报告入口与唯一 RewardEntryWorkspace 连接测试，跨 640/641/768/1081 保留未解析文本草稿及焦点，无额外读写。原确认/删除/恢复/锁归属/账号往返/卸载/迟到错误不变量全通过。
- `node --test test/inventoryRecordsWorkspaceStyles.test.js`：1/1；设备 CSS 实际 scoped 编译、媒体归属及父页专属选择器移除。迁移前后历史 CSS 在 10 个宽度的声明投影一致，含 640.5px 连续性；不代表像素验收。
- `npm run build`：Vite/PWA/OCR 产物成功，当前 `YuanHub/dist/` 含 B01+B02；`git diff --check` 通过。A1 两个列表视图及 A2 函数未修改。日志 `.test-artifacts/pc-mobile-layered/batch-02-*.log`。
- 本批仅历史子工作区验证完成；/inventory 全路由仍 pending，清单/盘点/统计/奖励内部尚需迁移。精确本地提交 `7636d30`（main，7 文件）。

## B03：库存两种报告（L1 样式归属，验证按既有关键状态扩展）

- ResourceBalanceReport 与 AcquiredPeriodReport 的真实几何/密度/容器规则分别移至 `*Desktop.css`、`*Mobile.css`，以现有 760px 图表内容断点互斥。模板和完整脚本逐字未变，唯一实例与原 cleanup 保留；共同字段外观与装饰动画刻意共享。
- `npx --no-install vitest run behavior/inventoryRecordsUx.spec.js behavior/inventoryRecordsViews.spec.js behavior/resourceBalance.spec.js behavior/acquiredPeriodReport.spec.js`：154/154。新增两端真实库存父级测试，覆盖月历日期/趋势固定点/排行金卡筛选/焦点/实例保持、450/900 SVG viewBox 和 resize 零额外请求；保留 A1/A2 全部有效断言。
- `node --test test/resourceBalance.test.js test/acquiredStats.test.js`：26/26；`node --test test/inventoryReportStyles.test.js`：1/1。两报告在 14 个宽度（含 760.5）、两种容器宽度、hover/reduced-motion 组合的 224 组源码声明投影与基线一致；该比较不能证明像素布局。
- `npm run test:static`：603 文件、0 失败；`npm run build`：Vite/PWA/OCR 产物成功；`git diff --check` 通过。日志 `.test-artifacts/pc-mobile-layered/batch-03-*.log`。精确本地提交 `2dc807c`。
- 全站计数仍为 1/43 UI 路由完整迁移；库存历史与两种报告是已验证子工作区，库存清单/盘点/筛选、统计查询及奖励内部仍待处理，不计全路由完成。

## B04：库存页面壳与工作区导航（L2；共享样式退出做相邻模块回归）

- InventoryLayout 实际持有侧栏/main/footer slot，独立双端 CSS 持有主区和 slotted 内容空间；InventoryWorkspaceTabs 持有受控 Tab 展示，沿用原键盘手动激活。当前1080px站点断点保持；resize 不替换任何业务组件。
- 库存退出 tools-workspace.css 的页面级选择器，operator/star 声明逐字不变；库存主控制器正文逐字不变，A1/A2 未修改。
- `npx --no-install vitest run behavior/inventoryRecordsUx.spec.js behavior/inventoryStockBaseline.spec.js behavior/workspaceTabs.spec.js behavior/operatorEntryDefaults.spec.js`：220/220。新增两端真实父级导航测试，验证焦点/手动激活/唯一实例/无额外读取；既有盘点、历史隔离和相邻密探行为通过。
- `node --test test/inventoryLayoutStyles.test.js`：1/1；实际 scoped/slot CSS 编译与设备媒体归属通过。`npm run build` 成功，`git diff --check` 通过；日志 `.test-artifacts/pc-mobile-layered/batch-04-*.log`。
- 本批保存标题 `refactor(inventory): 拆分页面壳与工作区导航双端布局`；整站仍1/43，库存其余真实展示继续迁移。

## B05：库存剩余清单、盘点、统计查询与奖励内部（L1 样式归属；关键状态做定向回归）

- 页面剩余实际排布/空间/密度移入 `pages/inventory/inventoryWorkspace{Desktop,Mobile}.css`；奖励弹窗与日期选择器各自有 `reward{EntryWorkspace,DateTimePicker}{Desktop,Mobile}.css`。完整模板/业务脚本逐字不变，未切换父节点，未复制副作用。站点壳以1080px、奖励内容以原767px区别归属，内部原断点保留。
- 原 inline 样式只保留刻意共享的颜色、边框/圆角、焦点外观和动效；InventoryItemName 的元素徽记是稳定共享字段契约。几何、全部字体声明及相关变量归各端。新增外部文件仍 scoped，不影响其他页面；历史试点/A1/A2未修改。
- 三个展示所有者在17个宽度（含640.5/767.5/1080.5）×pointer/reduced-motion/hover组合，共408组声明级联投影与基线一致，模板/脚本逐字比对通过；动画定义单独比对。只是源码证据，非浏览器布局验证。
- `node --test test/inventoryWorkspaceStyles.test.js`：3/3。`npx --no-install vitest run behavior/inventoryRecordsUx.spec.js behavior/inventoryRecordsViews.spec.js behavior/inventoryStockBaseline.spec.js behavior/rewardEntryWorkspace.spec.js`：259/259。新增4个两端用例，真实盘点数量草稿/保存状态/焦点、奖励预览/日期弹层实例与焦点跨断点不丢，resize零写入/额外读取。
- `npm run build` 成功；`git diff --check` 通过。日志 `.test-artifacts/pc-mobile-layered/batch-05-*.log`。本批保存标题 `refactor(inventory): 完成清单盘点与奖励双端样式归属`。库存真实路由全部工程接入，整站2/43；真实运行与视觉仍pending。

## B06：密探四入口、名册卡片与真实编辑/规划工作区（L1 样式归属；局部全局选择器退出按L2复核）

- `/operator`、`/operator/share/:token?`、`/operator/quick`、`/operator/admin` 的实际几何/密度均移至入口邻近的 Desktop/Mobile 文件，页壳以1080px归属。各自显式持有从 main.css 继承的主区/内容宽度与间距默认值，保留767/768px内容阈值及vh/dvh回退。
- 筛选、分享管理、采集复核、觉醒、星石弹窗/编辑/预设、培养清单、追踪器与所有体力规划子展示分别有双端CSS；原所有模板与完整脚本逐字不变，visitedTabs/草稿/CAS/请求/清理仍为原唯一所有者。ButterflyIcon、OperatorAvatar、ShareCardStats 保留为刻意共享的图标/头像/字段契约。
- 名册v1/v2/v3继续原层叠顺序，三代样式的几何各自拆分640px两端，公共文件仅持有外观；两真实调用页均接入。库存与密探均已退出全局工具导航选择器，星石规则保持语义等价。清除与外层归属矛盾的媒体块减少136109字节无效CSS；22个展示所有者共2992组宽度/媒体声明投影一致（在显式继承默认值加入前），不是视觉证据。
- `npx --no-install vitest run behavior/operator*.spec.js behavior/growthPlan*.spec.js behavior/workspaceTabs.spec.js`：321/321（19文件）。新增10个两端真实编辑/快捷录入/公开筛选/追踪清单/星石弹窗用例，保留草稿、焦点、唯一实例，resize无额外读写。旧账号隔离/迟到结果/觉醒与库存联动测试全部保留。
- 受影响Node契约182/182，新增设备样式真实引用/互斥媒体/scoped编译检查80/80，共262/262。`npm run test:static`：610文件0失败；最终样式精简及显式默认值后仅需重跑受影响CSS检查与生产构建，均成功。已有样式契约改为跟随真实style src读取，未削弱字段、层级和布局断言。源码检查和jsdom不等于浏览器验收。
- `git diff --check` 通过；日志 `.test-artifacts/pc-mobile-layered/batch-06-*.log`。本批保存标题 `refactor(operator): 完成密探四入口与编辑规划双端布局归属`。完整路由6/43，剩余路由仍pending；API/store/router/依赖均未改动。

## B07：招募真实工作区与管理员目录（L1样式归属；保留关键写入回归）

- 路由登录/关闭入口、真实RecruitmentWorkspace、时间线、PoolEditor、EntryEditor、备份交换、练习及教程展示、管理员目录共10个SFC有独立双端CSS；页面主区/内容空间以1080px、卡池以699px、录入以430px、其他内容以767px归属。默认关闭教程/功能开关保持；所有模板/脚本逐字不变。
- 1360组宽度与媒体声明投影和基线一致，继承main/wrap的默认值另按main.css明确归本页持有；删除无效媒体块4387字节，不是视觉验收。
- `node --test test/recruitment*.test.js test/pcMobileStyleOwnership.test.js test/overlayLayering.test.js`：118/118。`npx --no-install vitest run behavior/recruitment*.spec.js`：231/231。新增4个两端用例覆盖真实父级行草稿/顺序/焦点/唯一编辑器、导入文件/预览/焦点；resize无额外请求或写入。
- 首次行为测试3条旧文案断言失败；临时使用d956db0原始组件与原始测试复跑，55项中同样3条失败。更新回执、未保存数量、保存按钮文案/禁用状态的断言，保留草稿、顺序、数据与命令次数；没有为迎合旧测试恢复废弃UI。临时基线文件已清除，原始失败日志保留。
- `npm run build` 成功、`git diff --check` 通过；日志 `.test-artifacts/pc-mobile-layered/batch-07-*.log`。密探本批提交补记 `d956db0`。本批保存标题 `refactor(recruitment): 分离招募与记录编辑双端展示`。完整路由8/43，人工UI仍pending。

## B08：日历四入口与全部日历展示（L1样式归属；按私人数据和订阅风险回归）

- 公共/个人日历、建议提交/记录、管理员入口各自有双端CSS与显式main/wrap空间；calendar.css/public-calendar.css保留公共外观，实际布局与密度移入对应Desktop/Mobile文件。保持原全局calendar命名空间服务子视图与Teleport弹层，实际SFC外部样式引用替代原CSS import；全局规则逐条检查命名空间与设备媒体归属。
- 筛选抽屉、私人事项与管理导入弹窗各自scoped双端CSS；全部7个模板逐字不变，业务脚本仅移动CSS import，无状态/请求/校验/权限变更。agenda/timeline/month仍是原用户选择，共享功能组件由上述独立模块CSS持有真实排布，没有六套业务实例。
- 局部7个展示952组、共享样式272组声明投影与原源码一致；默认壳值另按main.css接回。`node --test test/pcMobileStyleOwnership.test.js test/activityCalendar*.test.js test/calendarPrivateItems.test.js test/overlayLayering.test.js`：183/183。
- `npx --no-install vitest run behavior/activityCalendar*.spec.js behavior/calendarPrivateItems*.spec.js`：307/307（20文件）。新增10个两端用例，三个用户视图的URL/实例/焦点不重置，私人事项标题/日期/备注和订阅待办脏草稿保持，resize无额外读写；原账号隔离/迟到结果/权限与契约检查保留。部分直接挂载测试保留Router缺少活动路由提示，不代表真实运行错误。
- `npm run build`、`git diff --check`成功；日志 `.test-artifacts/pc-mobile-layered/batch-08-*.log`。招募提交补记 `6ec309d`；本批保存标题 `refactor(calendar): 隔离日历视图与私人事项双端布局`。完整路由12/43，人工UI仍pending。

## B09：反馈与共建六入口、工单与公开展示（L1样式归属；按现有权限/草稿流程回归）

- 六入口与工单列表/详情/导航、合并/发布/版本选择、广场卡片/详情/管理、相似反馈、开发目标展示共19个SFC有独立双端CSS。原模板与控制器保留，页面仅把CSS import改成实际style src引用；SupportButton与类型/状态徽记是刻意共享字段契约。
- feedback-workspace共享外观保留，几何/密度拆成Desktop/Mobile；保留原feedback命名空间及反馈管理员专用access-modal例外（已核对唯一调用），不会借scoped改变原子组件/Teleport样式覆盖。各页独立持有原1320px内容宽度、手机18px与平板32px空间。
- 局部2584组、共享样式136组声明投影与基线一致；删除矛盾媒体块6944字节。`node --test test/feedback*.test.js test/coCreationContract.test.js test/pcMobileStyleOwnership.test.js test/overlayLayering.test.js test/responsiveViewport.test.js`：236/236。
- `npx --no-install vitest run behavior/feedback*.spec.js behavior/coCreation.spec.js`：174/174（7文件）。新增6个两端真实父级用例验证我的/管理工单回复草稿、焦点、详情实例，公开标题/摘要/发布面板保持；resize无额外读写。气泡对齐原源码断言改为分别检查两端文件，未弱化权限/附件/内部信息隔离与草稿断言。
- `npm run build`、`git diff --check`成功；日志 `.test-artifacts/pc-mobile-layered/batch-09-*.log`。日历提交补记 `7007932`；本批保存标题 `refactor(feedback): 拆分反馈共建与工单双端展示`。完整路由18/43，真实浏览器视觉仍pending。

## B10：通知与更新日志三入口（L1样式归属；保留通知与编写保护回归）

- 三页面、正文与关联反馈共5个展示所有者各自接入双端CSS；main/wrap空间由页面以1080px显式持有，内容组件以767px归属。模板/脚本逐字不变，未改通知状态、锚点分页、富文本或审核权限。
- 680组源码声明投影与基线一致，删除矛盾媒体块602字节。`node --test test/changelog.test.js test/notifications.test.js test/pcMobileStyleOwnership.test.js test/overlayLayering.test.js`：184/184。
- `npx --no-install vitest run behavior/changelog*.spec.js behavior/notification*.spec.js`：51/51。新增6个两端真实父级用例，未读筛选、正文展开/版本锚点、编辑标题/正文/选区/焦点与唯一实例跨断点保持，resize无额外读写或定位。实例断言使用Vue内部实例，避免测试工具代理包装身份变化。通知旧链接用例仍有jsdom不支持真实导航提示。
- `npm run build`、`git diff --check`成功；日志 `.test-artifacts/pc-mobile-layered/batch-10-*.log`。反馈提交补记 `974a575`；本批保存标题 `refactor(changelog): 分离通知与日志双端展示`。完整路由21/43，真实UI待人工验收。

## B11：账房与公共目录管理（L2，全局专用选择器退出）

- 两入口与礼包卡、收据、收据工作区、方案保存/列表共7个SFC独立接入双端CSS；页面1080px，收据1180px，内容640/767px保留。所有模板/控制器逐字不变；原Teleport单收据与媒体监听保持，未新增业务实例。
- main.css中120条账房专用规则按原媒体/顺序精确迁出至cart-workspace外观与两端几何，测试检查原专用命名空间。通用按钮/模态框/步进器保留为刻意共享基础控件（自定义礼包使用原模态表单契约），不复制逻辑或改变录入流程。952局部+136全局源码投影一致；删除矛盾媒体块2320字节。
- `npx --no-install vitest run behavior/cart*.spec.js behavior/ledger*.spec.js`：38/38。新增4个两端用例保留方案名/焦点/清单总额/收据实例、管理员字段/版本上下文，跨断点零写入；原方案快照、存档与账号隔离断言保留。
- `node --test test/cartBudget.test.js test/ledgerCatalog.test.js test/pcMobileStyleOwnership.test.js test/overlayLayering.test.js test/responsiveViewport.test.js`：204/204。原viewport断言跟随真实模块样式；以PostCSS父媒体检查代替会跨文件误匹配的正则，并补实际1180px底部留白检查。
- `npm run build`、`git diff --check`成功；日志 `.test-artifacts/pc-mobile-layered/batch-11-*.log`。通知/日志提交补记 `a907933`；本批保存标题 `refactor(ledger): 隔离账房与方案收据双端布局`。完整路由23/43，人工UI仍pending。

下一动作：作业广场、详情、新建/编辑与兼容性展示。
