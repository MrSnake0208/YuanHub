# 活动日历（Batch 03 + 04 + 05）

`/calendar` 目前处于管理员测试阶段，需要登录及现有管理能力（与管理工具入口的 `auth.isAdmin` 一致，包含内容维护与反馈管理成员），无需内测资格或子账号。访客跳转登录并保留回跳；普通用户和权限读取失败均拒绝进入。默认全部游戏；`game`（代号鸢 / 如鸢）和 `category`（ACTIVITY / RECRUITMENT / LOGIN / SHOP / MAINTENANCE / OTHER）保存在 URL query，可分享。未知筛选值按全部处理。`view=agenda|timeline|month` 与 `date=YYYY-MM-DD` 分别表示视图和锚点日期；重复参数只读取第一项，无效值忽略。

页面通过 `Intl.DateTimeFormat.formatToParts` 计算 Asia/Shanghai 的服务器日期。日程请求今天至未来 90 天；时间轴请求锚点前 7 天至后 27 天（闭区间五周），前后导航按 35 天推进；月历请求当前月及周一至周日的补位日期，至少 35 格、最多 42 格。月份导航保留日号并钳制月末；同月份日期选择不重复请求。服务器午夜、翌日可见性恢复与 pageshow 更新日程，同一天恢复不重复读取。默认锚点随今天移动，URL 显式日期保持。日期不按用户所在时区换算；没有时间的活动不补具体时刻。

日程按今天、接下来 7 天、更晚分组，结束和开始提醒优先，跨日活动只出现一次，历史默认排除。时间轴按类型分组、每项一行，闭区间条显示起止和截断边界，今天有日期头与垂直虚线；仅面板内部横向滚动，标题在条上及上方可见，点击展开同一活动卡。月历显示每天闭区间覆盖的活动数量，选中日完整活动卡在网格下方；允许浏览历史日期。手工与招募卡池统一展示，来源文字区分。

时间轴标题只显示日期范围。“左右滑动查看日期 · 点击活动条查看完整信息 · 虚线标记今天”作为首次操作提示，点击“知道了”后通过当前浏览器的 `yuanhub.activity-calendar.timeline-help-dismissed.v1` 记住，不随刷新或视图切换重复显示；关闭后焦点进入时间轴。存储不可用时仍可关闭当前视图内的提示，之后重新打开可能再次提示。

合法 URL view 优先于 `yuanhub.activity-calendar.view.v1` 本地偏好；无 URL/偏好时，初始宽度 >=1024px 默认时间轴，其余默认日程。只有手动选择写入本地偏好，date 不持久化；存储读写失败时内存偏好仍可用，resize 不强制切换视图。“今天”保留游戏/类型/view/无关 query 并清理 date，日程定位今天、时间轴恢复局部滚动、月历返回当月并选中今天。

三个视图只消费容器数据，共用一个请求生命周期、generation 防迟到响应和错误重试。区间不包含今天时，同一个 load 并行补查 today 至 today，保证历史月份的今日摘要仍准确；包含今天时复用主响应，不重复补查。加载时清空活动数据并标记 aria-busy，但保持日期导航组件与按钮，防止键盘翻月/翻时间窗口丢失焦点。失败时仍可操作共享筛选、视图与日期导航。

公共日历与 Today 复用 `summarizeCalendarDay(items, today)`。今日摘要的“进行中”仅统计 `start_date < today && end_date > today` 的活动，不重复计入今日开始或结束的活动。同日开始并结束的活动分别计入开始、结束，进行中为零；`total` 是闭区间覆盖当天、按活动 id 去重后的总数，不是三个计数相加。

`/today`（首页）在“从现有工具继续”之前显示轻量“今日活动”卡，不改变现有建档、dashboard 与工具入口。登录且当前 accountId 属于已读取的子账号列表时，按 accountGame 读取；管理员无子账号或无有效当前选择时显示全部游戏摘要，不使用默认代号鸢冒充账号归属。仅请求 `from=today&to=today`，最多预览3个标题，超出显示“另有N项”；有效账号的查看活动日历链接携带 `game` query。

Today 卡片请求/加载/错误独立，失败在卡内显示“活动日程暂时无法读取”及重试，完整日历入口保持可用，不改变 dashboard 的 errorMessage。game 改变重读、同游戏换账号不重复读取，旧响应与卸载后的响应失效。复用服务器日期与午夜函数，只设置午夜单次 timeout，并监听可见性恢复/pageshow；同日恢复不重读，跨日恢复重读一次，卸载清理。没有新增全局轮询。测试阶段卡片仅对已登录管理员显示。访客、普通用户或管理权限未加载时不挂载卡片，不请求日历，也不创建刷新计时器/监听；权限加载后自动显示，撤销或登出后卸载并清理。

GET `/v1/activity-calendar` 仅允许已登录管理员，返回统一响应的 `data.items`；API request 封装已解包 `data`，页面读取 `result.items`。游戏、日期和类别使用后端 snake_case 契约。日历读取请求携带认证并绑定 `expectedUserId`，避免跨身份重放。后端独立使用 `hasAnyAdminCapability` 校验，未登录返回 401，非管理员返回 403 `admin_testing_only`。

`/calendar/admin` 需要登录和 `activity_calendar:write`，入口位于管理工具的“内容维护”。列表筛选游戏、类型、启用状态、日期重叠区间和标题；点击“筛选 / 刷新”发送 GET `/v1/admin/activity-calendar`，编辑时列表隐藏，返回与保存保留筛选。

手工项支持 POST 新建、PUT 完整替换（携带读取的 `version` 为 `expected_version`），没有 DELETE。可停用和重新启用，说明、来源链接、管理端来源备注可清空；精确时间开关关闭会清空两端时间。手工项不能选择招募类型。

409 保留草稿、聚焦错误摘要并阻止继续用旧版本保存；使用“返回目录并刷新”，确认放弃修改后重新获取版本。其它字段错误同时显示内联提示和可聚焦摘要。来源 URL 写入使用校验后的规范化形式（国际化域名、路径空格等会编码）。离开有修改的编辑器前复用现有未保存确认机制。

`read_only` 或 `source_type=RECRUITMENT_POOL` 始终阻止编辑。只有同时具备 `recruitment_catalog:write` 才展示“去招募卡池管理”，其余成员看到只读说明。登录身份或写权限变化会清空草稿和列表，迟到读写响应不能混入新身份。日历管理 API 还向共享 request 传递可选 expectedUserId，发送及 401 重放前校验原用户身份，防止用新身份 token 重放旧草稿；其它 API 不传此选项时保持既有请求方式。共享 auth store 的 token 刷新和管理权限读取同样绑定启动时会话，旧会话的迟到成功/失败不会覆盖新会话；单飞请求按会话区分。

`FEATURE_KEYS.ACTIVITY_CALENDAR` 显式设为 true，用于本地人工验收，尚未部署。路由、桌面/手机导航、管理工具及 Today 摘要共享同一开关；关闭后不显示 Today 卡片、不读取日历 API、不设置卡片刷新监听或计时器。

布局沿用暖纸底与现有吉祥物背景、暖白卡、茶棕按钮、宋体标题、Archivo 数字、Lucide 图标。公共页 `public-calendar.css` 作用于 `.calendar-public`，管理页沿用 `calendar.css`。320/390/430 单列和紧凑筛选入口、月历仅数字与数量；768 起完整展开筛选，1024 起月格显示短标题与 +N，仍使用主壳移动导航，超过 1080 显示侧栏，1440 日程增加日期列。时间轴日期轴在局部面板内 sticky，无固定左侧标签列；活动条命中高度44px、最短宽度44px。所有视图有可见焦点、原生按钮与文字状态，月格有完整日期/计数/今天/选中语义，支持 prefers-reduced-motion。管理页始终使用卡片，不依赖桌面表格；公共页筛选弹层复用 `--z-overlay`。

手机端页头优化（2026-10-03）：小于 768px 时，“今天”与“活动日历”标题同排，三种视图切换占下一整行；768px 起恢复原有工具栏布局。仅通过公共页 CSS 排版，不复制按钮或修改日期定位行为，触控高度至少 44px。

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

用户活动资料建议（2026-10-03）：公共日历在活动内容下方、站点页脚之前提供社区补充区域：“建议补充活动”为描边按钮，“我的建议”为次级文字入口。有活动与空状态复用同一区域，顶部专注日期、视图与筛选。访客直接访问日历或建议 URL 时沿用登录回跳。`/calendar/suggestions/new` 与 `/calendar/suggestions` 要求有效登录及管理能力，共用 `ACTIVITY_CALENDAR` 开关，不要求子账号、内测资格或日历写权限；后端提交/本人列表/详情同样要求管理员；本次不改变该开关默认值，部署与开放由现有发布流程控制。

提交页只预填合法 `game`，日期由用户填写，不继承浏览历史月份。支持五种手工类别，来源 http/https 链接必填；招募线索仍走反馈或卡池维护。公开说明与“给审核员的补充说明”分别填写，后者只对提交人与审核员可见。建议提交后只读，不能修改或撤回。不采纳后可按原因补全资料重新提交。

提交失败保留草稿；字段错误使用内联提示与可聚焦摘要。网络错误或未知结果会锁定本次资料与 `client_request_id`，“重试相同资料”复用它们；开始新的提交需要确认并使用新标识，建议先查个人列表，避免重复。个人列表支持状态筛选和每页 20 条分页，详情显示原始资料、审核时间、说明、采纳时公开快照以及当前活动状态。活动停用后仍显示历史“已采纳”，同时明确“当前已停用”，不提供会误导的公共活动跳转。

`/calendar/admin` 新增“活动目录 / 用户建议”切换，原活动目录行为保留。用户建议默认待审核，支持游戏、状态与分页。审核区先显示只读原始资料，再显示预填的正式活动编辑器；宽屏可并排对照，窄屏顺序阅读。私人说明不自动复制到公开说明或管理备注。审核员可主动按游戏与日期重叠检查已有活动；采纳和不采纳均需确认，不采纳原因必填。采纳创建启用的 MANUAL 活动，不采纳是终态。已处理详情只读。

审核 409 保留全部草稿并禁用旧版本提交。“保留草稿并刷新状态”只读取最新状态；“放弃草稿，打开最新结果”确认后才替换编辑器。成功处理后刷新队列并保留筛选，最后一页为空时回到最后有效页。有改动时返回列表、切换工作区或离开页面使用未保存确认。身份退出/切换与审核权限丢失清空私有数据及草稿，旧响应不得覆盖新身份或选中项；所有私有 API 绑定 `expectedUserId`，阻止 401 刷新后向另一个身份重放。

本轮风险 L3（新增登录路由、私有 API 与跨页面身份隔离）。新增 pure/API/页面与审核行为测试；回归由用户/CI执行，Agent仅执行定向 Vue/JavaScript 语法编译检查。最小前端回归（cwd YuanHub）：

```bash
node --test test/activityCalendarSuggestions.test.js test/activityCalendar.test.js
npm run test:behavior -- behavior/activityCalendarSuggestions.spec.js behavior/activityCalendarSuggestionsApi.spec.js behavior/activityCalendarRoutes.spec.js behavior/activityCalendarIdentity.spec.js behavior/activityCalendarSession.spec.js behavior/activityCalendarAdmin.spec.js behavior/activityCalendar.spec.js
```

页面还需用户在 320/390/430/768/1024/1440px 与手机横屏完成提交、个人查看、采纳/不采纳、409刷新、未保存确认和键盘错误焦点验收，确认无页面横滚、主要触控目标与软键盘可达性。定向 SFC 编译与 jsdom 行为测试不证明真实布局、Safari 或触控体验。没有为本轮启动、重启或停止开发服务。

样式补齐（2026-10-03）：社区建议页继续使用 `calendar.css`，以 `calendar-community` 限定表单、队列与审核区的展示规则。入口使用描边按钮；表单按实际容器宽度切换单双列；审核对照在 1440px 起并排，较窄视口顺序展示。私人说明独立分区，审核状态保留文字并配合标签颜色。此轮仅展示修改（L0），不新增行为测试。Playwright CLI 使用独立会话及模拟数据检查了提交页/审核区六档宽度、个人列表三档宽度和手机详情，未写入真实资料；真实账号流程、Safari 与软键盘仍需人工验收。


管理员测试阶段权限（2026-10-04）：导航、Today 摘要、日历与建议路由及后端读取/建议接口统一仅向管理员开放；`requiresAdmin` 是严格路由条件，不采用管理工作台在权限读取失败时的放行语义。管理目录与审核仍独立要求 `activity_calendar:write`。功能开关仍为 true，控制功能整体显隐，不代替鉴权。

本轮风险 L3（路由及前后端鉴权）；已更新权限、真实路由守卫、双端导航、Today 摘要生命周期、API 身份与后端安全链/契约测试。回归由用户/CI执行（cwd YuanHub）：

```bash
node --test test/routeAccess.test.js test/activityCalendar.test.js
npm run test:behavior -- behavior/activityCalendarRoutes.spec.js behavior/activityCalendarApi.spec.js behavior/islandSidebar.spec.js behavior/todayActivitySummary.spec.js
```

后端命令见 `BackEndV3-Share/docs/activity-calendar.md` 的管理员测试阶段验证说明。

本轮已执行：11 个改动 JavaScript/Vue 文件的定向解析与 SFC 编译、前后端 `git diff --check`，均通过。未执行行为回归或浏览器验收，未启动/重启开发服务。


## 本期订阅与个人关卡（2026-10-05）

复用 `/calendar` 的“全部活动 / 我的订阅”和三种视图，不新增活动资料或独立待办页面。选择本人游戏账号后可订阅本期；“我的订阅”使用当前账号的游戏，可按类型、日期及“仅未完成”筛选。URL只保存视图/日期/筛选，不保存账号标识。

账号入口（2026-10-06）：复用密探、库存、星石与招募档案的 `AccountSwitcher`，显示“游戏 · 账号名”，桌面使用浮层、手机使用 Sheet；选择账号原地更新 `activeAccount`。有未保存关卡进度时继续使用 `confirmDiscard`，取消保留原账号与草稿。我的订阅随当前账号锁定游戏；全部活动保留 URL 中的公共游戏筛选，跨游戏账号只能订阅自己游戏的活动。新建与管理仍前往个人中心，账号读取/空态/重试入口保持原有行为。

本次入口接入风险 L2：局部 UI 与现有账号上下文、草稿保护连接；未改变共享 store、API 或持久化。新增账号切换、取消保护、迟到响应、公共筛选与账号读取恢复测试。最小回归（cwd YuanHub，由用户/CI执行）：

```bash
npm run test:behavior -- behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/accountSwitcher.spec.js
```

运行时检查 390 / 768 / 1440px 的账号入口与浮层/Sheet，重点确认长名称、焦点恢复、未保存确认和公共筛选独立于账号游戏；320px 抽查横向溢出。

本次已做定向 SFC/JS/CSS 编译解析和 diff 检查；Playwright CLI 复用现有服务，以真实 SFC + 模拟账号/API 检查 320/390/768/1440px 的长名称、44px 入口、面板边界、Escape 焦点恢复及未保存确认的取消/确认分支。未写真实数据，未执行行为回归；真实账号、Safari 与软键盘仍待用户验收。浏览器预览的 Vite HMR WebSocket 被本地网络策略阻止，页面交互检查未出现 JavaScript runtime error。

活动卡支持订阅、取消、恢复及“记录进度”。取消保留进度，同期恢复继续使用；未来新一期不自动订阅。没有关卡清单时可直接标记整期完成；有清单时按全部勾选计算。每期最多50个私人关卡，名称1–80字，新增默认未勾选、可在首次保存前主动勾选；删除需确认，删除最后一项保留删除前草稿的整体完成状态。活动资料仍跟随公开来源。

409或网络结果不明时保留草稿、停止旧版本保存；“读取最新状态”先读取，再确认是否替换草稿。切换日期/视图/账号、离开与收起使用现有未保存确认；后台读取和跨日刷新不会替换编辑中的草稿。用户/账号/范围变化后忽略旧请求。来源停用、消失或改游戏后停止提醒，保留只读进度并允许取消；已截止的有效活动可修正已有进度，但不能新订阅或恢复。

首页仍在原活动摘要卡内显示当前账号未来7天内、已开始且未完成的订阅，最多3项，先计算全部符合条件的活动数再截取。公共活动统计与私人活动数分开。精确时间按带时区的start_at/end_at判断，到截止瞬间即结束；仅日期的活动按上海服务器日历日处理，明确“具体时间未提供”。截止定时器、跨日及页面恢复刷新负责更新，不新增定时网络轮询。

保留现有 `ACTIVITY_CALENDAR` 开关及管理员测试门禁。具有任何订阅历史（含已取消）的账号禁止更换游戏；改名不受影响。删除游戏账号同时删除其订阅及个人进度，确认文案已同步。

风险L3：新增私有API、身份隔离及持久化。新增纯函数、API、页面草稿、异步身份隔离、首页摘要测试；测试未执行。Agent仅完成源码编译/定向格式检查和静态审查；真实三视图、六档宽度及手机横屏/焦点/软键盘待用户验收。完整命令与证据见工作区 `.trellis/tasks/10-05-activity-calendar-subscriptions/verification.md`。

最小前端回归（cwd YuanHub，由用户/CI执行）：

```bash
node --test test/activityCalendar.test.js test/activityCalendarViews.test.js test/activityCalendarSubscriptions.test.js
npm run test:behavior -- behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionApi.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/todayCalendarSubscriptions.spec.js behavior/activityCalendar.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarRoutes.spec.js behavior/todayActivitySummary.spec.js
```

## Timeline 时间关系优化（2026-10-06）

沿用 35 天请求窗口（锚点前 7 天、后 27 天）及 48px/日的闭区间布局：横向位置表示开始日，长度表示持续天数。按现有 `CALENDAR_CATEGORIES` 分组，同类重叠事件自动分轨，相邻且不重叠的事件复用轨道；不隐藏活动，面板高度上限为 `min(620px, 70dvh)`，内部纵横滚动，日期头局部 sticky。

活动名称只在 Bar 中出现一次；长条名称通过 CSS sticky 保留在可见区域，游戏标记与临近结束的剩余时间构成第二行。单日活动采用菱形标记及短名称，目标至少 44×48px，完整名称、起止日期和状态保留在可访问名称及共用详情卡中。跨窗口端点继续用虚线边界表达裁切。

Today 使用“今天”文字、日期下划线和竖线；打开窗口时锚点位于视口约三分之一处，点击页面“今天”只调整 Timeline 内部横向位置。已在今天的重复导航也触发定位，无需重新请求；定位直接设置 `scrollLeft`，支持 reduced-motion。显式历史日期仍优先，不强行改回今天。

点击活动保持选中，详情继续复用 `CalendarEventCard` 和订阅控件；新增关闭详情入口，仍检查未保存确认及账号上下文，关闭后焦点返回活动条。手机首次默认 Agenda，主动进入 Timeline 后保留局部横向滚动；平板和桌面使用同一布局，仅可视日期数量不同。未新增 Zoom、独立 Detail 系统、API、状态源或依赖；Agenda、Month、筛选、账号及视图偏好沿用现有实现。

风险 L2：局部时间数据分轨、选择交互及重复 Today 定位修复。新增分轨边界/裁切/确定性、页面重复 Today、稳定选择/关闭/焦点、临近结束精确状态及草稿保护回归。最小验证（cwd YuanHub，由用户/CI执行）：

```bash
node --test test/activityCalendarViews.test.js
npm run test:behavior -- behavior/activityCalendarViews.spec.js
```

Agent 已执行定向 SFC/JS/CSS 编译和 diff 检查，以及 Playwright CLI 的 390/768/1440px 真实 SFC 合成预览检查：无整页横滚、条长度/分轨/44px 目标、Today 重复定位、sticky 日期轴、键盘滚动/选择、详情焦点返回和三视图切换。证据位于工作区 `.playwright-cli/calendar-timeline/`；鉴权/API 为合成数据，未写后端。Node/Vitest 回归及生产 build 未执行；真实登录账号、Safari、手机触控与读屏器仍待用户验收。
