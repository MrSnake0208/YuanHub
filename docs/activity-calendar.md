# 活动日历（Batch 03 + 04 + 05）

`/calendar` 与活动建议路由面向所有已登录且具备全站内测资格的用户开放，不要求管理员身份。未取得资格或资格读取失败时进入 `/beta`，保留安全回跳；使用日历公共列表不要求子账号。默认全部游戏；`game`（代号鸢 / 如鸢）和 `category`（ACTIVITY / RECRUITMENT / LOGIN / SHOP / MAINTENANCE / OTHER）保存在 URL query，可分享。未知筛选值按全部处理。`view=agenda|timeline|month` 与 `date=YYYY-MM-DD` 分别表示视图和锚点日期；重复参数只读取第一项，无效值忽略。

页面通过 `Intl.DateTimeFormat.formatToParts` 计算 Asia/Shanghai 的服务器日期。日程请求今天至未来 90 天；时间轴请求锚点前 7 天至后 27 天（闭区间五周），前后导航按 35 天推进；月历请求当前月及周一至周日的补位日期，至少 35 格、最多 42 格。月份导航保留日号并钳制月末；同月份日期选择不重复请求。服务器午夜、翌日可见性恢复与 pageshow 更新日程，同一天恢复不重复读取。默认锚点随今天移动，URL 显式日期保持。日期不按用户所在时区换算；没有时间的活动不补具体时刻。

日程按今天、接下来 7 天、更晚分组，结束和开始提醒优先，跨日活动只出现一次，历史默认排除。时间轴按活动/卡池/商店/其他四组展示，重叠活动分轨、相邻区间复用轨道；闭区间条显示起止和截断边界，今天有日期头与竖线；仅面板内部横向滚动，标题在条上可见，点击展开同一活动卡。月历按周展示闭区间活动条，选中日完整活动卡紧跟所属周；允许浏览历史日期。手工与招募卡池统一展示，来源文字区分。

### 月历周条（2026-10-12）

月历保留周一开头的5/6周补位范围。日期数字与色条分层，今天通过“今”及底线、选中日通过浅蜜黄底/边框/下划线区分。`monthCalendarWeeks` 仅生成前端显示模型，复用业务日期和区间函数，不更改 API、数据或筛选；同一 ID 去重后按起始日期、持续范围和 ID 排序，跨周尽量保留原轨道，空轨会压缩。

手机与平板默认最多3层，宽度达到1024px时4层；空周只留日期行。跨日条覆盖首尾日期；跨周、跨可视区与无结束日期通过箭头和虚线端点提示延续。类型文字与浅色token共同表达分类，长名称省略后可点击查看全文。`+N` 是该日期未在已显示轨道出现的真实事项数，每周切片不制造新活动 ID，也不把跨日重复计数相加。

点日期保持原 URL `date` 单源；点色条定位到该片段内的选中日（否则片段首日），并聚焦对应完整卡片；点 `+N` 聚焦当天清单标题。焦点动作在原导航/草稿确认完成后生效，跨月时等待新数据；取消或普通选日不会留下旧焦点请求。详情只挂载一份，紧随选中周。清单在最多 `min(28rem, 60svh)` 高度内滚动，保留全部卡片、订阅/私人事项操作；清单上方明确提示滚动，键盘可进入清单。主日期与事件操作至少44px高，320px下日期宽度至少44px。媒体查询只调整显示层数，不写用户设置或重复请求。

定向验证（在前端仓库）：

```bash
node --test test/activityCalendarViews.test.js test/activityCalendarOpenEnded.test.js test/activityCalendarTypes.test.js test/calendarPrivateItems.test.js
npx --no-install vitest run behavior/activityCalendarViews.spec.js behavior/activityCalendarTypes.spec.js behavior/calendarPrivateItems.spec.js behavior/activityCalendarFilters.spec.js behavior/activityCalendarUnsaved.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js
npm run test:static
npm run build
```

浏览器合成场景：已有前端服务可用时，在隔离的 Playwright CLI 会话先 `open http://127.0.0.1:5173 --browser=chrome`，然后 `run-code --filename=test-support/calendarMonthWeeks.browser.js`。脚本拦截全部 API，只允许合成 GET，拒绝写请求和外部网络；使用12条混合类型重叠事项验证六视口、逐日折叠、键盘、全文、放大、横屏、reduced-motion、私人隔离与前进/后退。截图写 `/tmp/month-bars-after-<width>.png`，不提交。桌面模拟不代替真实 Safari、触屏和账号联调。

时间轴标题只显示日期范围。“左右滑动查看日期 · 点击活动条查看完整信息 · 虚线标记今天”作为首次操作提示，点击“知道了”后通过当前浏览器的 `yuanhub.activity-calendar.timeline-help-dismissed.v1` 记住，不随刷新或视图切换重复显示；关闭后焦点进入时间轴。存储不可用时仍可关闭当前视图内的提示，之后重新打开可能再次提示。

合法 URL view 优先于 `yuanhub.activity-calendar.view.v1` 本地偏好；无 URL/偏好时，初始宽度 >=1024px 默认时间轴，其余默认日程。只有手动选择写入本地偏好，date 不持久化；存储读写失败时内存偏好仍可用，resize 不强制切换视图。“今天”保留游戏/类型/view/无关 query 并清理 date，日程定位今天、时间轴恢复局部滚动、月历返回当月并选中今天。

三个视图只消费容器数据，共用一个请求生命周期、generation 防迟到响应和错误重试。区间不包含今天时，同一个 load 并行补查 today 至 today，保证历史月份的今日摘要仍准确；包含今天时复用主响应，不重复补查。加载时清空活动数据并标记 aria-busy，但保持日期导航组件与按钮，防止键盘翻月/翻时间窗口丢失焦点。失败时仍可操作共享筛选、视图与日期导航。

公共日历与 Today 复用 `summarizeCalendarDay(items, today)`。今日摘要的“进行中”仅统计 `start_date < today && (end_date == null || end_date > today)` 的活动，不重复计入今日开始或结束的活动。同日开始并结束的活动分别计入开始、结束，进行中为零；`total` 是闭区间覆盖当天、按活动 id 去重后的总数，不是三个计数相加。

`/today`（首页）在“从现有工具继续”之前显示轻量“今日活动”卡，不改变现有建档、dashboard 与工具入口。登录且当前 accountId 属于已读取的子账号列表时，按 accountGame 读取；已登录用户无子账号或无有效当前选择时显示全部游戏摘要，不使用默认代号鸢冒充账号归属。仅请求 `from=today&to=today`，最多预览3个标题，超出显示“另有N项”；有效账号的查看活动日历链接携带 `game` query。

Today 卡片请求/加载/错误独立，失败在卡内显示“活动日程暂时无法读取”及重试，完整日历入口保持可用，不改变 dashboard 的 errorMessage。game 改变重读、同游戏换账号不重复读取，旧响应与卸载后的响应失效。复用服务器日期与午夜函数，只设置午夜单次 timeout，并监听可见性恢复/pageshow；同日恢复不重读，跨日恢复重读一次，卸载清理。没有新增全局轮询。摘要对通过首页内测门槛的已登录用户显示，无需管理权限；访客不挂载摘要。退出登录或账号切换清理旧状态与迟到响应。

GET `/v1/activity-calendar` 要求 JWT 与全站内测资格；API request 已解包 `data`，页面读取 `result.items`。日历请求绑定 `expectedUserId`，避免跨身份重放。所有日历、建议、订阅与私人事项接口由后端 `BetaAccessPolicy` 统一保护；未登录返回 401，无资格/维护返回对应 `beta_*` 403，资格查询故障返回 503。

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

用户活动资料建议（2026-10-03）：公共日历在活动内容下方、站点页脚之前提供社区补充区域：“建议补充活动”为描边按钮，“我的建议”为次级文字入口。有活动与空状态复用同一区域，顶部专注日期、视图与筛选。访客直接访问日历或建议 URL 时先经过全站内测门槛，再按开放状态登录回跳。`/calendar/suggestions/new` 与 `/calendar/suggestions` 要求有效登录与全站内测资格，共用 `ACTIVITY_CALENDAR` 开关，不额外要求子账号或日历写权限；后端提交/本人列表/详情同样由 Beta 门禁保护；本次不改变该开关默认值，部署与开放由现有发布流程控制。

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


统一内测准入（2026-10-12）：导航公开显示日历入口；日历与建议路由及后端日历/建议/订阅/私人事项 API 统一按全站内测资格开放。Today 摘要和私人功能不再要求管理身份。管理目录与审核仍独立要求 `activity_calendar:write`。功能开关为 true，控制整体显隐，不能代替鉴权。

本轮风险 L3（路由及前后端鉴权）；已更新权限、真实路由守卫、双端导航、Today 摘要生命周期、API 身份与后端安全链/契约测试。回归由用户/CI执行（cwd YuanHub）：

```bash
node --test test/routeAccess.test.js test/activityCalendar.test.js
npm run test:behavior -- behavior/activityCalendarRoutes.spec.js behavior/activityCalendarApi.spec.js behavior/islandSidebar.spec.js behavior/todayActivitySummary.spec.js
```

后端命令见 `BackEndV3-Share/docs/activity-calendar.md` 的内测准入验证说明。

本轮已执行：11 个改动 JavaScript/Vue 文件的定向解析与 SFC 编译、前后端 `git diff --check`，均通过。未执行行为回归或浏览器验收，未启动/重启开发服务。


## 本期订阅与私人活动待办（2026-10-09）

复用 `/calendar` 的“全部活动 / 我的日历”和三种视图，不新增活动资料或独立待办页面。选择本人游戏账号后可订阅本期；“我的订阅”使用当前账号的游戏，可按类型、日期、时间及个人活动状态筛选。URL只保存视图/日期/筛选，不保存账号标识。

账号入口（2026-10-06）：复用密探、库存、星石与招募档案的 `AccountSwitcher`，显示“游戏 · 账号名”，桌面使用浮层、手机使用 Sheet；选择账号原地更新 `activeAccount`。有未保存待办时继续使用 `confirmDiscard`，取消保留原账号与草稿。我的订阅随当前账号锁定游戏；全部活动保留 URL 中的公共游戏筛选，跨游戏账号只能订阅自己游戏的活动。新建与管理仍前往个人中心，账号读取/空态/重试入口保持原有行为。

本次入口接入风险 L2：局部 UI 与现有账号上下文、草稿保护连接；未改变共享 store、API 或持久化。新增账号切换、取消保护、迟到响应、公共筛选与账号读取恢复测试。最小回归（cwd YuanHub，由用户/CI执行）：

```bash
npm run test:behavior -- behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/accountSwitcher.spec.js
```

运行时检查 390 / 768 / 1440px 的账号入口与浮层/Sheet，重点确认长名称、焦点恢复、未保存确认和公共筛选独立于账号游戏；320px 抽查横向溢出。

本次已做定向 SFC/JS/CSS 编译解析和 diff 检查；Playwright CLI 复用现有服务，以真实 SFC + 模拟账号/API 检查 320/390/768/1440px 的长名称、44px 入口、面板边界、Escape 焦点恢复及未保存确认的取消/确认分支。未写真实数据，未执行行为回归；真实账号、Safari 与软键盘仍待用户验收。浏览器预览的 Vite HMR WebSocket 被本地网络策略阻止，页面交互检查未出现 JavaScript runtime error。

活动卡支持订阅、取消、恢复及“编辑待办”。每个登录用户 × 游戏账号 × 本期活动独立保存一份清单，三视图复用同一控件。Checklist编辑区只保存子项；活动级完成使用独立按钮，历史自定义备忘只读保留。删除最后一项得到“暂无待办”，不改变整期状态。取消订阅保留清单和全部历史内容，同期恢复继续使用；未来新一期不自动订阅。完整完成态与兼容契约见文末。活动资料仍跟随公开来源。

“添加待办”立即显示可编辑空行并聚焦名称，空行也触发未保存保护；达到50条时禁用添加并显示上限提示。新待办ID优先使用 `crypto.randomUUID`，缺失时依次使用 `getRandomValues`、时间与随机值，并避免当前清单内重复；ID仅在新建时生成，编辑和保存不改变ID。聚焦使用常规索引，兼容未提供 `Array.prototype.at` 的浏览器。

Checklist保存只发送progress_mode="checklist"及清单/版本，整期完成使用独立completion命令。草稿保护、错误恢复与历史契约以文末2026-10-12说明为准。

### 未保存提示与防误操作（2026-10-09）

编辑面板内显示“已保存 / 有未保存修改 / 保存中…”。真实差异出现后，“保存待办”以茶棕按钮突出；无差异时禁用。TODO名称/勾选/增删参与草稿比较，活动级完成独立保存，新增空行也计入；完全改回原值恢复为已保存，兼容缺失manual_completed的旧记录，不依赖对象字段顺序。

复用统一对话框“还有未保存的日历修改”，默认焦点为安全的“继续编辑”；Esc、关闭或取消均保留当前输入，恢复触发点焦点。收起、取消订阅、时间轴切活动/关闭详情、范围/日期/视图/筛选、页面导航与浏览器前进后退共用保护；确认放弃后才执行动作。路由提交后，即使同一活动卡仍可见，也结束已放弃的编辑。展开筛选和编辑控件本身不触发离开确认。对话框期间的新候选操作不共享同一次放弃授权，亦不覆盖其它已打开的确认。

日历内和外部入口主动切换到有效游戏账号时，先确认再采用目标；取消保留原账号、URL与草稿。账号改名/同身份重读不重置编辑。登出、身份更换、权限撤销或账号失效/游戏归属改变属于安全边界：立即清除旧私有草稿并显示告知，不阻断注销、不向新身份显示旧内容。每次上下文变化另有epoch校验，A→B→A也不能接纳第一次A的迟到响应。

公共列表背景重读保留已有卡片，不因加载状态卸载月历编辑器；私人列表、公共列表迟到结果及跨日/到期/可见性恢复更新在存在草稿时延后，保存或放弃后重读。只有当前上下文、活动与递增版本的服务端成功响应才能归零。失败显示“保存失败，修改仍在此页面”；网络/5xx/409继续使用“读取最新状态”恢复，读取后仍需明确确认才能替换草稿。读取过程中若已打开离开确认，不再覆盖它。保存中禁止重复提交。

刷新、关闭和离站外链使用浏览器原生beforeunload确认；是否展示由浏览器决定，不能自定义保证其文案。无自动保存、无本地明文草稿持久化；系统杀进程、断电、移动浏览器后台回收无法保证拦截。

风险L3（共享确认、账号上下文与异步竞态）；定向回归：

```bash
npm run test:behavior -- behavior/activityCalendarUnsaved.spec.js behavior/unsavedChanges.spec.js behavior/unsavedChangesConcurrency.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js
```

首页复用订阅摘要显示当前账号全部未完成数，优先展示今日进行中与近72小时截止（与“近3天结束”同一时间边界）的最多3项（含长期活动）；详见2026-10-12契约。公共活动统计与私人活动数分开。精确时间按带时区的start_at/end_at判断，到截止瞬间即结束；仅日期的活动按上海服务器日历日处理，明确“具体时间未提供”。截止定时器、跨日及页面恢复刷新负责更新，不新增定时网络轮询。

保留现有 `ACTIVITY_CALENDAR` 开关，统一使用全站内测门禁。具有任何订阅历史（含已取消）的账号禁止更换游戏；改名不受影响。删除游戏账号同时删除其订阅及个人进度，确认文案已同步。

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
# 管理员 JSON 批量导入（2026-10-09）

2026-10-12：手工活动与社区建议允许结束日期留空。开放结束活动按开始日期纳入列表、月历、时间线、今日摘要与订阅，日期范围显示“持续进行”；时间线只延伸到当前可见右边界。它们不进入近3天结束筛选，但可进入今日个人待办摘要。管理员可编辑原记录补齐结束日期；直接重导不同结束日期会按现有自然键视为另一条活动。私人事项和卡池派生规则不变。

在 `/calendar/admin` → **活动目录**，点击与“新建活动”并列的次要按钮“批量导入”。仅 `activity_calendar:write` 管理员可见，后端两个导入接口也独立校验 JWT 和权限。功能只创建手工活动，不导入卡池或招募，不覆盖/删除现有活动。

1. 下载弹窗中的 [JSON v1 两条示例](../../public/examples/activity-calendar-v1.json)，调整标题/日期，选择 UTF-8 `.json` 文件或直接粘贴。
2. 点击“校验并预览”：查看待新建、已存在、文件内重复、错误/冲突及将公开数量；错误与差异可筛选，结果每页10条，并指出条目序号和字段。详情可查看规范化说明、来源和内部备注。
3. 有错误/文件内冲突则修正原 JSON，重新预览；修改或换文件立即取消旧预览。重复跳过不阻塞。核对后勾选确认，再点“确认导入”。
4. 成功/部分失败报告保留，目录刷新；若失败或响应超时，重新预览**原 JSON**并确认，已创建记录跳过。关闭未提交/部分失败草稿时沿用未保存提示。

推荐格式为 `{"schema_version":1,"items":[...]}`，也接受顶层数组。原文最多 **1 MiB（UTF-8字节）**、每批 **1–200 条**，服务器再次执行限制。必填 `game/title/category/start_date`；`end_date` 可省略或为 null，表示持续进行。游戏仅 `代号鸢/如鸢`，类型仅 `ACTIVITY/LOGIN/SHOP/MAINTENANCE/OTHER`。标题 trim 后1–120字、说明与内部备注各≤1000字、http(s)来源链接≤2048字；时间为 `HH:mm`，有结束日期时须成对，无结束日期时仅可填开始时间；已填写日期为 `YYYY-MM-DD` 且结束不得早于开始。时区缺省 **Asia/Shanghai**，推荐所有活动使用该服务器时区；启用缺省 **true**，会在现有公共日历展示。设置 `enabled:false` 的新建活动只在管理目录出现。详情及完整可复制模板见 [下载示例](../../public/examples/activity-calendar-v1.json)。禁止 `RECRUITMENT`、服务器管理字段和未知字段/类型/版本。

重复依据为游戏+类别+规范化标题+起止日期+精确时间+时区，包含停用历史活动。同名跨期/跨游戏不合并。已有同键内容差异明确提示并跳过，文件内同键不同内容阻止整批提交。并发批量导入利用 Mongo 稳定 `_id` insert 保证唯一；不覆盖既有数据。避免在导入时从单条新建入口同时创建同一活动。预览后输入或相关目录数据变化，服务器409要求重新预览。

API 请求：`POST /v1/admin/activity-calendar/import/preview` body `{json: 原始文本}`；提交 `POST /v1/admin/activity-calendar/import/commit` body `{json: 同一原文, preview_token: 预览令牌}`。成功响应 `data` 内含 counts、1起始 `rows[].row/status/data/issues[{field,message}]/event_id`；200提交响应仍须检查 `failed`，部分失败不等于全成功。

最小前端回归（cwd YuanHub）：

```bash
node --test test/activityCalendarImport.test.js test/activityCalendar.test.js
npm run test:behavior -- behavior/activityCalendarImport.spec.js behavior/activityCalendarAdmin.spec.js behavior/activityCalendarApi.spec.js behavior/activityCalendarIdentity.spec.js
```

真实布局重点检查320/390/768/1440及手机横屏：卡片预览、分页、独立滚动、底部确认、44px操作目标、焦点陷阱/恢复；真实手机软键盘和Safari仍须人工验收。页面和公共三视图无需改动。


## 综合筛选与时间状态（2026-10-09）

默认仍显示全部游戏、全部类型与全部时间状态。手机点击“筛选”打开原 Bottom Sheet，勾选“不含招募”即可保留活动、登录/签到、商店/兑换、维护和其它；类型仍为单选，选择“招募”就是仅招募。桌面在原筛选区直接操作。时间状态为互斥的“全部 / 进行中 / 近 3 天结束”，不改变今日统计数字的控件语义。

筛选 URL 新增 `exclude_recruitment=1` 和 `status=ongoing|ending`。与既有 game/category/view/date/scope/pending 兼容，重复值只取第一项，非法值忽略；刷新、分享及历史导航均由 Query 恢复。交互中最后一次明确操作生效：开启“不含招募”会清空招募类型，选择“招募”会取消排除；矛盾的手写分享链接以明确的 category=RECRUITMENT 优先。新条件在统一展示数据上过滤，不发新后端参数，也不因单独切换新条件重新请求。

进行中采用开始包含、结束不包含的时间区间；优先 start_at/end_at，只有日期时按北京时间起始日零点至结束日次日零点判断，结束日期当天整日有效。“近 3 天结束”指正在进行且剩余时间不超过 72 小时（含边界），阈值集中在 CALENDAR_ENDING_WINDOW_MS。复用原页面时钟和边界定时器，在开始、进入72小时窗口及结束时更新，不增加高频轮询；后台恢复后重新核对时间。存在未保存进度时延后自动变化，避免隐藏草稿。

手机紧凑入口与桌面内容旁显示具体筛选摘要，较长摘要换行；有非默认条件时可直接“清除筛选”，空结果也提供恢复动作。清除游戏（公共模式）、类型、排除招募和时间状态，保留视图、日期锚点、全部/我的订阅模式及账号。我的订阅显示账号锁定游戏，清除不能解锁或切换游戏；原 game Query 保留用于返回公共模式。展示过滤不删除记录、不改变已订阅/完成状态、不可用记录或账号订阅总数。

三视图共享同一过滤结果及各自原有请求日期窗口。今日摘要仍按当前游戏、类型及招募条件统计公开活动的日历日覆盖，不应用时间状态或个人活动状态，不表示个人订阅数；原“进行中”统计仍指严格跨越今天的活动。

## 细分类别与共享语义色（2026-10-09）

`src/data/activityCalendarTypes.js` 是四组展示、细类、细目的单一映射；`eventTypeColors.js` 集中定义浅背景、深文字、描边、窄色条和招募封面色。`activityCalendar.js` 保留 category 原值，规范化时透传可选 `subtype/subtype_detail/pool_type`，未知细类保留事件并使用中性兜底。不会使用活动标题或“星图”等历史名称重新分类。

| 展示一级 | 二级 / 细目 | 持久化 category | subtype / subtype_detail | 色彩及标记色 |
| --- | --- | --- | --- | --- |
| 活动 | 大型活动 | ACTIVITY | LARGE_EVENT | 绛红 #A6514A |
| 活动 | 中型活动 | ACTIVITY | MEDIUM_EVENT | 绛红 #A6514A |
| 活动 | 地宫 | ACTIVITY | UNDERGROUND | 紫 #88669F |
| 活动 | 泰山府 | ACTIVITY | TAISHAN_FU | 紫 #88669F |
| 活动 | 签到 | ACTIVITY 或旧 LOGIN | SIGN_IN；旧 LOGIN 缺字段也映射签到 | 蓝 #597D9B |
| 活动 | 家具 | ACTIVITY | FURNITURE | 黄 #97762A |
| 活动 | 家具 → 神秘洞窟 | ACTIVITY | FURNITURE / MYSTERIOUS_CAVE | 黄 #97762A |
| 活动 | 未细分（旧 ACTIVITY） | ACTIVITY | null 或未知值 | 中性 #887B68 |
| 卡池 | 限定 | RECRUITMENT（派生） | 目录 pool_type | 金 #98722A |
| 卡池 | 复刻 | RECRUITMENT（派生） | 目录 pool_type | 蓝 #597D9B |
| 卡池 | 照影 | RECRUITMENT（派生） | 目录 pool_type | 紫 #88669F |
| 卡池 | 自选 | RECRUITMENT（派生） | 目录 pool_type | 绛红 #A6514A |
| 卡池 | 常驻 / 类型未知 | RECRUITMENT（派生） | 目录 pool_type；缺字段也回退 | 中性 #887B68 |
| 商店 | 卡池商店 | SHOP | RECRUITMENT_SHOP | 灰 #7D7972 |
| 商店 | 活动商店 | SHOP | ACTIVITY_SHOP | 灰 #7D7972 |
| 商店 | 未细分（旧 SHOP） | SHOP | null | 灰 #7D7972 |
| 其他 | 维护 | OTHER 或旧 MAINTENANCE | MAINTENANCE；旧 MAINTENANCE 缺字段也映射维护 | 灰 #7D7972 |
| 其他 | 星池 | OTHER | STAR_POOL | 橙 #AC672E |
| 其他 | 未细分（旧 OTHER） | OTHER | null 或未知值 | 中性 #887B68 |

所有未知非空细类（包括商店的未知细类）或类别不匹配均回退中性，不删除条目。中文文案不是存储主键。`subtype_detail` 只有 MYSTERIOUS_CAVE，必须位于 FURNITURE 下；表单分组仅活动/商店/其他，卡池只在招募目录维护。旧 LOGIN/MAINTENANCE 编辑时初始展示四组和对应细类，但不改写原 category；用户主动改分组/细类才调整。PUT 的两个可选字段为完整替换，null 清空。建议提交、原始资料、审核、采纳快照和 JSON 预览都显示完整层级。批量导入示例同时包含家具细目与旧 LOGIN 格式。

后端直接将权威目录 `pool_type` 附到日历派生响应，`recruitmentPoolTypes.js` 同时供日历和 `RecruitmentTimeline.vue` 使用。规范化先 trim、英文 lowercase：明确别名为 limited、rerun、zhaoying、choice/select、permanent/standard，以及历史已知“傅融地宫”“重逢限定”。接受由“自选/照影/复刻/限定”组成的类型及可选“卡池/招募”后缀，按自选 > 照影 > 复刻 > 限定的既有优先级判定；常驻及可选后缀单独识别。“常驻限定”“并非限定”或未审查的自由文本均回退中性。仅解析 pool_type，不解析活动标题；招募封面保留原淡金 #F2DFAD、淡蓝 #D9E8F5、淡紫 #E7DCF4、淡红 #F1D5D1。常驻与未知不强标限定。前端不会恢复后端已过滤的隐藏/停用卡池。

日程保持暖白卡与左侧 3px 分类色条，类型标签带文字、浅底和细描边。时间轴使用同一 token 的浅背景和左侧标记，类型/游戏用短文字；结束提醒仅影响倒计时文字，选中使用外框与标题下划线，均不覆盖类型色。月历不染日期格，窄屏最多 3 种不同色点加完整活动数量，桌面最多 2 条带细色线的“类型 · 标题”及 +N；日期按钮的可访问名称含全部类型，选中当日显示完整卡片。颜色不是唯一信息，现有日期边界、重叠、键盘详情和焦点恢复保留。

地宫/泰山府共享紫色和相同关联提示；家具/神秘洞窟共享黄色，洞窟始终显示在家具下。无权威关联标识时不声明同一期、不视觉合并条目；家具/洞窟同档日期由维护者核对。每个记录仍独立计数、时间、ID、订阅和进度。商店按人工需求录入，不由卡池/活动自动派生。未新增定时任务、常驻细类 Chips 或图例，类型文字已说明颜色语义。

现有六种 category 精确筛选和 URL 语义仍保留（LOGIN 与 MAINTENANCE 可单独选择），四组仅负责展示，不扩张筛选状态或后端查询语义。紧凑入口/Bottom Sheet、“不含招募”、时间状态、今日统计、我的订阅、账号游戏锁定均沿用原逻辑。

本任务风险为 L3（兼容新增 API/持久化/导入字段）。最小验证（cwd YuanHub）：

```bash
node --test test/activityCalendar.test.js test/activityCalendarTypes.test.js test/activityCalendarSuggestions.test.js test/activityCalendarImport.test.js test/activityCalendarViews.test.js
npx --no-install vitest run behavior/activityCalendarTypes.spec.js behavior/activityCalendarAdmin.spec.js behavior/activityCalendarSuggestions.spec.js behavior/activityCalendarImport.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarFilters.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/recruitmentTimeline.spec.js
```

本地浏览器证据使用现有 5173 服务和拦截 API 的合成资料，不能代替真实登录/目录联调或真实设备键盘。后端须先支持两个新增可选字段再使用新录入表单；未授权重启现有服务。后端隔离 Mongo 的最小待执行命令参见后端 API 文档。

## 活动待办与整期完成（2026-10-12）

订阅即当前游戏账号想完成的本期活动，新增订阅默认未完成，不要求创建清单。在活动卡的订阅操作旁点击“标记本期完成”，本期移出我的待办、进入已完成；“撤销完成”恢复为待办。全部活动仍显示公共活动。标记只影响当前用户×游戏账号×稳定活动ID，不删除订阅、公共目录、备忘、清单、私人事项或卡池记录。

“我的日历”默认显示我的待办，一个“个人活动”选择框切换我的待办/已完成/全部订阅，与原时间、类型、日期及日程/时间轴/月历组合。URL使用 `scope=mine&task=todo|completed|all`；无task时默认todo，历史pending=1兼容为todo，显式pending=0为all，合法task优先。公共/个人切换保留task偏好，公共视图忽略task；不保存账号ID。清除筛选只清时间/类型/公共游戏/排除招募，不改变个人状态、视图或日期。浏览器前进后退和刷新使用URL中的显式状态。私人事项在待办和全部订阅可见，在已完成或活动类型/时间筛选时隐藏并说明口径。

清单进度与整期完成独立：0/3也可整期完成，3/3也可保持整期待办。“编辑待办”只保存Checklist；删除最后一项不会改变整期状态。旧备注/自定义标题/旧completed保留为只读历史；明确manual_completed=true的手动证据仍算完成，其余缺失/null/false一律未完成，绝不从标题或清单猜测。读取不写库，无批量迁移。

有任何未保存日历草稿时，完成按钮禁用并提示先保存或收起修改，避免完成后移出列表导致丢稿。完成只发送account_id/expected_version/completed，不透传清单或备忘。409/网络结果不明时阻断重复保存，使用“读取最新状态”恢复；Checklist草稿仍须显式确认才替换。完成导致卡片消失后，键盘焦点回到个人活动选择框。

截止不等于完成。过期未完成活动在所属日期显示“已过期 · 本期未完成”，可调整日期查看历史并手动完成；停用/删除/改游戏的源进入不可用区域，保留活动ID、清单和备忘，允许管理完成状态或取消订阅。恢复订阅沿用原状态；已截止/不可用来源仍不能新订阅或恢复。改日期/目录名称沿用同一活动ID；新档期必须使用新ID，不能靠同名或时间重叠继承完成。

首页复用“我的待办 · 今日与临期”，统计全部尚未完成的订阅（包含过期/不可用），优先列出近72小时截止（与“近3天结束”同一时间边界）与今日进行中的最多3项；长期活动也可列出。不可用/已结束活动不进入今日列表，但保留待办数量。日期型遵循上海日历日；有精确时刻的活动按end_at判断。点击活动跳转个人待办月历、对应日期与稳定event ID并定位卡片。无登录/无账号不发私人请求，空态、失败重试和账号切换隔离沿用现有逻辑；完成后的成功更新刷新对应账号摘要，无N+1或推送服务。

升级先后端再前端。无需改索引或数据迁移；回退前端不丢manualCompleted，但回退旧后端会重新按旧清单规则解释状态，需配套回退或继续保留兼容后端。

最小验证（cwd YuanHub）：

```bash
node --test test/activityCalendarSubscriptions.test.js
npx vitest run behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionApi.spec.js behavior/todayCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/calendarPrivateItems.spec.js
```

## 私人日历事项（2026-10-10）

`scope=mine` 仍兼容旧链接，界面名称改为“我的日历”：显示当前游戏账号的官方订阅和独立私人事项。顶部“添加私人事项”适用于三视图；月历先选日期，再通过日期详情的“记一件事”预填当天。缺少账号时先选择/创建账号，所属游戏由账号推导。

私人事项需要内容（去首尾空白后1–100字）、开始日期和结束日期；新建均预填选中日期，没有选中日期时使用上海今天。起止日期是闭区间，允许同日、跨月、跨年和长跨度；结束不得早于开始，必须是真实日期。可选一个上海时间 `HH:mm`，只表示开始日时刻；留空为全天，附加说明为最多1000字纯文本。没有结束时刻、完成状态、活动ID或订阅操作。新建仅在结束日未被明确编辑、开始日超出默认结束日时同步结束日；编辑既有事项不自动调整区间，非法日期组合内联提示并禁用保存。保存后保持原URL、视图和日期；保存到当前范围外会提示选择对应日期查看。

私人事项使用独立 `PRIVATE_ITEM` 视图模型和茶棕标识，三视图复用日期分组/分轨：月历覆盖首尾内每天并可查看详情，时间轴按完整区间绘制一条横条、在视窗两端裁剪，日程沿用跨日活动分组且每条仅出现一次。卡片显示完整起止日期，可选时间标注“开始日”，不生成结束倒计时；支持编辑和确认删除。官方类型、时间状态及“已完成”视图时隐藏私人事项并说明口径；“不含招募”不排除私人事项。“全部活动”、首页今日统计、社区建议和公开API保持公共口径。

独立页面级 `useCalendarPrivateItems` 绑定用户、账号及身份epoch，切换同步清空旧内容，拒绝迟到响应；请求带 `expectedUserId`。401/403/账号失效清除私人内容。复用原未保存保护覆盖关闭、路由、账号、日期和视图切换；网络失败和409保留草稿，409读取最新内容须先确认放弃。保存中禁重复操作，删除取消/失败保留原记录。

API为 `/v1/activity-calendar/private-items`，沿用 JWT 及全站内测门禁；详情/写入均带 `account_id`，更新和删除须带 `expected_version`。创建/更新使用成对 `start_date/end_date`，所有响应返回两端日期及兼容别名 `date=start_date`。历史仅有 `date` 的记录读取为同日起止，不回写；旧 `date` 请求仍可创建或编辑单日项，但不能编辑已有多日项（422，原区间保留）。缺省 `time/note` 的更新保留旧内容，显式 `time:null`/`note:""` 可清空。前后端升级先后端再前端；旧客户端只能显示开始日，应升级前端后使用多日项。列表必填 `from/to`，按 `start_date <= to && end_date >= from` 重叠查询，含首尾最多100天、最多1000条，超限422要求缩小范围。每个请求由服务端重新校验归属，前端隐藏不构成隐私边界。账号重命名保留事项；有私人事项时禁止改变账号游戏，删除账号在同一事务清理事项并阻止竞态孤儿数据。不迁移公共事件或订阅数据。

定向检查：

```bash
node --test test/calendarPrivateItems.test.js test/activityCalendar.test.js test/activityCalendarViews.test.js test/activityCalendarTypes.test.js test/activityCalendarSubscriptions.test.js
npx --no-install vitest run behavior/calendarPrivateItems.spec.js behavior/calendarPrivateItemsApi.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarUnsaved.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarFilters.spec.js behavior/activityCalendarTypes.spec.js behavior/activityCalendarIdentity.spec.js behavior/activityCalendarSession.spec.js behavior/todayCalendarSubscriptions.spec.js behavior/activityCalendarSuggestions.spec.js
npm run test:static
npm run build
```

真实手机软键盘、Safari与真实账号前后端联调需人工验收；浏览器合成API验证不代表这些环境通过。具体结果见根任务 `10-10-activity-calendar-private-items/verification.md`。


私人事项日期区间定向验证：

```bash
node --test test/calendarPrivateItems.test.js test/activityCalendar.test.js test/activityCalendarViews.test.js
npx vitest run behavior/calendarPrivateItems.spec.js behavior/calendarPrivateItemsApi.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarUnsaved.spec.js
```

浏览器复用既有开发服务，以模拟 API 验证六视口和保存，脚本 `test-support/calendarPrivateRange.browser.js`：`playwright-cli -s=private-range run-code --filename=test-support/calendarPrivateRange.browser.js`。先用该独立会话 `open http://localhost:5173`；不使用真实登录信息或数据库。真实手机软键盘、Safari及真实JWT联调仍需人工检查。

## 招募 UP 名称（2026-10-12）

公共招募日历使用后端只读 `up_agent_names` 名单，在池名下显示完整“UP 密探：甲、乙”。日程、月历当天清单、时间轴选中详情共用 `CalendarEventCard`；长名单允许换行，复用现有正文颜色与安全换行样式。我的日历中的公共订阅沿用同一名单；私人事项及其它类型不展示。

月历色条第一行保留池名，第二行显示“UP · 甲 / 乙”；超过两位显示“+N”，单列窄条显示首名与余量，省去 UP 前缀以优先露出姓名。时间轴复用第二行，优先显示相同 UP 摘要，随后保留池类型、游戏与结束提醒；单日条显示首名与余量。长姓名按可用宽度省略，不缩小字体或扩张周行数。按钮的可访问名称始终包含完整正式名单，触摸或 Enter/Space 激活原生按钮可进入完整详情，时间轴关闭详情后恢复入口焦点，不依赖悬停。月历仍为窄屏最多 3 行、宽屏最多 4 行，保留跨周分轨与 +N 完整清单入口。

前端只接收 `source_type=RECRUITMENT_POOL` 且 `category=RECRUITMENT` 的 snake_case 数组，过滤非字符串、空名称并保序去重。旧 API 缺字段、旧目录和没有正式 UP 的池不显示副行。后端只返回 `verified/partial` 池中有效且已绑定图鉴的槽；占位与来源候选不会冒充正式名单，前端不从 `source_up_agent_names` 或个人记录推断。

最小回归（仓库根）：

```bash
node --test test/activityCalendar.test.js test/activityCalendarViews.test.js
npm run test:behavior -- behavior/activityCalendarUpAgents.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarSubscriptions.spec.js
```
