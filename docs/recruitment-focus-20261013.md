# 2026-10-13 招募编辑焦点与手机/平板布局

开发交付记录，待用户主动开启集中回归；最终验收、线上反馈和滴答状态均未结单。风险 L2，verification_owner=user：局部焦点与响应式布局，共享模态工具新增默认关闭的可选项，仅 PoolEditor 启用；未改 API、鉴权、持久化或排序协议。

## 基线与范围

| 仓库 | 分支 | 开始时 HEAD | 本次变更 |
| --- | --- | --- | --- |
| YuanHub-All | master | 717ed112dcf4748ef8aed2bf43fdc2b117e509f8 | 无，预存修改保留 |
| YuanHub | main | b8aa15a57adc6ce0ed6fa99f090e507ca5b1fa8f | UI、焦点工具、测试及本文；提交 Hash 见交付答复/本文件 Git 历史 |
| BackEndV3-Share | main | 5321fcd253ab95970197303be17183d5c8351c70 | 无 |

- `rpt_f01bf3621743896c`：合成案例复现取消/完成/删除焦点丢位；普通关闭未复现原手机跳动，新增离屏入口关闭检查。默认保底 40 建议留待后续，本次未实施。
- `rpt_22b71827501ad99b`：尚无原截图，仅提供大量同名、长名字的合成平板对照，不能认定精确复现原设备；UP 比例统计为剩余新需求。
- `rpt_565261e4973a27cb`：历史插入/排序已有实现，进入集中回归，不新建 API 或拖拽依赖。

## 实施计划与结果

1. 检查 Workspace、Timeline、模态栈、错误摘要、visualViewport 监听与清理、父级更新及两视图；用 18 个卡池、90 条重复密探记录和长名字测量 scrollY、弹窗 scrollTop、activeElement。
2. 模态栈独占关闭恢复；单条操作保存入口 ID/屏幕位置，取消/完成回原项、删除回邻项；preventScroll 后仅按需滚动编辑容器。避让扣除头尾栏，并限定当前录入控件，避免错误摘要和嵌套确认被抢焦点。
3. 密探卡片最小宽度由 80px 调至 104px；名字由 11px 单行省略改为 13px 换行，文字入口至少 44px 高；动作可换行，选择列表按容器宽度排列并保留内部滚动，筛选/取消高度补至 44px。

没有增加 Workspace 关闭 watcher、批量 blur、全局禁焦点或 body 锁。模态新增选项默认 false，返回启用该选项的父层时沿用禁止隐式滚动的意图。保留历史全量读取、完整 ordered_event_ids、revision 校验、过期草稿核对、一次性保存新增/删除/排序/保底、失败保留输入与回执读回；未知保底仍未知，不默认填 40、不跨池继承。Node 规则、后端、账号与卡池入口、教程开关均未改。

## 开发期证据

Playwright CLI 复用现有 5173 Vite，挂载真实 Timeline/PoolEditor/AppDialog 与合成数据，无真实保存接口写入。截图只在忽略目录 `.ux/audits/recruitment-{baseline|development}-{width}.png`，不提交。

| 宽度 | 修复前 | 修复后 |
| --- | --- | --- |
| 390 | 编辑前 scrollTop=2155；取消回新增；完成/删除回第 89 条，scrollTop=272 | 取消/完成恢复编辑前 3202、第 45 条；删除回第 44 条；页面 scrollY=5192 不变 |
| 768 | 编辑前 1056；取消回新增；完成/删除回第 89 条，scrollTop=37；8 列名字省略 | 取消/完成恢复编辑前 1664、第 45 条；删除回第 44 条；页面 scrollY=2487 不变；6 列名字换行 |
| 1440 | 未做修复前测量 | 取消/完成恢复编辑前 1676、第 45 条；删除回第 44 条；页面 scrollY=2062 不变 |

三视口检查无页面/编辑区横向溢出，删除/取消/完成按钮可见且高度至少 44px，父级重渲染保留输入焦点。正常关闭保持位置；入口已离屏时 Escape 关闭的 scrollY 分别保持 6880 / 3286 / 2676。手机 3 列、平板 6 列，重复出货逐条显示。

已执行开发定向命令：

```bash
npm run test:behavior -- behavior/recruitmentPoolEditorClose.spec.js behavior/recruitmentPoolEditor.spec.js behavior/recruitmentTimeline.spec.js behavior/dialogAccessibility.spec.js -t '焦点恢复|只编辑保底时视口|AppDialog 使用可见标题|AppDialog 的 prompt|BetaCommunityDialog 跳过'
```

14 个选中用例通过；89 个因 -t 未执行，待集中回归，无新增 skip。新增覆盖两视图原项恢复、连续删除中首尾/删空、新增取消/加入、历史位置控件、错误摘要/父级更新、唯一关闭恢复及顶层 Esc；另选中 3 个公共模态既有用例确认默认行为。焦点测试使用真实 Teleport，避免 stub 更新重建 DOM；原软键盘测试补充容器几何，原断言保留。

`git diff --check`、`node --check test-support/recruitmentFocus.browser.js` 已执行。Vue 编译由真实组件浏览器检查覆盖，未运行全量静态/build。

## 待集中回归

在 YuanHub 运行（附加 Timeline 和通用模态覆盖）：

```bash
npm run test:behavior -- behavior/recruitmentPoolEditorClose.spec.js behavior/recruitmentPoolEditor.spec.js behavior/recruitmentOrder.spec.js behavior/recruitmentHistory.spec.js behavior/recruitmentTimeline.spec.js behavior/dialogAccessibility.spec.js
```

浏览器合成案例复跑，复用既有服务：

```bash
mkdir -p .ux/audits
playwright-cli -s=recruitment-focus open http://127.0.0.1:5173/login --browser=chrome
playwright-cli -s=recruitment-focus resize 390 844
playwright-cli -s=recruitment-focus run-code --filename=test-support/recruitmentFocus.browser.js
playwright-cli -s=recruitment-focus close
```

本机 PATH 无 playwright-cli，开发时使用已缓存的 `node /Users/snake/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/cli.js cli` 替代，无需安装。CLI 断言失败可能仍返回 shell 0，必须确认输出无 `### Error` 且存在 Result。

集中回归必须保留以下清单：

1. 390 / 768 / 1024 / 1440、430/520 临界宽度和手机横屏；两视图大量记录、长名字、同名重复、搜索隐藏邻项、长密探名单内部滚动、粗指针操作和无横向溢出。
2. Tab/Shift+Tab、顶层 Escape、长页面关闭、连续删除首中尾/删空、取消/新增/完成、历史移动后的焦点；入口仍可键盘访问，固定头尾栏不遮挡焦点。
3. 真机 iPhone/iPad Safari 软键盘开合、动态地址栏、缩放和 visualViewport height/offsetTop；记录输入/按钮可见性与内外滚动。本次没有真机证据，jsdom/Chromium resize 均不替代此项。
4. 读取/保存失败保留输入、未知保底、跨池/账号隔离、重试稳定 ID、取消关闭不写入、成功读回；嵌套确认后无残留遮罩/滚动限制。
5. 全量分页、完整排列、revision 冲突、失效草稿、同次新增/删除/排序/保底及回执核验，沿用 Order/History 断言。数据库测试只用自有一次性容器。

全批次验收需汇总所有功能及前后端起止基线，不能用最后一单 smart 代替。本次不 push、merge、部署或写入反馈状态。

## 统一回归补充（2026-10-13）

集中回归发现 844×390 横屏下单条编辑操作栏落在编辑容器下方，取消、完成、删除不可见。操作栏现随编辑容器吸底，输入避让扣除操作栏占用空间；取消/完成仍恢复原记录，删除仍回到相邻记录，不触发保存。

新增行为回归验证输入滚入操作栏上方、焦点和草稿保留；浏览器脚本同时断言输入与操作栏可见，操作按钮至少 44px。320、390、430、520、768、1024、1440 宽度及 844×390 横屏均通过合成组件检查。完整 Vue 行为测试 114 文件、1773 用例通过；源文件编译及生产构建通过。使用项目 CI 同版本 Node 22 执行，Node 26 的测试环境差异不计为业务回归。

集中回归证据：根目录 `.trellis/tasks/10-13-batch-regression-acceptance/evidence/`，对应 `frontend-behavior-final.log`、`browser-focus-final-*.log`。浏览器 API 预拦截，只用合成数据；本节不能替代真机 Safari 软键盘验收。整批范围、历史阻塞和剩余覆盖见根目录 `docs/reports/batch-regression-20261013.md`。
