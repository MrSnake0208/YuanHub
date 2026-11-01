# 顶部与短视口导航可达性：开发期记录

## 范围与基线

- 主反馈：`rpt_4c0c7e778f27dbe6`。通过授权反馈详情及附件入口查看了 beta.24（`b4dfd27`）原截图；截图显示移动抽屉顶部被截断，页面背景对应库存。缺少设备、缩放、键盘与独立显示状态，原设备问题未复现，不能认定 safe-area 是根因。
- 前端：`YuanHub` / `main`，原基线 `ee68e01c4d538376b53365c165226ae4a194b87b`，开始时暂存、未暂存与未跟踪均为空。`VERSION=0.0.8`，已包含 0.0.7；保留现有导航和 iOS 输入字号修复。
- 后端：`BackEndV3-Share` / `main`，基线 `5321fcd253ab95970197303be17183d5c8351c70`，无修改。父工作区：`master` / `717ed112dcf4748ef8aed2bf43fdc2b117e509f8`，原有 dirty worktree 未纳入本次提交。
- 复用 5173/8080 服务，未重启。前端运行时版本为 0.0.8，启动时注入的 commit 仍为 `05cc0ae`；Vue/CSS 经现有 Vite 服务读取当前源码，几何检查已反映本次修改。
- 风险 L1：仅组件内短桌面视口 CSS，不改路由、权限、共享状态、持久化或业务逻辑。完成本地提交后状态为「开发完成·待集中回归」，不是最终验收通过。

## 复现与最小修复

Chromium，公开 `/feedback/plaza`，1152×312 CSS px，页面滚动起点 0、无键盘、普通浏览器模式；注入代表现有桌面更新提示条的 53px 合成节点。该尺寸也可作为 1440×390 窗口在 125% 缩放时布局空间减少的近似样本，**不等于真实浏览器缩放测试**。

固定侧栏中的品牌、内边距和账号底部占用高度，加上更新条把侧栏顶部下移，使 `flex:1;min-height:0` 的主导航压到 **0px**，导航按钮仍为 44px。更新条还会遮挡向上弹出的“更多”。这是当前可复现的独立可达性缺陷，不能反推为旧截图的确定根因。

仅在桌面高度 ≤480px 时允许侧栏整体内部滚动，品牌与主导航不收缩，“更多”改为流内展开；首末入口及账号可滚动到达。手机抽屉及正常桌面布局继续使用已有模式。

受影响文件：`src/components/IslandSidebar.vue`；精确浏览器回归 `test-support/sidebarReachability.browser.js`；相关说明 `docs/standards/responsive-development.md` 与本记录。跨功能依赖仅为各页面使用的同一个侧栏及版本更新条；未修改日历完成状态。

## 已执行的开发期检查

- 浏览器回归脚本修改前失败：`Navigation collapsed: {"height":0,"itemHeight":44}`；修改后通过：主导航内容高度 320px、单项 44px，首末导航、更多首末项、账号、版本入口可达，Escape 恢复焦点，无页面横向溢出。
- 同脚本检查 844×390 横屏抽屉：顶部关闭、首末导航和账号可达；关闭后 `scrollY=100` 保持、滚动锁解除、焦点返回菜单按钮。
- 390×844、1440×900 公开反馈广场几何检查：无整页横向溢出，手机抽屉头尾及正常桌面品牌/账号区在视口内。1440×480/481 检查确认仅前者启用整体侧栏滚动。
- 使用 `@vue/compiler-sfc` 对修改 SFC 的 script/template/scoped style 定向编译，并解析浏览器脚本：0 errors。`git diff --check` 无错误；这不等同于完整 build/测试通过。
- 真实访问 `/recruitment`、`/operator`、`/calendar`、`/feedback` 均转到 `/login?redirect=…`。当前无已配置的隔离测试账号，未篡改权限、注入登录状态或将合成布局当作业务页验收。

本机未安装 Playwright WebKit 引擎，Safari 与真实 iPhone/PWA 未验证；未安装浏览器、切换服务或访问业务数据库。

## 待集中回归清单

用户开启本批次回归后，在 `YuanHub` 执行：

```bash
npm run test:behavior -- behavior/islandSidebar.spec.js behavior/mobileHeader.spec.js
node --test test/responsiveViewport.test.js test/navigationFallback.test.js
node ../node_modules/playwright/cli.js cli -s=sidebar-reachability open http://127.0.0.1:5173/feedback/plaza --browser=chrome
node ../node_modules/playwright/cli.js cli -s=sidebar-reachability run-code --filename=test-support/sidebarReachability.browser.js
node ../node_modules/playwright/cli.js cli -s=sidebar-reachability close
```

1. 使用有正常权限的隔离账号访问招募、密探、日历、个人反馈；390px、768/1024px、1440px，另含横屏/短窗和 480/481px 边界。导航项目较多的管理身份也要覆盖，确认返回、顶部主要动作、账号入口、首末导航、Tab 焦点可见，无横向溢出。
2. 浏览器真实 100%/125% 缩放，分别有/无更新提示条；滚动页面、展开更多及抽屉、关闭弹窗，检查滚动位置/滚动能力恢复。当前脚本仅覆盖公开页的精确几何与抽屉关闭状态，不覆盖全部业务弹窗。
3. 可用的真实 Safari、Chromium；真实 iPhone 聚焦输入前/后及键盘收起后记录 `visualViewport.scale/height` 和元素边界；Safari 普通标签与 PWA 独立模式分别检查。桌面模拟不得视为原生验收。
4. 本文件命令只覆盖本反馈，不证明整个批次。集中回归先记录批次前后端完整基线及全部 commit，合并其它已提交功能的用例；不得仅以最后一个任务的 smart 结果结单。

未改反馈状态。历史 `rpt_a5abdcf234b3cb9c` / `rpt_b048056708b0e7d4` 仅作回归参考；已确认正常的 `rpt_23daf794763738c7` 不作为当前白屏 BUG。

## 主反馈回访建议

请用户更新至 0.0.8 或之后，记录具体页面、设备/系统/浏览器版本、页面缩放，说明是在浏览器标签还是桌面 PWA、键盘是否打开；若顶部仍被截断，请提供带浏览器边界的完整截图，并说明收起键盘或重开导航后是否恢复。回访确认前保持「待回归/待用户确认」，不直接结单。
