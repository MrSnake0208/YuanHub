# PC/Mobile 迁移进度（唯一台账）

## 当前检查点

- 起点：主前端 main@c13f501；staged/unstaged/untracked 均为空。根仓 unrelated dirty 不属于本任务。
- 前置成果：库存受控双视图与 A1 独立 CSS、A2 写入完成上下文保护已在 HEAD，需本轮定向复核；历史测试数字不作本轮证据。
- 当前：今日一览 verified_nonbrowser（1/43 UI 路由）；库存历史试点相关 139 项本轮通过；manual_ui_status 全部 pending。尚未全站完成。
- 根任务：.trellis/tasks/10-14-yuanhub-pc-mobile-layered。完整目标仍为全站工程迁移。

## 真实路由覆盖

分母：44 条 records，43 条 UI 路由（42 个独立入口文件，work/editor 复用），1 条纯 redirect。/today 是 / 的 alias。feature 关闭页仍计入分母，未擅自开启。

| route/workspace | 当前入口（src/） | desktop 所有者 | mobile 所有者 | 共享业务所有者 | 状态 | 验证证据 | 阻塞及下一动作 | manual_ui_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /beta | pages/beta/index.vue | 待拆分 | 待拆分 | pages/beta/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/beta | pages/admin/beta.vue | 待拆分 | 待拆分 | pages/admin/beta.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /（alias /today） | pages/today/index.vue | components/today/today{Layout,Account,Onboarding,Lobby,Activity,Subscription}Desktop.css | components/today/today{Layout,Account,Onboarding,Lobby,Activity,Subscription}Mobile.css | pages/today/index.vue | verified_nonbrowser | B01：87 行为 + 12 Node + static/build | 无阻塞；待人工 UI | pending |
| /calendar（feature: activityCalendar） | pages/calendar/index.vue | 待拆分 | 待拆分 | pages/calendar/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /calendar/suggestions/new（feature: activityCalendar） | pages/calendar/suggestion-new.vue | 待拆分 | 待拆分 | pages/calendar/suggestion-new.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /calendar/suggestions（feature: activityCalendar） | pages/calendar/suggestions.vue | 待拆分 | 待拆分 | pages/calendar/suggestions.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/ledger | pages/ledger/admin.vue | 待拆分 | 待拆分 | pages/ledger/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /calendar/admin（feature: activityCalendar） | pages/calendar/admin.vue | 待拆分 | 待拆分 | pages/calendar/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /works（feature: workSystem） | pages/work/index.vue | 待拆分 | 待拆分 | pages/work/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/new（feature: workSystem） | pages/work/editor.vue | 待拆分 | 待拆分 | pages/work/editor.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/:id（feature: workSystem） | pages/work/detail.vue | 待拆分 | 待拆分 | pages/work/detail.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /work/:id/edit（feature: workSystem） | pages/work/editor.vue | 待拆分 | 待拆分 | pages/work/editor.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /cart | pages/tools/cart.vue | 待拆分 | 待拆分 | pages/tools/cart.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /inventory | pages/inventory/index.vue | 待拆分 | 待拆分 | pages/inventory/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /operator | pages/operator/index.vue | 待拆分 | 待拆分 | pages/operator/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /recruitment（feature: recruitmentArchive） | pages/recruitment/index.vue | 待拆分 | 待拆分 | pages/recruitment/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /operator/share/:token? | pages/operator/share.vue | 待拆分 | 待拆分 | pages/operator/share.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /star | pages/star/index.vue | 待拆分 | 待拆分 | pages/star/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /operator/quick | pages/operator/quick.vue | 待拆分 | 待拆分 | pages/operator/quick.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /operator/admin | pages/operator/admin.vue | 待拆分 | 待拆分 | pages/operator/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /recruitment/admin | pages/recruitment/admin.vue | 待拆分 | 待拆分 | pages/recruitment/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
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
| /feedback | pages/feedback/index.vue | 待拆分 | 待拆分 | pages/feedback/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /feedback/plaza | pages/feedback/plaza.vue | 待拆分 | 待拆分 | pages/feedback/plaza.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /co-creation/admin | pages/co-creation/admin.vue | 待拆分 | 待拆分 | pages/co-creation/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /co-creation | pages/co-creation/index.vue | 待拆分 | 待拆分 | pages/co-creation/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /feedback/manage | pages/feedback/manage.vue | 待拆分 | 待拆分 | pages/feedback/manage.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /feedback/admin | pages/feedback/admin.vue | 待拆分 | 待拆分 | pages/feedback/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/roles | pages/admin/roles.vue | 待拆分 | 待拆分 | pages/admin/roles.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/audit | pages/admin/audit.vue | 待拆分 | 待拆分 | pages/admin/audit.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /changelog | pages/changelog/index.vue | 待拆分 | 待拆分 | pages/changelog/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /admin/changelog | pages/changelog/admin.vue | 待拆分 | 待拆分 | pages/changelog/admin.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /notifications | pages/notifications/index.vue | 待拆分 | 待拆分 | pages/notifications/index.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |
| /:pathMatch(.*)* | pages/site/not-found.vue | 待拆分 | 待拆分 | pages/site/not-found.vue | pending | 路由实际导入 | 按模块实施；无已确认外部阻塞 | pending |

## 子工作区

| route/workspace | 当前入口（src/） | desktop 所有者 | mobile 所有者 | 共享业务所有者 | 状态 | 验证证据 | 阻塞及下一动作 | manual_ui_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /inventory 操作历史（概览/筛选/回执/分页/列表） | components/inventory/InventoryRecordsWorkspace.vue + InventoryRecordsView.vue | inventoryRecordsWorkspaceDesktop.css + InventoryRecordsDesktopView.vue | inventoryRecordsWorkspaceMobile.css + InventoryRecordsMobileView.vue | pages/inventory/index.vue | verified_nonbrowser | B02：141 行为 + CSS 编译 + build | 无阻塞；库存其余工作区仍 pending | pending |
| /inventory 清单/筛选/盘点/统计/奖励 | pages/inventory/index.vue | 待拆分 | 待拆分 | pages/inventory/index.vue | pending | 真实父级模板 | 分稳定子区迁移；保护编辑草稿 | pending |
| /operator 图鉴/养成/规划/编辑 | pages/operator/index.vue | 待拆分 | 待拆分 | pages/operator/index.vue | pending | 实际路由 | 保持 visitedTabs 与编辑器实例 | pending |
| /recruitment 时间线/卡池/记录/交换 | pages/recruitment/index.vue | 待拆分 | 待拆分 | 原控制器及 PoolEditor | pending | 实际路由 | 保护 rows/originals/orderRevision/CAS | pending |
| /calendar 公共/个人/私人事项/三种视图 | pages/calendar/index.vue | 待拆分 | 待拆分 | 原控制器/订阅编辑器 | pending | 实际路由 | agenda/timeline/month 是用户选择，不随设备重置 | pending |
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
- 本批仅历史子工作区验证完成；/inventory 全路由仍 pending，清单/盘点/统计/奖励内部尚需迁移。精确本地提交标题 `refactor(inventory): 分离历史工作区双端布局`。

下一动作：拆分 ResourceBalanceReport/AcquiredPeriodReport 的真实双端样式职责，保持月历/趋势/选中日期/tooltip 等局部状态与统计父级实例稳定；之后处理库存清单与录入。
