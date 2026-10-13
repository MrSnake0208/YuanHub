# PC/Mobile 分层展示：当前有效决策（方案 B）

2026-10-14 用户通过根目录 `YUANHUB-PC-MOBILE-GOAL.md` 授权全站实施。本文替代旧 [试点 ADR](responsive-view-boundaries-adr-20261013.md) 与 [Phase 2 复盘](responsive-pilot-review-phase2-20261013.md) 中“暂停扩面/等待确认/只做文档”的阶段范围；其历史证据与无关安全约束仍保留。

固定为一个 Vue/Vite 应用、一套路由、共享业务核心。稳定控制层拥有身份、权限、请求、草稿、筛选、计算、写入与清理。两端拥有实际布局、密度、顺序与专属 CSS；稳定字段和功能组件可以共享。

简单工作区采用稳定 DOM 组合：真实布局组件声明区域和 slot，desktop/mobile 样式分文件且由互斥媒体条件限制，各端的完整布局不依赖对方文件。公共样式仅保留刻意共享的外观/字段语义，不承载整页双端排布。这样 resize 无需切换 Vue 父组件，保留编辑器、details、焦点和订阅实例。需要不同 DOM 的复杂区沿用库存的受控双视图，择一挂载并由稳定宿主持有完整状态。不能用两个空壳嵌套旧巨型页面代替职责拆分。

首个模块“今日一览”的页面控制器保留在 `src/pages/today/index.vue`；布局和共享建档内容分别由 `TodayLayout.vue`、`TodayDataOnboarding.vue` 承接。两端样式位于同目录的 `*Desktop.css` 与 `*Mobile.css`，现有值守、活动和待办功能组件保持单实例。

保留现有外观与录入流程，不恢复教程，不升级依赖，不以 UA 判定布局，不擅改开关或鉴权。库存 A1 专属样式及 A2 generation/disposed/锁归属是后续迁移不变量。

唯一覆盖表与当前检查点见 [迁移进度](pc-mobile-migration-progress.md)。必要非浏览器验证由 Agent 执行，真实视觉/触控/软键盘由用户人工验收，二者分开计状态。
