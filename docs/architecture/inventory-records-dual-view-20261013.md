# 03：库存操作历史局部双视图

用户选择 A 后，按 [ADR 局部修订](responsive-view-boundaries-adr-20261013.md) 实施。风险 **L2**：局部 DOM、matchMedia 生命周期与焦点/滚动行为改变；没有业务 API、鉴权、路由、存储或后端变化。结构性 UI 风险使用完整视口矩阵验证，不因此扩大至其它库存工作区。

## 基线与实现边界

父仓库为 `master@cd1d4a29af258ca3ccd414db34f8bf5159ae3c59`，原有大量未提交工作未触碰。前端由先前观察的 `5a4d7ce` 更新至干净的 `main@56a6666356ded6548424b9f49dd932f310a1df9b`；该提交已包含任务 02 删除确认修复。其它登记 worktree 未使用，前端仍在原工作区开发。只复用当前工作区 PID 19999 的 5173 服务，没有启动、停止或重启开发服务。

父页保留 tabpanel 的 id/role/aria/v-show、摘要/报告入口、筛选、加载/错误/重试、游标分页、删除确认/撤销通知、账号上下文、所有请求/订阅与盘点/奖励草稿。对比 HEAD 的 script，除一个视图 import 外完全相同；任务 02 的 generation/disposed 校验和流水重放调用链均保留。

`InventoryRecordsView` 是稳定的展示宿主：只持布局模式、详情展开与 DOM 焦点/滚动锚点，不拷贝 records、不加载网络、不导入 API/Store/router/dialog。父页通过严格 props 和异步删除 callback 传入原记录/状态/格式化函数；子视图 emit 删除意图。`max-width:640px` 沿用当前历史内容的断点，和 1080px 网站导航断点独立。初始同步 matches，挂载后再次同步，卸载清理同一监听；同一模式 resize 不重建列表，跨模式只替换展示子组件。

桌面维持原 ul/li 卡片、字段顺序、色彩与侧边删除。手机独立 DOM 优先时间、类型、项目摘要与库存状态，原生 details/summary 内放来源、体力、完整 ID 和删除；升级消耗保留不可单独删除规则。两端共享必要 scoped 样式与纯展示标签映射，未知类型明确标记；缺少时间/明细有 fallback。长 ID 从省略变为完整换行，因此桌面极长 ID 的卡片高度可能增加；这是可访问字段的有意变化。

## 定向自动化

修改前复跑任务 02 四文件基线：**72/72，exit=0**。修改后命令（在 `YuanHub/`）：

```bash
npm run test:behavior -- behavior/inventoryRecordsUx.spec.js behavior/inventoryRecordsViews.spec.js behavior/inventoryStockBaseline.spec.js behavior/workspaceTabs.spec.js behavior/mobileHeader.spec.js
npm run build
git diff --check
```

最终结果：**112/112 用例通过（5 文件），build exit=0，diff 无空白错误**。新增文件另外通过 no-index whitespace 检查。build 包括 PWA 与 OCR 预压缩校验，不表示真实部署验收；没有运行全量测试/lint。

| 来源/风险 | 直接证据 |
| --- | --- |
| 父页接入、已有筛选/分页/错误/账号/删除恢复 | 原历史行为套件在 1440 与 390px 各运行一次，共 50 项；没有 stub 新展示边界。两个布局均覆盖迟到响应/确认、空账号、卸载、失败重试与消耗记录 |
| 独立视图与稳定宿主 | 新增 15 项：8 个初始宽度、同步/cleanup、独占视图、同模式节点保持、展开与焦点、未知/缺字段/disabled、确认中不抢焦点及只读/忙碌回退 |
| 盘点与真实奖励草稿 | 复用原 `inventoryStockBaseline` 38 项，包括真实奖励工作台草稿和保存中 resize；本次没有搬动编辑器 |
| Tab/导航 | 复用 `workspaceTabs` 7 项及 `mobileHeader` 2 项，未改其实现或测试 |
| CSS 溢出、焦点像素可达性 | 下节真实 Chromium 合成矩阵；jsdom 不能证明几何/触控 |

## 浏览器证据与回归修复

已授权的 Playwright CLI 使用全新独立会话，从 about:blank 开始；所有 API 与身份为合成 fixture，未知 API/写入和外部资源 fail closed。没有读取用户浏览器、真实凭证或数据库。删除/恢复只在脚本内存数据上执行各一次。

**最终 Chromium 回放通过：19 组几何采样、18 张截图，findings=[]、runtimeErrors=[]，模拟写入共 2 次。** 包含 320/390/430/768/1024/1440、639/640/641、1079/1080/1081 与 844×390 横屏；长摘要/来源/ID、未知类型与缺字段另在六个主视口采样。每组只有一份历史列表，页面 scrollWidth 等于 viewport width，展开后删除按钮中心命中可达。390 折叠态与任务 02 的 1440 截图亦已人工查看；没有进行像素差分或正式字体比较。

行为回放覆盖筛选 reset、分页终止、刷新/首次错误恢复、账号 A→B→A、取消零写入、删除/恢复、确认框 Tab/Esc 与跨视图焦点、分页第二条记录的焦点/滚动可见性。纯 resize 的 API 请求与合成 SSE opened/closed 增量均为零。实际账号事件与重连仍由原应用代码处理，本次未改变其语义。

定向失败及修复如实保留：

1. 原有限 SSE fulfill 导致客户端每秒重连及 180ms 库存刷新，干扰 resize 的请求断言。trace 证明来源后，夹具改为可 abort 的持续合成 ReadableStream，并独立记录 opened/closed；应用 SSE 代码未改。
2. 无空格长来源曾使手机详情 Grid 撑至 2776px，320/390/430 下删除移出视口。只补 `minmax(0,1fr)` 和详情换行/收缩约束；保留失败 JSON，最终同场景通过。浏览器脚本现在会因任何 geometry/request finding 明确失败。
3. 跨视图恢复第二条记录焦点后，目标曾位于视口外。保留记录锚点后，仅当目标仍出界时滚入视口；同一分页场景回放通过。禁用/只读记录回退至同一可编程聚焦的 li。
4. Playwright setViewportSize 不保证 matchMedia/Vue 已提交渲染；即时 count 曾观察到上一视图。夹具改为等待实际匹配视图及单一列表，不用固定 sleep，也不更改应用断点/渲染语义。

任务 02 的旧 44px 统一阈值已不属于当前规范。脚本继续记录所有按钮/summary 尺寸，并检查实际命中/可见性，不将既有 32px 筛选等误报为新的统一尺寸违规；没有机械放大其它控件。

合成证据保存在 Git 忽略的 `.ux/audits/inventory-records-dual-view-20261013/`：`vitest.log`、`build.log`、最终 `browser-final-evidence.log`/`browser-results.json`、失败日志/`browser-results-before-wrap-fix.json` 及截图。最终 trace 为 `.playwright-cli/traces/trace-1791903205350.trace`；先前调试 trace 不作最终证据。最终源码 UX 审查为 `.ux/audits/usability-20261013-145421.md`（static，报告/index 与写入范围校验通过），不替代真实手机验收。这些产物不能随源码提交。

需要复跑本任务时，先确认 5173 仍属于当前工作区；以下需当前任务有明确浏览器授权：

```bash
mkdir -p .ux/audits/inventory-records-dual-view-20261013
npx --no-install playwright cli -s=inventory-dual-check open about:blank --browser=chrome
npx --no-install playwright cli -s=inventory-dual-check run-code --filename=test-support/inventoryRecords.browser.js
npx --no-install playwright cli -s=inventory-dual-check close
```

## 人工边界与交付

最小人工验收（合成或获准可丢弃数据，禁止用手工生产记录验收删除）：

1. 手机进入 `/inventory` → 操作历史 →「记录详情与操作」，确认长 ID/来源完整可读，取消删除后入口仍可操作；桌面保留侧边删除。
2. 保留奖励或盘点草稿，在 390/768/1440 及横屏切换，确认草稿、筛选、分页与未完成确认保留；已加载第二条仍可聚焦/滚动到达。
3. 真实 iOS/Android 检查单手触控、系统键盘、动态地址栏、Safe Area 与屏幕阅读器。Chromium 模拟和组件测试不证明这些体验。

未测：真实后端权限/登录/事务/库存重放、真实 SSE/超时/401、正式字体加载、完整主题/放大矩阵和真实手机。没有新增 Store/API/路由、升级依赖或改其它模块；没有 commit/push/PR/deploy。Git commit 仍须单独授权。

本任务源码/测试/文档精确清单：

```text
src/pages/inventory/index.vue
src/components/inventory/InventoryRecordsView.vue
src/components/inventory/InventoryRecordsDesktopView.vue
src/components/inventory/InventoryRecordsMobileView.vue
src/components/inventory/inventoryRecordsView.js
src/components/inventory/inventoryRecordsView.css
behavior/inventoryRecordsUx.spec.js
behavior/inventoryRecordsViews.spec.js
test-support/inventoryRecords.browser.js
docs/architecture/responsive-view-boundaries-adr-20261013.md
docs/architecture/inventory-records-dual-view-20261013.md
```
