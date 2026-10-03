# 活动日历（Batch 03 + 04 + 05）

`/calendar` 公开，无需登录、内测资格或子账号。默认全部游戏；`game`（代号鸢 / 如鸢）和 `category`（ACTIVITY / RECRUITMENT / LOGIN / SHOP / MAINTENANCE / OTHER）保存在 URL query，可分享。未知筛选值按全部处理。

页面通过 `Intl.DateTimeFormat.formatToParts` 计算 Asia/Shanghai 的服务器日期，请求从今天到未来 90 天的闭区间日程。服务器午夜与翌日从后台恢复时更新日程；同一天恢复不重复读取。日期不按用户所在时区换算；没有时间的活动不补具体时刻。今天先显示结束和开始提醒，再显示进行中活动，随后按开始日期分为接下来 7 天、更晚。跨日活动只出现一次，历史活动默认排除。手工与招募卡池统一展示，来源文字区分。

公共日历与 Today 复用 `summarizeCalendarDay(items, today)`。今日摘要的“进行中”仅统计 `start_date < today && end_date > today` 的活动，不重复计入今日开始或结束的活动。同日开始并结束的活动分别计入开始、结束，进行中为零；`total` 是闭区间覆盖当天、按活动 id 去重后的总数，不是三个计数相加。

`/today`（首页）在“从现有工具继续”之前显示轻量“今日活动”卡，不改变现有建档、dashboard 与工具入口。登录且当前 accountId 属于已读取的子账号列表时，按 accountGame 读取；访客、无子账号或无有效当前选择时显示全部游戏的公开摘要，不使用默认代号鸢冒充账号归属。仅请求 `from=today&to=today`，最多预览3个标题，超出显示“另有N项”；有效账号的查看活动日历链接携带 `game` query。

Today 卡片请求/加载/错误独立，失败在卡内显示“活动日程暂时无法读取”及重试，完整日历入口保持可用，不改变 dashboard 的 errorMessage。game 改变重读、同游戏换账号不重复读取，旧响应与卸载后的响应失效。复用服务器日期与午夜函数，只设置午夜单次 timeout，并监听可见性恢复/pageshow；同日恢复不重读，跨日恢复重读一次，卸载清理。没有新增全局轮询。活动是公共数据，卡片不因未登录隐藏。

公开 GET `/v1/activity-calendar` 返回统一响应的 `data.items`；API request 封装已解包 `data`，页面读取 `result.items`。游戏、日期和类别使用后端 snake_case 契约。公共请求不携带认证。

`/calendar/admin` 需要登录和 `activity_calendar:write`，入口位于管理工具的“内容维护”。列表筛选游戏、类型、启用状态、日期重叠区间和标题；点击“筛选 / 刷新”发送 GET `/v1/admin/activity-calendar`，编辑时列表隐藏，返回与保存保留筛选。

手工项支持 POST 新建、PUT 完整替换（携带读取的 `version` 为 `expected_version`），没有 DELETE。可停用和重新启用，说明、来源链接、管理端来源备注可清空；精确时间开关关闭会清空两端时间。手工项不能选择招募类型。

409 保留草稿、聚焦错误摘要并阻止继续用旧版本保存；使用“返回目录并刷新”，确认放弃修改后重新获取版本。其它字段错误同时显示内联提示和可聚焦摘要。来源 URL 写入使用校验后的规范化形式（国际化域名、路径空格等会编码）。离开有修改的编辑器前复用现有未保存确认机制。

`read_only` 或 `source_type=RECRUITMENT_POOL` 始终阻止编辑。只有同时具备 `recruitment_catalog:write` 才展示“去招募卡池管理”，其余成员看到只读说明。登录身份或写权限变化会清空草稿和列表，迟到读写响应不能混入新身份。日历管理 API 还向共享 request 传递可选 expectedUserId，发送及 401 重放前校验原用户身份，防止用新身份 token 重放旧草稿；其它 API 不传此选项时保持既有请求方式。共享 auth store 的 token 刷新和管理权限读取同样绑定启动时会话，旧会话的迟到成功/失败不会覆盖新会话；单飞请求按会话区分。

`FEATURE_KEYS.ACTIVITY_CALENDAR` 显式设为 true，用于本地人工验收，尚未部署。路由、桌面/手机导航、管理工具及 Today 摘要共享同一开关；关闭后不显示 Today 卡片、不读取日历 API、不设置卡片刷新监听或计时器。

布局沿用暖纸底与现有吉祥物背景、暖白卡、茶棕按钮、宋体标题、Archivo 数字、Lucide 图标。320/390/430 单列和多行筛选，768 起双列表单，1024 仍使用主壳移动导航，超过 1080 显示侧栏，1440 增加日期列。管理页始终使用卡片，不依赖桌面表格；无 sticky 日期标题与新 modal 层级。

最小验证：

```bash
node --test test/activityCalendar.test.js test/authPermissions.test.js test/adminTools.test.js
npm run test:behavior -- behavior/activityCalendar*.spec.js behavior/islandSidebar.spec.js
node --test test/authInit.test.js test/authStartup.test.js test/requestTimeout.test.js
npm run test:behavior -- behavior/authStartupGuard.spec.js
npm run build
git diff --check
```

Batch05 的最小验证（cwd YuanHub）：

```bash
node --test test/activityCalendar.test.js test/todayData.test.js test/todayPage.test.js
npm run test:behavior -- behavior/today*.spec.js behavior/activityCalendar.spec.js
npm run build
git diff --check
```

运行时验收仍需在可用开发页面检查 320/390/430/768/1024/1440 和手机横屏的换行、横向溢出、焦点与软键盘；静态审查、jsdom 和构建无法证明这些几何行为。Batch05 未启动服务，runtime/browser视觉及真实API联调未验证；人工最小检查为 Today 的手机/桌面卡片换行、无横滚、44px链接/重试、账号切换后 game 链接。Batch06 等待真实腾讯表格字段，尚未实施。
