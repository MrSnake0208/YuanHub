# 活动日历（Batch 03 + 04 + 05）

`/calendar` 公开，无需登录、内测资格或子账号。默认全部游戏；`game`（代号鸢 / 如鸢）和 `category`（ACTIVITY / RECRUITMENT / LOGIN / SHOP / MAINTENANCE / OTHER）保存在 URL query，可分享。未知筛选值按全部处理。`view=agenda|timeline|month` 与 `date=YYYY-MM-DD` 分别表示视图和锚点日期；重复参数只读取第一项，无效值忽略。

页面通过 `Intl.DateTimeFormat.formatToParts` 计算 Asia/Shanghai 的服务器日期。日程请求今天至未来 90 天；时间轴请求锚点前 7 天至后 27 天（闭区间五周），前后导航按 35 天推进；月历请求当前月及周一至周日的补位日期，至少 35 格、最多 42 格。月份导航保留日号并钳制月末；同月份日期选择不重复请求。服务器午夜、翌日可见性恢复与 pageshow 更新日程，同一天恢复不重复读取。默认锚点随今天移动，URL 显式日期保持。日期不按用户所在时区换算；没有时间的活动不补具体时刻。

日程按今天、接下来 7 天、更晚分组，结束和开始提醒优先，跨日活动只出现一次，历史默认排除。时间轴按类型分组、每项一行，闭区间条显示起止和截断边界，今天有日期头与垂直虚线；仅面板内部横向滚动，标题在条上及上方可见，点击展开同一活动卡。月历显示每天闭区间覆盖的活动数量，选中日完整活动卡在网格下方；允许浏览历史日期。手工与招募卡池统一展示，来源文字区分。

时间轴标题只显示日期范围。“左右滑动查看日期 · 点击活动条查看完整信息 · 虚线标记今天”作为首次操作提示，点击“知道了”后通过当前浏览器的 `yuanhub.activity-calendar.timeline-help-dismissed.v1` 记住，不随刷新或视图切换重复显示；关闭后焦点进入时间轴。存储不可用时仍可关闭当前视图内的提示，之后重新打开可能再次提示。

合法 URL view 优先于 `yuanhub.activity-calendar.view.v1` 本地偏好；无 URL/偏好时，初始宽度 >=1024px 默认时间轴，其余默认日程。只有手动选择写入本地偏好，date 不持久化；存储读写失败时内存偏好仍可用，resize 不强制切换视图。“今天”保留游戏/类型/view/无关 query 并清理 date，日程定位今天、时间轴恢复局部滚动、月历返回当月并选中今天。

三个视图只消费容器数据，共用一个请求生命周期、generation 防迟到响应和错误重试。区间不包含今天时，同一个 load 并行补查 today 至 today，保证历史月份的今日摘要仍准确；包含今天时复用主响应，不重复补查。加载时清空活动数据并标记 aria-busy，但保持日期导航组件与按钮，防止键盘翻月/翻时间窗口丢失焦点。失败时仍可操作共享筛选、视图与日期导航。

公共日历与 Today 复用 `summarizeCalendarDay(items, today)`。今日摘要的“进行中”仅统计 `start_date < today && end_date > today` 的活动，不重复计入今日开始或结束的活动。同日开始并结束的活动分别计入开始、结束，进行中为零；`total` 是闭区间覆盖当天、按活动 id 去重后的总数，不是三个计数相加。

`/today`（首页）在“从现有工具继续”之前显示轻量“今日活动”卡，不改变现有建档、dashboard 与工具入口。登录且当前 accountId 属于已读取的子账号列表时，按 accountGame 读取；访客、无子账号或无有效当前选择时显示全部游戏的公开摘要，不使用默认代号鸢冒充账号归属。仅请求 `from=today&to=today`，最多预览3个标题，超出显示“另有N项”；有效账号的查看活动日历链接携带 `game` query。

Today 卡片请求/加载/错误独立，失败在卡内显示“活动日程暂时无法读取”及重试，完整日历入口保持可用，不改变 dashboard 的 errorMessage。game 改变重读、同游戏换账号不重复读取，旧响应与卸载后的响应失效。复用服务器日期与午夜函数，只设置午夜单次 timeout，并监听可见性恢复/pageshow；同日恢复不重读，跨日恢复重读一次，卸载清理。没有新增全局轮询。活动是公共数据，卡片不因未登录隐藏。

公开 GET `/v1/activity-calendar` 返回统一响应的 `data.items`；API request 封装已解包 `data`，页面读取 `result.items`。游戏、日期和类别使用后端 snake_case 契约。公共请求不携带认证。

`/calendar/admin` 需要登录和 `activity_calendar:write`，入口位于管理工具的“内容维护”。列表筛选游戏、类型、启用状态、日期重叠区间和标题；点击“筛选 / 刷新”发送 GET `/v1/admin/activity-calendar`，编辑时列表隐藏，返回与保存保留筛选。

手工项支持 POST 新建、PUT 完整替换（携带读取的 `version` 为 `expected_version`），没有 DELETE。可停用和重新启用，说明、来源链接、管理端来源备注可清空；精确时间开关关闭会清空两端时间。手工项不能选择招募类型。

409 保留草稿、聚焦错误摘要并阻止继续用旧版本保存；使用“返回目录并刷新”，确认放弃修改后重新获取版本。其它字段错误同时显示内联提示和可聚焦摘要。来源 URL 写入使用校验后的规范化形式（国际化域名、路径空格等会编码）。离开有修改的编辑器前复用现有未保存确认机制。

`read_only` 或 `source_type=RECRUITMENT_POOL` 始终阻止编辑。只有同时具备 `recruitment_catalog:write` 才展示“去招募卡池管理”，其余成员看到只读说明。登录身份或写权限变化会清空草稿和列表，迟到读写响应不能混入新身份。日历管理 API 还向共享 request 传递可选 expectedUserId，发送及 401 重放前校验原用户身份，防止用新身份 token 重放旧草稿；其它 API 不传此选项时保持既有请求方式。共享 auth store 的 token 刷新和管理权限读取同样绑定启动时会话，旧会话的迟到成功/失败不会覆盖新会话；单飞请求按会话区分。

`FEATURE_KEYS.ACTIVITY_CALENDAR` 显式设为 true，用于本地人工验收，尚未部署。路由、桌面/手机导航、管理工具及 Today 摘要共享同一开关；关闭后不显示 Today 卡片、不读取日历 API、不设置卡片刷新监听或计时器。

布局沿用暖纸底与现有吉祥物背景、暖白卡、茶棕按钮、宋体标题、Archivo 数字、Lucide 图标。公共页 `public-calendar.css` 作用于 `.calendar-public`，管理页沿用 `calendar.css`。320/390/430 单列和紧凑筛选入口、月历仅数字与数量；768 起完整展开筛选，1024 起月格显示短标题与 +N，仍使用主壳移动导航，超过 1080 显示侧栏，1440 日程增加日期列。时间轴日期轴在局部面板内 sticky，无固定左侧标签列；活动条命中高度44px、最短宽度44px。所有视图有可见焦点、原生按钮与文字状态，月格有完整日期/计数/今天/选中语义，支持 prefers-reduced-motion。管理页始终使用卡片，不依赖桌面表格；公共页筛选弹层复用 `--z-overlay`。

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

Batch05 的历史验收范围仍是 Today 卡片，未在该批次启动服务。Batch06 等待真实腾讯表格字段，尚未实施。

多视图改版最小回归（cwd YuanHub；由用户/CI执行）：

```bash
node --test test/activityCalendar.test.js test/activityCalendarViews.test.js
npm run test:behavior -- behavior/activityCalendar.spec.js behavior/activityCalendarViews.spec.js
```

多视图改版验证记录位于工作区 `.trellis/tasks/10-03-activity-calendar-multi-view/verification.md`。自动化回归尚未执行；浏览器只验证公开日历与现有本地 API。六档宽度、视图切换、日期导航、今天动作、局部滚动与键盘焦点的实测见记录；真实手机触控及 Safari 仍需用户验收。


公共页视觉减重（2026-10-03）：标题区承载“今天”和三视图工具，游戏/类型筛选为透明轻量工具栏；当前日期仅由今日信息带展示，`total=0` 时只显示“当前筛选暂无活动”，有活动仍展示今日开始、今日结束和进行中。月历使用无间距的七列连续细线网格，普通日期透明、无独立圆角，今天以数字下划线与“今”标记，选中日期有淡蜜黄、细内线及数字下划线；空日期详情仅保留日期与“暂无活动”。768px月格基准80px，1024px基准90px，1440px基准96px；桌面仍展示最多两条短标题和+N。管理页、数据/API、URL/偏好、请求区间及时间轴业务逻辑不变。

本轮最小验证：按320/390/430/768/1024/1440检查三视图及空/有活动、无整页横滚、七列日期、焦点和主要44px触控目标。行为回归由用户/CI执行（cwd YuanHub）：

```bash
npm run test:behavior -- behavior/activityCalendar.spec.js behavior/activityCalendarViews.spec.js
```

工作区本轮响应式证据：`.trellis/tasks/10-03-activity-calendar-visual-cleanup/verification.md`。

移动端筛选优化（2026-10-03）：<768px 默认显示“筛选 + 当前游戏/类型摘要”，仅非默认维度显示1/2计数；>=768px 保留完整展开Chips。点击手机入口打开底部弹层，完整选项可换行，桌面和弹层复用 `CalendarFilterControls`。点击即调用既有 `setFilter` 更新URL和请求，弹层保持打开；“完成”仅关闭，“重置筛选”仅清空game/category，保留view/date及无关query，弹层开关不写入URL。加载或失败仍可继续筛选、关闭，业务错误仅在主内容展示。

`CalendarFilterSheet` 使用Teleport、`useModalFocus`、标题初始焦点、Escape/遮罩关闭及入口焦点恢复；打开时锁body/html滚动，关闭和卸载恢复原overflow/padding。仅打开期间监听768px断点，变宽自动关闭、释放锁和焦点陷阱；再次变窄不自动打开。弹层最大高度 `min(76dvh, 640px)`，选项区域内部滚动，完成和重置保留在滚动区域外，底部及两侧包含Safe Area。

本轮风险L1（局部组件交互，URL/API契约与共享状态未改变）。测试新增 `behavior/activityCalendarFilters.spec.js`，真实布局与横屏另由浏览器验收。用户/CI最小回归（cwd YuanHub）：

```bash
npm run test:behavior -- behavior/activityCalendarFilters.spec.js behavior/activityCalendar.spec.js behavior/activityCalendarViews.spec.js
```

工作区实施与验收记录：`.trellis/tasks/10-03-activity-calendar-mobile-filter/`；真实手机Safari、触控与Home Indicator安全区仍需设备验收。
