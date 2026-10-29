# 活动日历（Batch 03 + 04 + 05）

`/calendar` 与活动建议路由面向所有已登录且具备全站内测资格的用户开放，不要求管理员身份。未取得资格或资格读取失败时进入 `/beta`，保留安全回跳；使用日历公共列表不要求子账号。默认全部游戏；`game`（代号鸢 / 如鸢）和 `category`（ACTIVITY / RECRUITMENT / LOGIN / SHOP / MAINTENANCE / OTHER）保存在 URL query，可分享。未知筛选值按全部处理。`view=agenda|timeline|month` 与 `date=YYYY-MM-DD` 分别表示视图和锚点日期；重复参数只读取第一项，无效值忽略。

页面通过 `Intl.DateTimeFormat.formatToParts` 计算 Asia/Shanghai 的服务器日期。日程请求今天至未来 90 天；时间轴请求锚点前 7 天至后 27 天（闭区间五周），前后导航按 35 天推进；月历请求当前月及周一至周日的补位日期，至少 35 格、最多 42 格。月份导航保留日号并钳制月末；同月份日期选择不重复请求。服务器午夜、翌日可见性恢复与 pageshow 更新日程，同一天恢复不重复读取。默认锚点随今天移动，URL 显式日期保持。日期不按用户所在时区换算；没有时间的活动不补具体时刻。

日程按今天、接下来 7 天、更晚分组，结束和开始提醒优先，跨日活动只出现一次，历史默认排除。时间轴按活动/卡池/商店/其他四组展示，重叠活动分轨、相邻区间复用轨道；闭区间条显示起止和截断边界，今天有日期头与竖线；仅面板内部横向滚动，标题在条上可见，点击条目使用与月历相同的详情弹窗。月历默认按周展示闭区间活动条，点击事项条弹出单条详情，点击日期或+N弹出当天清单；全部活动手机端改用日期网格与当日清单，详见下方说明。允许浏览历史日期。手工与招募卡池统一展示，来源文字区分。

### 月历周条（2026-10-12）

月历保留周一开头的5/6周补位范围。日期数字与色条分层，今天通过“今”及底线、选中日通过浅蜜黄底/边框/下划线区分。`monthCalendarWeeks` 仅生成前端显示模型，复用业务日期和区间函数，不更改 API、数据或筛选；同一 ID 去重后按起始日期、持续范围和 ID 排序，跨周尽量保留原轨道，空轨会压缩。

手机与平板默认最多3层，宽度达到1024px时4层；空周只留日期行。跨日条覆盖首尾日期；跨周、跨可视区与无结束日期通过箭头和虚线端点提示延续。类型文字与浅色token共同表达分类，长名称省略后可点击查看全文。`+N` 是该日期未在已显示轨道出现的真实事项数，每周切片不制造新活动 ID，也不把跨日重复计数相加。

点日期保持原 URL `date` 单源并打开当天清单；点色条选中该片段内的选中日（否则片段首日），仅打开该事项；点 `+N` 打开完整当天清单。初次进入与月份箭头导航不自动打开详情，原周下清单已移除。打开动作在导航/草稿确认完成后生效，跨月读取在弹窗内反馈，取消导航不打开旧选择。手机小于768px使用底部弹层，其余宽度居中显示；正文在90dvh范围内滚动，标题、关闭和底部操作始终可达。复用完整卡片、订阅待办和私人事项操作；编辑私人事项暂时隐藏详情，保存/取消回到原详情，删除后显示最新清单或失效提示。关闭按钮、完成、遮罩和Esc统一确认未保存待办，取消保留草稿，接受才放弃；关闭返回入口焦点并保留页面滚动。账号/身份/查询上下文变化清理旧选择，迟到导航接受不能恢复旧账号详情。主日期与事件操作至少44px高，320px下日期宽度至少44px。媒体查询只调整显示层数，不写用户设置或重复请求。

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

我的日历手机端信息架构（2026-10-16）：仅 `scope=mine` 且宽度小于 768px 启用 `.calendar-mine-mobile`。顶部保留与全部活动相同尺寸和间距的「活动日历」标题，随后共用三行工具排版：「全部活动 / 我的日历 + 筛选」、三视图、账号选择与今天；两种模式的选中态、行距及页头到工具区间距一致。添加私人事项仅在 mine 的下一独立行靠右展示，跨整行避免撑宽筛选所在列。公开统计不在个人手机模式展示。「我的待办 / 已完成 / 全部订阅」移入筛选面板的「订阅活动 · 本期状态」，继续沿用 `task` 与旧 `pending` 参数。重置类型/时间仍保留订阅状态；非默认订阅状态作为可取消的筛选标签显示。账号说明移入面板内折叠帮助，错误、身份变化与草稿提示继续展示。

日程合并「今天 + 日期 + 真实项数」，不再重复日期及 TODAY；今日无事项而后续有事项时显示零项提示及原后续分组。卡片优先展示标题、活动时间状态和日期，游戏/分类降为辅助信息；「类型未标注」弱化，待办数量仍来自真实清单，不新增进度条。订阅本期完成与待办清单完成保持独立，私人事项仍没有完成状态。类型、时间状态或已完成条件隐藏私人事项的原规则不变，面板和页面保留隐藏原因；不含招募不隐藏私人事项。

展示边界：`index.vue` 只监听 767px 展示断点，通过 Teleport 移动同一工具实例，不改用户视图、URL、账号或请求范围。`CalendarAgendaView` / `CalendarEventCard` 以 `personal` 属性隔离个人紧凑模式；布局样式只在独立 Mobile 文件中以个人模式作用域生效。≥768px 保持原有展示；全部活动手机端采用下述独立方案。风险 L2（筛选入口和响应式展示连接），后端、订阅协议、完成与私人事项字段不变。

### 全部活动手机端（2026-10-16）

仅非 `scope=mine` 且 <768px 启用 `.calendar-public-mobile` 和 `compactPublic` 展示属性。标题缩小，范围/筛选、三视图、账号/今天分三行；时间轴和月历将今日公开统计折叠，仍可展开查看原统计及口径。筛选条件可逐项取消，原账号切换器和工具实例保留。

日程复用原分组，`CalendarPublicEventSummary` 展示完整标题、活动时间状态、真实倒计时/日期、游戏/类型与完整 UP 名单；个人订阅及本期完成状态独立标识。点击标题箭头打开原 `CalendarDetailDialog`，完整说明、关联/来源、订阅/取消、完成及待办仍由原卡片和控件承接，不新增写入协议。订阅读取失败不冒充“未订阅”。桌面原卡片有草稿时延迟切换摘要，手机详情打开后跨断点保留原编辑器。

时间轴仍为五周横向画布，不改日期宽度、区间位置、轨道分配、今天线与定位。条内手机摘要只显示标题，窄条最多两行，完整标题/UP/日期/状态继续通过可访问名称、原生提示和详情获取；分类显示真实项数并可折叠，>=768px 或 mine 不继承折叠效果。

手机公共月历不挂载跨日条和 `+N`：七列日期保留原 35/42 格补位及日期语义，用前三项活动的类型色点和真实项数表示分布。直接复用 `monthCalendarWeeks` 的 `day.items`，跨日/跨月/无截止活动不丢失。选日仅沿用原 URL 日期导航，下方显示完整当日摘要清单；单条标题进入原单项详情，“查看全部”进入原当日弹窗。加载/失败不展示陈旧清单或假零项。公共手机详情不出现私人事项新增入口。

本轮风险 L2，仅局部展示与选日交互；mine 专属布局、>=768px 原表现、后端/API/时间计算不变。新增 `behavior/calendarPublicMobile.spec.js`，并将旧的跨日条断言明确放在桌面场景、焦点测试使用真实 Vue Teleport、待办测试通过新摘要进入原详情，保留原有效断言。

最小非浏览器验证（cwd `YuanHub`）：

```bash
npx vitest run behavior/calendarPublicMobile.spec.js behavior/calendarMineMobile.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarFilters.spec.js behavior/calendarDetailDialog.spec.js behavior/activityCalendarUnsaved.spec.js
git diff --check
```

人工检查 320/390/430px 的三视图首屏、长标题/账号、单日及跨日时间条、选日清单/详情/订阅、筛选/账号/今天；切换 mine 与 768/1440px，核对原布局与草稿保护。不运行浏览器自动化，真实几何、触控及 Safari 表现尚未验证。

本次最小非浏览器回归（cwd YuanHub）：

```bash
npx vitest run behavior/calendarMineMobile.spec.js behavior/activityCalendarFilters.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/calendarPrivateItems.spec.js behavior/activityCalendarUnsaved.spec.js
git diff --check
```

本次实际结果：上述 6 个文件共 225 项通过；4 个 Vue 组件、3 个独立样式文件与订阅 composable 定向编译/解析通过；`git diff --check` 通过。新增手机个人模式、公开/桌面隔离、URL/历史、私人事项隐藏、真实待办、本期完成焦点与跨断点草稿测试；原筛选测试 mock 按媒体查询区分对象，保留原焦点/滚动锁/监听清理断言。未运行全量回归或生产构建。

人工验收：在 390×844、320/430px 下检查我的日历日程首屏是否能看到首张卡片标题与关键日期、长账号名无横向溢出；切换三视图、日期、筛选与账号，检查草稿取消/确认及私人事项隐藏提示；检查标记/撤销本期完成、待办编辑、订阅/取消、私人事项新增/编辑/删除。切回全部活动、放宽到 768/1440px，核对原有布局。未执行浏览器自动化，实际首屏几何、触控和 Safari 表现需用户确认。

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

`CalendarFilterSheet` 使用Teleport、`useModalFocus`、标题初始焦点、Escape/遮罩关闭及入口焦点恢复；打开时锁body/html滚动，关闭和卸载恢复原overflow/padding。仅打开期间监听1024px断点，变宽跨入桌面时自动关闭、释放锁和焦点陷阱；再次变窄不自动打开。窄屏弹层最大高度 `min(76dvh, 640px)`，选项区域内部滚动，完成和重置保留在滚动区域外，底部及两侧包含Safe Area。

筛选操作位置优化（2026-10-15）：顶部右侧为低强调的“重置筛选”，底部为全宽茶棕色“完成”主按钮，避免习惯性点击底部时清空条件。完成仅关闭并保留已选条件，重置保持弹层打开；键盘焦点按顶部重置、筛选选项、底部完成的顺序循环。底部按钮至少48px高，保留Safe Area留白。

桌面筛选定位（2026-10-15）：≥1024px 的弹层以筛选按钮为锚点，默认在按钮下方8px、左边缘对齐，距视口左右边缘至少16px；下方空间不足且上方空间更大时向上展开。最大高度按可用空间收缩（上限640px），仅选项区域滚动；打开期间随窗口缩放或滚动更新定位，关闭/卸载移除监听。手机和平板继续使用底部弹层。

本轮风险L1（局部组件交互，URL/API契约与共享状态未改变）。测试新增 `behavior/activityCalendarFilters.spec.js`，真实布局与横屏另由浏览器验收。用户/CI最小回归（cwd YuanHub）：

```bash
npm run test:behavior -- behavior/activityCalendarFilters.spec.js behavior/activityCalendar.spec.js behavior/activityCalendarViews.spec.js
```

工作区实施与验收记录：`.trellis/tasks/10-03-activity-calendar-mobile-filter/`；真实手机Safari、触控与Home Indicator安全区仍需设备验收。

用户活动资料建议（2026-10-03）：公共日历在活动内容下方、站点页脚之前提供社区补充区域：“建议补充活动”为描边按钮，“我的建议”为次级文字入口。有活动与空状态复用同一区域，顶部专注日期、视图与筛选。访客直接访问日历或建议 URL 时先经过全站内测门槛，再按开放状态登录回跳。`/calendar/suggestions/new` 与 `/calendar/suggestions` 要求有效登录与全站内测资格，共用 `ACTIVITY_CALENDAR` 开关，不额外要求子账号或日历写权限；后端提交/本人列表/详情同样由 Beta 门禁保护；本次不改变该开关默认值，部署与开放由现有发布流程控制。

提交页只预填合法 `game`，日期由用户填写，不继承浏览历史月份。支持五种手工类别，来源 http/https 链接必填；招募线索仍走反馈或卡池维护。公开说明与“给审核员的补充说明”分别填写，后者只对提交人与审核员可见。建议提交后只读，不能修改或撤回。不采纳后可按原因补全资料重新提交。

提交失败保留草稿；字段错误使用内联提示与可聚焦摘要。网络错误或未知结果会锁定本次资料与 `client_request_id`，“重试相同资料”复用它们；开始新的提交需要确认并使用新标识，建议先查个人列表，避免重复。个人列表支持状态筛选和每页 20 条分页，详情显示原始资料、审核时间、说明、采纳时公开快照以及当前活动状态。活动停用后仍显示历史“已采纳”，同时明确“当前已停用”，不提供会误导的公共活动跳转。

`/calendar/admin` 新增“活动目录 / 用户建议”切换，原活动目录行为保留。用户建议默认待审核，支持游戏、状态与分页。审核区先显示只读原始资料，再显示预填的正式活动编辑器；宽屏可并排对照，窄屏顺序阅读。私人说明不自动复制到公开说明或管理备注。审核员可主动按游戏与日期重叠检查已有活动；采纳和不采纳均需确认，不采纳原因必填。采纳创建启用的 MANUAL 活动，不采纳是终态。已处理详情只读。

活动目录默认按活动开始日期由新到旧展示，筛选区“排序”可即时切换为由旧到新，无需重新请求。日期相同时按开始时间同向排序，未填时间视为当日最早位置；日期与时间均相同则按活动 ID 稳定排序。排序同时适用于手工活动和只读招募卡池，筛选刷新及编辑保存后保留当前顺序，“清空筛选”恢复由新到旧；不持久化排序偏好。

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

首页的真实待办清单与个人临期活动分层，展示范围、计数与直接勾选见下文“首页真实待办（2026-10-13）”。公共活动统计与私人活动数分开。精确时刻按带时区的start_at/end_at判断，仅日期的活动按上海服务器日历日处理。边界定时器、跨日及页面恢复刷新负责更新，不新增定时网络轮询。

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

手机端收紧标题、视图切换、账号及今日摘要之间的留白；「公开统计口径」明确摘要不是当前时间轴的活动数量。时间轴标题常驻标注「五周范围 · 左右滑动查看日期」，导航仍按五周移动。多日活动的文字宽度按活动条与当前滚动视口的交集收缩，并随滚动、定位及容器宽度变化更新，避免条尾进入视口时文字向左裁切；第二行优先显示游戏，完整类型与时间继续保留在可访问名称及详情中。

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

## 两级分类与历史兼容（2026-10-29）

`src/data/activityCalendarTypes.js` 统一定义展示分类；`eventTypeColors.js` 保持共享语义色。一级分类按活动、常驻、卡池、其他排列，斜杠名称是一项，不拆开。

| 一级 | 二级 | 持久化 category / subtype |
| --- | --- | --- |
| 活动 | 活动/周年 | ACTIVITY / LARGE_EVENT |
| 活动 | 地宫/鸢会 | ACTIVITY / UNDERGROUND |
| 活动 | 签到/查岗 | ACTIVITY / SIGN_IN |
| 常驻 | 当季星图 | ACTIVITY / SEASONAL_STAR_CHART |
| 常驻 | 白鸽 | ACTIVITY / WHITE_PIGEON |
| 常驻 | 密探特训 | ACTIVITY / AGENT_TRAINING |
| 常驻 | 历练/洞窟 | ACTIVITY / TRIAL_CAVE |
| 卡池 | 限定、复刻、照影、自选 | RECRUITMENT；权威招募目录 pool_type，只读 |
| 其他 | 其他 | OTHER / OTHER |

常驻是活动展示分组 `PERMANENT`，与招募目录的常驻卡池无关。项目招募资料使用「照影」，未取得足以改名的官方证据，因此保留「照影」及 `zhaoying`。

旧 LOGIN（无 subtype 或 SIGN_IN）显示活动·签到/查岗；旧 FURNITURE_TRIAL、MYSTERIOUS_CAVE，以及 ACTIVITY/FURNITURE + subtype_detail=MYSTERIOUS_CAVE 显示常驻·历练/洞窟，原编码不变。MEDIUM_EVENT、TAISHAN_FU、无明确细目的 FURNITURE、FIRST_MEETING_ROULETTE、STAR_POOL、维护、商店及未知类型均待归类，不根据标题推断。玩家默认完整列表和三个视图保留这些记录；时间轴在「待归类」区呈现，不将其误标为其他。管理列表/编辑器提示原始 category/subtype/detail。新选项不增加待归类或第三层。

表单继续只有一级、二级；编辑标题等字段保留旧编码，主动重选才规范化并清空旧细目。用户建议及审核复用相同字段和校验，招募卡池仍只读。旧 `category` URL 保留存储类别语义；旧 `display_group=FURNITURE` 转换为 `PERMANENT`，已有视图与筛选偏好存储机制不变。

后端直接将权威目录 `pool_type` 附到日历派生响应，`recruitmentPoolTypes.js` 同时供日历和 `RecruitmentTimeline.vue` 使用。规范化先 trim、英文 lowercase：明确别名为 limited、rerun、zhaoying、choice/select、permanent/standard，以及历史已知“傅融地宫”“重逢限定”。接受由“自选/照影/复刻/限定”组成的类型及可选“卡池/招募”后缀，按自选 > 照影 > 复刻 > 限定的既有优先级判定；常驻及可选后缀单独识别。“常驻限定”“并非限定”或未审查的自由文本均回退中性。仅解析 pool_type，不解析活动标题；招募封面保留原淡金 #F2DFAD、淡蓝 #D9E8F5、淡紫 #E7DCF4、淡红 #F1D5D1。常驻与未知不强标限定。前端不会恢复后端已过滤的隐藏/停用卡池。

日程保持暖白卡与左侧 3px 分类色条，类型标签带文字、浅底和细描边。时间轴使用同一 token 的浅背景和左侧标记，类型/游戏用短文字；结束提醒仅影响倒计时文字，选中使用外框与标题下划线，均不覆盖类型色。月历不染日期格，窄屏最多 3 种不同色点加完整活动数量，桌面最多 2 条带细色线的“类型 · 标题”及 +N；日期按钮的可访问名称含全部类型，点击当日以弹窗显示完整卡片。颜色不是唯一信息，现有日期边界、重叠、键盘详情和焦点恢复保留。

地宫及旧泰山府保留紫色，历练/洞窟保留黄色。旧泰山府不据此推断分类；无权威关联标识时不声明同一期、不视觉合并条目，各记录日期仍由维护者核对。每个记录仍独立计数、时间、ID、订阅和进度。商店按人工需求录入，不由卡池/活动自动派生。未新增定时任务、常驻细类 Chips 或图例，类型文字已说明颜色语义。

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

首页“我的待办”展示真实清单，“临期活动”为次级可收起提醒；活动未完成数仍包含过期/不可用订阅，不能当成待办项数。具体范围与保存行为见下节。日期型遵循上海日历日，精确时刻按end_at判断；点击活动保留个人待办月历、对应日期、game与稳定event ID定位。无登录/无账号不发私人请求，读取失败与空态区分，账号切换和卸载忽略旧响应；跨页更新仍使用既有通知。

### 首页真实待办（2026-10-13）

首页双栏中，“我的待办”与“当前账号状态”位于左侧窄栏，“今日活动”位于右侧主栏；窄屏改为单列时保持待办优先的阅读与键盘顺序。

一级清单复用现有订阅列表，明确读取服务器今日至未来90天：显示尚未标记整期完成、尚未截止且来源可用活动的真实 checklist 标题、勾选与所属活动。列表没有条数截断，首屏最多6条，读取时未完成优先，更多可展开，已勾完项弱化但仍可查阅；保存后暂不重排，保持操作位置。计数仅表示该范围内未完成的 checklist 项，不表示全部历史/远期清单。没有清单的活动提供添加入口，不伪造待办或计入待办数。

二级“临期活动”复用最多3项的订阅摘要，只显示未来72小时内截止且尚未结束的活动；普通远期和长期活动不冒充临期。保留摘要已有排序与窗口，精确 end_at 换算北京时间显示，日期型按北京时间次日零点边界判断，日期说明可通过 time 的详细名称查看；最后24小时的截止文字加强颜色。支持组件内收起，不新增设置页或持久偏好。次级区明确展示全量尚未标记整期完成的活动数、不可用订阅数和全部订阅入口；历史、过期、超出读取范围及整期已完成的内容仍可进入日历查阅。

首页勾选使用完整列表记录的 version 和 checklist，以 progress_mode="checklist"、expected_version 保存完整原顺序清单，仅改变目标 completed，不修改 manual_completed、订阅、旧备忘或整期完成状态。同一活动保存期间阻止重复操作，不同活动可独立保存；勾选在服务端响应的版本、清单与整期语义确认后才更新。失败、409或结果不明保留操作说明并阻止旧版本写入；“读取最新状态”使用单条读取恢复完整清单，再由用户核对后重新操作，不自动重放旧资料。清单全勾选不代表整期完成。

身份/账号/game变化、登出与卸载隔离旧读取和写入；保存期间匹配账号的外部刷新延后，成功发送 calendar-subscriptions-updated，自身通知不重复读取。加载/刷新失败不冒充空清单；无订阅、当前范围无待办、清单全勾选和整期已完成分别提示。勾选与活动链接独立，保留原生 Space/Tab、44px目标、焦点与保存/恢复状态播报。

本轮风险L2，无API或后端持久化语义调整。开发期仅定向检查，实际浏览器390/768/1440、真实登录/跨页、系统时区与旧订阅兼容仍待用户主动集中回归。最小相关行为命令（cwd YuanHub）：

```sh
npm run test:behavior -- behavior/todayCalendarSubscriptions.spec.js behavior/todayActivitySummary.spec.js behavior/todayComingSoon.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionApi.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js
```

升级先后端再前端。无需改索引或数据迁移；回退前端不丢manualCompleted，但回退旧后端会重新按旧清单规则解释状态，需配套回退或继续保留兼容后端。

最小验证（cwd YuanHub）：

```bash
node --test test/activityCalendarSubscriptions.test.js
npx vitest run behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionApi.spec.js behavior/todayCalendarSubscriptions.spec.js behavior/activityCalendarSubscriptionIdentity.spec.js behavior/calendarPrivateItems.spec.js
```

## 私人日历事项（2026-10-10）

### 站内提醒（2026-10-15）

添加私人事项默认“开始日提醒／仅当天”；可选择“截止日提醒”、提前一天＋当天，或关闭提醒。历史事项默认关闭，编辑不会自动开启。提醒按北京时间日历日判断，与可选开始时刻无关；提前一天关闭后，当天仍独立提醒；错过目标日期不补发过期提醒。

登录且具备全站内测资格、选择本人有效游戏账号后，进入 Hub 的任意页面都会检查当前账号提醒；页面恢复可见、服务器午夜、账号列表变化和匹配当前身份／账号的私人事项增删改后更新。读取复用现有账号和私人事项 API，仅查询今天至明天的重叠范围，不增加定时网络轮询或浏览器通知权限。

提醒以米白／茶棕弹窗展示，标题“今天有 N 项提醒”，游戏和账号为副标题。按“今天开始／今天截止／明天开始／明天截止”固定顺序分组，无内容的组隐藏；全部事项显示为可点击卡片，长标题省略，点击进入“我的日历”月历并直接打开对应详情。桌面居中、手机底部弹层，标题和底部操作固定，长列表在弹窗内部滚动，不再折叠前三条。日期仍按北京时间判断。

底部为“稍后提醒”和“今天已知悉”，取消复选框。“稍后提醒”、右上角关闭、Esc、遮罩和查看详情均将当前批次记录到当前标签页的 sessionStorage，当前浏览会话（含刷新及组件重新挂载）内不重复，下次新会话仍可提醒；同一会话新增事项或改变提醒安排仍可显示。“今天已知悉”将当前批次记录到既有 localStorage，当天这批提醒不再显示，新事项或修改提醒日期／安排仍可提醒；仅修改标题／备注不会重置知悉状态。关闭、稍后和知悉均不代表完成事项。后台刷新保留操作焦点，迟到响应不能重新打开刚关闭的弹窗。已有业务弹窗时排队等待；保留键盘焦点约束、关闭后焦点和页面滚动恢复。读取失败清空旧内容并提供重试，不显示知悉按钮；401／403／账号失效清除私人内容。功能开关关闭、登出、资格失效或无账号时不读私人接口。

两类免打扰记录均按用户×游戏账号×上海日期隔离，仅保存事项标识和提醒安排，不保存标题／备注、不跨设备同步。每日知悉沿用 `yuanhub.calendar-reminders.v2:`，已有显式知悉仍有效，旧版普通关闭记录不继承；同浏览器标签页通过 storage 事件同步每日知悉。会话记录使用相同键的 sessionStorage，与每日记录隔离。浏览器恢复／复制标签页可能延续或继承会话，这是浏览器的页面会话语义；存储不可用时用页面内存，整页重新加载可能再次提醒。提醒设置仍随私人事项保存在服务端；首次部署提醒功能仍需**先升级后端，再升级前端**。没有新增完成状态、消息中心记录或系统推送，本次不修改后端 API。

事项定位：提醒链接等待日历数据就绪后直接打开目标事项弹窗，月历和时间轴不再通过页面滚动定位卡片；关闭清理event参数，同一提醒可再次打开。月历内选日／切视图等query导航保留当前位置并清理旧定位意图；其它query变化和后台刷新不重新打开已消费的弹窗。日程的即时卡片定位、其它页面、hash链接及历史位置恢复保持原规则。

相关自动化用例已补齐，回归由用户／CI执行（cwd `YuanHub`）：

```bash
node --test test/calendarPrivateItems.test.js test/calendarPrivateReminders.test.js
npm run test:behavior -- behavior/calendarPrivateItems.spec.js behavior/calendarPrivateReminders.spec.js
```

人工验收：手机390px／平板768px／桌面1440px及768px断点两侧，创建今天开始、明天截止且提前一天提醒的事项。检查四类分组、长网址省略、长列表内部滚动与底部按钮可达；点击卡片打开月历详情且页面位置不变。稍后／关闭后刷新当前标签页不重复，在新的独立浏览会话可再提醒；今天知悉后在新会话也不重复，同日新增提醒仍出现。切换账号无旧内容，跨北京时间午夜重新按日判断。检查 Tab／Shift+Tab、Esc、关闭后的焦点及滚动恢复，以及已有业务弹窗关闭后才展示。真实浏览器视觉、触控与滚动由用户手动验收。

弹窗回归：从其它页面及当前月历分别点击提醒标题，关闭后再点击私人事项条，应打开单条详情且页面位置不变；点日期/+N应显示当天全部事项，翻月和后台重读不应自动弹出。建议执行 `node --test test/routerScrollBehavior.test.js` 和 `npm run test:behavior -- behavior/calendarPrivateItems.spec.js behavior/calendarPrivateReminders.spec.js`。

### 基础事项行为

私人事项编辑器采用固定标题／操作栏、独立滚动正文：桌面宽度上限600px，高度不超过840px且保留视口上下间距；手机高度为94dvh，底部保留安全区域。提醒、提前提醒和附加说明均在正文滚动区域，选择提醒后新增字段不会将保存按钮推出弹窗。未改动的已有事项显示“尚未修改”。人工验收：390px手机和1440px桌面（另缩短窗口高度），打开编辑器，滚动至底部，选择截止日提醒／提前一天＋当天并展开附加说明；应能完整操作所有字段，取消／保存始终可见。真实滚动、原生选择器与软键盘表现待人工确认。

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
npx vitest run behavior/calendarPrivateItems.spec.js behavior/calendarPrivateItemsApi.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarUnsaved.spec.js behavior/activityCalendarSubscriptions.spec.js
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

### 月历详情弹窗验收（2026-10-15）

风险L3：涉及账号敏感详情、全局焦点/滚动与未保存草稿生命周期，API不变。同步更新月历、类型、UP、私人事项及未保存待办测试；新增真实Teleport的焦点/Tab/Esc、关闭入口、锁滚动恢复、错误重试、动态删除及账号A→B→A迟到导航用例。Agent仅做源码编译与静态可用性审查；以下组件回归由用户执行（cwd YuanHub）：

```sh
npm run test:behavior -- behavior/calendarDetailDialog.spec.js behavior/activityCalendarViews.spec.js behavior/activityCalendarTypes.spec.js behavior/activityCalendarUpAgents.spec.js behavior/calendarPrivateItems.spec.js behavior/activityCalendarUnsaved.spec.js behavior/activityCalendarSubscriptions.spec.js
```

人工验收：手机390px和桌面1440px进入月历，下方不应有常驻卡片；点击事项条查看单条，点日期/+N查看全部，弹窗内滚动且背景位置不变。编辑私人事项后保存/取消返回更新后的详情；修改官方待办后尝试关闭，选择继续编辑应保留草稿。关闭后点击同一提醒可再次打开，切换账号不保留原详情。真实浏览器视觉、触控与滚动尚未验证。

### 时间轴统一详情弹窗（2026-10-15）

时间轴与月历复用同一个 `CalendarDetailDialog`，点击官方或私人事项条仅弹出该事项，移除原页内展开区域。手机为底部弹层、桌面居中，保留详情内部滚动、编辑/删除、错误重试和记一件事；右上角关闭、遮罩和Esc统一确认未保存待办；单日清单保留底部“完成”，单事项移除该关闭按钮。取消确认保留原草稿；接受后关闭并释放滚动锁、返回条目焦点，保留页面及时间轴横向位置。私人编辑器打开时暂时隐藏详情，保存/取消返回同一详情；单条按ID读取，未来/历史条目及修改日期后仍显示当前范围内的最新数据。

时间轴的event链接也等待读取后直接打开弹窗，关闭清理event参数，同一链接可以再次打开。账号/身份/查询/窗口变更清理旧详情，账号A→B→A或关闭确认迟到均不能覆盖新上下文。日程视图继续展示卡片，API保持原规则；提醒关闭与知悉语义见“站内提醒”。

风险L3：共用模态焦点/滚动、账号上下文及草稿生命周期。已同步7份组件测试，覆盖未来条目、日期编辑、横向位置、深链接、编辑返回、账号清理和迟到确认；现有合成浏览器脚本继续复用通用弹窗选择器，未执行。用户最小回归命令（cwd YuanHub）：

```sh
npm run test:behavior -- behavior/activityCalendarViews.spec.js behavior/activityCalendarTypes.spec.js behavior/activityCalendarUpAgents.spec.js behavior/activityCalendarUnsaved.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/calendarPrivateItems.spec.js behavior/calendarDetailDialog.spec.js
```

人工验收：390px/1440px将时间轴横向滑动后点击官方和私人事项，应弹出与月历相同的详情，页面下方不再新增卡片；关闭后保持原位置。编辑私人事项后保存/取消返回详情，未保存待办取消关闭保留内容；切换账号不保留原详情。Agent只完成源码编译/语法/diff及静态UX审查，真实视觉、触控、滚动与组件回归尚未验证。


### 事项详情 UI 与操作分区（2026-10-15）

单事项以活动名称为弹窗主标题，正文不重复标题或嵌套大卡片边框；游戏、分类、状态／剩余时间、日期按层级排列。未知类型、关联说明与资料来源为次级文字；仅有日期时不再单独提示“具体时间未提供”。单日清单仍以日期为主标题，每项保留名称和紧凑卡片，支持长列表内部滚动。单事项保留右上角、Esc、遮罩关闭及“记一件事”入口，不再显示容易与业务完成混淆的底部“完成”。桌面单事项收窄为紧凑面板，手机继续使用底部弹层和安全区域，标题／可用底栏固定、中间滚动。

弹窗的订阅控件分为“本期完成状态”与“个人待办”。未完成活动以“标记本期完成”为主操作；编辑待办为次级操作，没有清单时显示“暂无待办”和“添加待办”，点击直接打开第一条空草稿并聚焦名称。清单勾选及保存不改变整期完成状态，整期完成也不替清单打勾。取消订阅显示为末尾的低权重文字操作：没有草稿时显式确认，已有草稿时沿用既有弃稿确认，取消保留输入且不写入；确认过期、账号切换或组件卸载后不执行迟到操作。已保存清单、历史内容及完成记录继续沿用原保留规则。

隔离范围：`CalendarEventCard.variant` 默认为 `card`（日程），仅详情弹窗传入 `detail`（单项）或 `day`（当天列表）；`CalendarSubscriptionControls` 沿用同一展示参数，仍是原控制器与单个编辑表单。默认日程卡片、不可用订阅列表、时间轴／月历条形展示、API 和业务数据结构保持原规则。风险 L2：局部展示与确认／编辑入口变化。已新增订阅控件测试，并同步详情、分类、视图、私人事项断言；编译与静态审查不等于真实页面验收。

用户最小非浏览器回归（cwd YuanHub）：

```sh
npm run test:behavior -- behavior/calendarSubscriptionControls.spec.js behavior/calendarDetailDialog.spec.js behavior/activityCalendarSubscriptions.spec.js behavior/activityCalendarUnsaved.spec.js behavior/calendarPrivateItems.spec.js behavior/activityCalendarTypes.spec.js behavior/activityCalendarViews.spec.js
```

人工验收：390px／768px／1440px及768px断点两侧打开官方和私人单事项，确认名称只出现一次、无内层大框、日期／状态清晰、无时间空行；日期/+N打开多项清单应保留各自标题且内部滚动。检查空态添加、编辑／保存、活动完成与清单完成独立、取消订阅取消／确认、带草稿关闭后继续编辑，以及私人编辑器返回、Tab/Shift+Tab/Esc和背景滚动恢复。真实视觉、触控、软键盘与浏览器响应式留待用户验收。

### 详情弹窗内待办编辑与软键盘（2026-10-15）

月历和时间轴共用的详情弹窗按 `visualViewport.height/offsetTop` 跟随键盘上方的可见区域；不支持此 API 时回退到窗口高度。只在详情打开时监听尺寸／位置变化，关闭和卸载时移除监听并恢复背景滚动。聚焦待办表单控件期间，标题收为单行、当天数量副标题和底栏暂时隐藏，减少头尾占用；保存按钮仍位于可滚动正文，移出表单焦点后恢复底栏。输入、新增一条及可见区域变化时，仅调整正文滚动以露出当前输入或操作，不重建编辑器、不清空草稿、不自动提交或标记活动完成。

局部交互修复，风险 L1，业务数据和 API 不变。新增非浏览器组件用例覆盖单项／单日编辑、可见区域缩小／偏移／恢复、正文双向滚动、草稿与焦点保留、底栏恢复、无 API 回退及监听清理；这些用例模拟几何，不能证明系统键盘的实际效果。用户最小回归（cwd YuanHub）：

```sh
npm run test:behavior -- behavior/calendarDetailDialog.spec.js
```

人工验收（约 2 分钟）：手机 390px 与平板横屏（宽度 ≥768px）分别从月历／时间轴打开活动，编辑已有待办或添加一条，确认键盘上方能看到当前输入；添加最后一条后仍可输入，正文可滚动到保存按钮。收起键盘、移出表单焦点后底栏恢复，草稿保留；关闭时取消弃稿应继续编辑。桌面 1440px 检查居中详情与键盘导航，关闭后背景位置不跳动。浏览器、真机软键盘和响应式效果由用户验收。

## 全量导出与按 ID 更新分类（2026-10-18）

活动目录提供“导出全部”和“导入更新分类”；原“批量导入”仍只新增活动。导出不受页面筛选、游戏或日期范围限制，包含全部手工活动（历史、停用也包含）及当前可派生的只读卡池参考。它是分类整理文件，不替代数据库备份，不包含用户个人事项或订阅资料。

三个管理接口复用现有 JWT + `activity_calendar:write` 权限，不新增内测资格门槛；公开/个人日历的内测限制保持原义：

- `GET /v1/admin/activity-calendar/export`：返回完整分类交换文档。
- `POST /v1/admin/activity-calendar/classification-import/preview`：请求 `{"json":"导出文件原文"}`，无写入。
- `POST /v1/admin/activity-calendar/classification-import/commit`：请求同一原文及 `preview_token`，重新校验当前数据后事务提交。

文档协议为 `document_type="activity-calendar-classification"`、整数 `schema_version=1`，含 `exported_at`、`classification_options`、`items`、`reference_items`。与新增型 JSON v1 不互通。容量为两数组合计最多10000条、原文UTF-8最多20 MiB；超限整份拒绝，不截断。下载通常带缩进，临近容量时使用紧凑JSON以保证往返；代理需允许转义后请求体，应用包裹上限为 `20 MiB * 6 + 4096` 字节。

手工行是 `{id, expected_version, original, classification}`。`original` 保留完整管理资料供核对；只修改 `classification`，例如：

```json
{"level1":"常驻","level2":"历练/洞窟"}
```

使用导出文件中的真实ID和版本；历史缺version按0导出。`classification: null` 表示不更新，省略整个活动行也不删除。`original`、`classification_options`、`reference_items` 均是参考，不参与写入，也不能扩展服务端允许的分类。卡池不允许移入手工items或在此修改，请到招募目录维护。空目录示例为 `public/examples/activity-calendar-classification-v1.json`（前端仓）。

预览报告包含 `total/ready/unchanged/skipped/invalid/conflicts/reference_count/rows/preview_token/updated`。行状态为 READY、UNCHANGED、SKIPPED、INVALID、CONFLICT，成功后 READY 变为 UPDATED。无效/重复/不存在/只读ID、非法分类或版本冲突阻止整批提交。只有实际分类变更才检查期望版本和写入；未修改导出文件重传应为零更新，旧编码不会被隐式规范化。

`classification_options` 返回上述 12 个二级选项，其中 8 个为手工可写目标。多对一映射固定写入 `ACTIVITY/TRIAL_CAVE`，不通过遍历展示标签反查多个旧编码。旧 v1 中的大型/周年、地宫、签到/楼主查岗、家具·历练、家具·神秘洞窟目标接受并转换为新版名称。旧初见日/转盘、维护、商店、星池目标仅在与该记录原分类一致时允许作为未变更读取；不能用于给其他记录重新分类，需选新版目标，错误会在行级预览中说明。

导出已明确映射的历史记录显示新版 `classification`；待归类记录导出 `null`，原始资料仍在 `original.item` 中。未变更的展示分类不触发存储规范化，避免整理其他活动时重写旧记录。若只希望将旧历练/洞窟的内部编码统一，而展示分类不变，在活动编辑器中主动重选「常驻 / 历练/洞窟」保存；分类文件保留原有按展示差异更新的契约。

提交使用 Hub Mongo 事务与逐条版本CAS，只更新 category、subtype、subtype_detail、修改审计及version。ID、标题、日期、说明、来源、启用状态、创建审计及订阅引用保持。任意一行失败整批回滚，缺少/过期令牌返回409。文件变化即废弃旧预览；超时或结果不明保留文件，必须重新预览实际结果，不复用旧令牌。重复提交相同目标不再增版本。

生产使用步骤：先部署匹配的前后端，再从生产管理页导出并保留原文件；复制一份只改classification，上传预览、核对差异、勾选确认后提交；重新导出核对结果。代码发布本身不自动批改生产记录。旧后端不认识新增subtype，回滚版本前需评估已写入的新编码。上线前核实生产条数、文件体积、代理限制和Mongo事务能力。
