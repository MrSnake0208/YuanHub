# 今日一览的数据录入状态

双栏时个人工作台占主要宽度，常规信息侧栏以 28% 为目标并保留 240px 的可读下限；单栏时个人内容排在常规信息前。

桌面今日一览以个人工作台为左侧主栏，先显示“我的待办”，再显示“我的事项与备注”；右侧依次显示“当前活动”“临期活动”和“账号详情”。窄屏先显示个人内容，再显示常规信息。临期活动继续使用当前账号订阅摘要中的未来 72 小时截止提醒，通过 Teleport 呈现到布局提供的区域，与待办共用一个数据与计时实例。没有账号时仍保留原有建档流程与活动单栏；有账号但尚未录入游戏数据时，也可以查看个人待办与私人事项。

私人事项复用 `GET /v1/activity-calendar/private-items` 和 `privateCalendarItem` 校验，展示当前账号进行中及未来 90 天的事项、完整纯文本备注和日期范围。点击标题进入我的日历列表并定位事项，在日历继续编辑。读取独立于活动待办，慢请求或失败不会阻塞待办；身份、账号或游戏切换立即清空旧备注并丢弃旧响应，权限失效清空内容并停止自动刷新。普通刷新失败保留上次内容并明确提示；页面重新可见或北京时间跨日时刷新，卸载后清理。新增定向回归：`npm run test:behavior -- behavior/todayPrivateItems.spec.js behavior/todayComingSoon.spec.js behavior/todayActivitySummary.spec.js`，由用户/CI执行。

平板与桌面卡片按内容自然增长，不将待办拉伸到右侧整列的高度。981px 起可使用双栏，只有侧栏出现的 1081px 起才预留正文左侧空间。768px 起的页头默认使用紧凑场景，只有页头容器内部可用宽度达到 1000px 才展开大立绘；活动摘要同步收紧间距，完整保留标题、日期、统计和入口。相关样式检查：`node --test test/todayLayoutStyles.test.js`；断点状态保留检查：`npm run test:behavior -- behavior/todayComingSoon.spec.js`，由用户/CI运行。

沿用 auth/account/data/ready 阶段，分别判断密探、库存与星石，不把读取失败伪装成缺失，不因一项失败要求覆盖重录。

库存“正库存种类数”与“已有录入证据”独立。复用 `/v1/inventory/current` 的 `full_baseline_at` 与库存条目：完整基准存在时，即使entries为空或全部为零也属于已录入；有效零条目（包括listed局部盘点）表示已有录入，但不宣称完整盘点。正数量条目也表示已有录入；只有完整基准才能显示完整盘点说明，`updated_at`不作为完整盘点证据。

成功返回空数组表示没有当前库存记录；旧格式空文档、缺元信息或无有效证据时显示“录入状态待确认”；请求失败显示“暂时无法读取”。两种unknown均不展示重新录入按钮。零完整基准显示“已盘点，当前库存为零”，局部零录入显示“已有录入，当前库存为零”。

首页读取继续复用当前账号与现有sequence保护；切换账号后旧响应不得覆盖新账号。连接码授权仅代表允许同步，不作为盘点或同步成功证据。

最小回归：`node --test test/todayData.test.js test/todayPage.test.js`、`npm run test:behavior -- behavior/todayComingSoon.spec.js`。在YuanHub目录执行，由用户/CI负责运行。
