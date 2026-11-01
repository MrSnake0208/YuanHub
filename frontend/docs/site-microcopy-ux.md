# 全站辅助文案 UX 优化实施记录

本轮落实全站源码审查中的 60 项建议。58 项已调整，1 项部分调整，1 项按用户决定跳过。只调整用户可见文案及辅助说明的展示层级，不改数据计算、请求、持久化、权限或导入规则。不统一全站字号，不运行浏览器自动化；实施阶段未提交 Git，后续提交按用户明确授权执行。

## 审查项对应结果

以下编号对应本轮审查报告。路径相对于 `src/`；同组公共组件的调用页面同步生效。

| 编号 | 页面／主要文件 | 实施结果及保留的引导 |
| --- | --- | --- |
| 01–03 | 今日一览；`components/today/TodayDataOnboarding.vue`、`TodayPreferencesPanel.vue`、`pages/today/index.vue` | 删除重复建号流程，保留操作按钮；说明电脑／手机偏好分别保存、草稿保留、隐藏不删数据、恢复默认后需保存。 |
| 04 | `components/today/TodaySubscriptionSummary.vue`、`composables/useTodayPreferences.js` | Checklist 改为待办清单；保留订阅后仍需自行添加清单。 |
| 05–06 | 我的日历；`pages/calendar/index.vue`、`components/calendar/CalendarFilterSheet.vue`、`CalendarSubscriptionControls.vue` | 顶部只保留私人范围与手动完成规则，完整规则留在已有帮助；保留先保存订阅、清单勾选不自动完成本期活动。 |
| 07 | `components/calendar/CalendarPrivateItemEditor.vue` | 用“北京时间的日期”说明提醒口径；保留提醒权限及实际提醒限制。 |
| 08–10 | 活动建议；`components/calendar/CalendarSuggestionFields.vue`、`pages/calendar/suggestion-new.vue`、`suggestions.vue` | 精简补充资料入口和时区提示，删除列表自我介绍；提交未确认时保留查看记录、重试本次提交的建议。 |
| 11–12 | 密探复核；`pages/operator/index.vue`、`components/operator/OperatorScanReviewForm.vue`、`store/accountEvents.js` | 删除“无需编辑代码”“可靠分区”等术语；保留部分可能已保存、未确认不等于成功及重新读取核对的要求。 |
| 13–15 | 密探名册；`pages/operator/index.vue` | 完整排序和备份范围移入帮助；手动录入、复核入口仍可找到；已移出图鉴的密探仍保留养成记录，移除前须核对。 |
| 16 | 快速录入；`pages/operator/quick.vue` | 无账号时指向实际可创建账号的“账号与连接码”。 |
| 17 | 密探、库存、礼包及关卡／密探后台 | 网络错误给出检查网络、重试、反馈的下一步，不要求玩家检查后端服务。未确认写入的专门提示不变。 |
| 18–19 | `components/operator/OperatorGrowthTracker.vue` | 缩短材料估算及体力储备说明，拆分日程操作与模拟假设；保留共用库存、完整日预算、满体损失、结余不结转和整笔领取条件。 |
| 20–21 | 养成追踪；`components/operator/PlannerExactOptimizer.vue`、`OperatorGrowthTracker.vue` | 以当前条件、可行／最优／无法判断区分计算结果；90 天估算未完成不表述为无法完成。 |
| 22–24 | `components/AccountShareManager.vue`、`components/operator/OperatorShareManager.vue` | 两种布局均直接显示已持有密探档案与佩戴星石、云端全部星石范围；交叉佩戴提示放在开关旁；完整隐私说明可展开。保留权限立即生效、链接无需登录、全部关闭旧码失效及标签默认私有。 |
| 25 | `components/operator/OperatorShareContent.vue` | 删除重复只读说明，保留工具栏只读状态与更新时间。 |
| 26 | 星石宿主页；`pages/star/index.vue` | 用背包、计划、经验星曜说明替换范围；仍明确无法恢复佩戴关系或识别原始资料。 |
| 27 | YuanStar 内部识别确认 | **跳过。** 用户决定“不从源码重建，跳过”，未修改生成的 embed 或 manifest。 |
| 28 | `domain/starLoadoutUi.js`／YuanStar 内部 | **部分完成。** 宿主提示改为“没有可用星石，或不适合当前密探”；embed 内文案按用户决定跳过。 |
| 29 | `pages/star/growthPlanInventory.js` | 保留本次填写量、当前库存、未知状态及读取核对方式；明确“使用当前库存”不会再次写入。 |
| 30 | `components/inventory/InventoryRecordsWorkspace.vue` | 删除重放／重建实现说明；保留删除后重新计算库存、可撤销及新增奖励入口。 |
| 31–33 | `components/inventory/RewardEntryWorkspace.vue` | 用奖励发生时间、后续盘点解释仅补历史；常用关卡说明复用已有展开区；保留原记录时间、同一记录去重和奖励不能代替完整盘点。 |
| 34–35 | `components/inventory/ResourceBalanceReport.vue`、`pages/inventory/index.vue` | 统计口径可展开；保留获得量与净变化区别、不能推算支出，以及明细截断／排行口径限制。 |
| 36–37 | 奖励录入／背包库存 | 直接提醒同一笔奖励换入口仍可能重复计数；读取失败时明确显示 0 不代表实际库存，并要求重试。未改变原有数量回退逻辑。 |
| 38–39 | `pages/recruitment/PoolEditor.vue` | 删除头像展示的重复说明；保留每头像代表一次出货、保底选填且留空保留原进度。抽数累计、未知状态及校验规则不改。 |
| 40–41 | `pages/recruitment/RecruitmentRecordsPreview.vue`、`RecruitmentTimeline.vue` | 保留载入最早批次但按新到旧展示、还有未载入记录；空卡池提供导入备份或稍后重试。 |
| 42–45 | 账号与 MaaYuan；`pages/user/profile.vue`、`utils/openApiToken.js` | 以具体权限用途和操作表述连接流程；旧码升级说明放到对应连接已有帮助，保留原码不变、权限需确认及创建不等于同步成功。权限键与授权行为不变。 |
| 46–47 | 礼包方案；`pages/tools/cart.vue`、`components/cart/CustomPackageModal.vue` | 缓存改称上次加载资料，仍提示价格可能非最新、已选礼包保留原信息；排序 ID 改为显示顺序。 |
| 48–49 | 安装教程；`pages/install/index.vue`、`components/MobileInstallPrompt.vue` | 精简真实安装／结果验证术语和重复退出标签；保留系统安装操作、快捷方式区别、从桌面打开确认及退出继续用网页版。 |
| 50–51 | `pages/beta/index.vue`、`pages/changelog/index.vue` | 删除页尾重复说明及普通用户无须理解的审核流程；保留站点版本。 |
| 52 | 新手引导；`components/OnboardingGuide.vue`、`utils/onboardingTasks.js`、`utils/onboardingTour.js`、`pages/recruitment/RecruitmentWorkspace.vue` | 使用具体录入／保存／检查操作，删除“真实业务”“成果验证”等内部语言；保留读取失败、未确认同步和已有资料无需重复录入。成功判定不改。 |
| 53–54 | 活动日历后台；`components/calendar/CalendarImportDialog.vue` | 公开默认值、不覆盖已有活动、仅手工活动前置；文件格式、容量、批次数和默认时区保留在选择处，分类／兼容说明可展开。最终公开确认不改。 |
| 55–56 | `pages/recruitment/admin.vue` | 精简列表与历史 UP 数量机制说明；保留添加／退役名额和关联图鉴名称更新规则。 |
| 57–58 | `pages/level/admin.vue`、`pages/operator/admin.vue` | 自动编号、多人修改冲突、按品质计算上限用操作语言说明；已有技术预览和冲突检查不改。 |
| 59 | `pages/admin/beta.vue` | 精简审核说明，保留必填理由与操作作用范围。 |
| 60 | 反馈工作台；`pages/feedback/manage.vue` | 队列数量不可相加直接显示；历史“程序已交回”与当前处理人不同的解释可展开，队列与状态算法不改。 |

## 验证与边界

风险为 **L1**：大部分是 L0 文案替换，少量说明移入已有或原生 `details`，分享范围提示在两个布局中前置。未增加依赖、改变接口或算法。

同步已有测试中的文案断言，新增分享两种布局下关键范围说明无需展开、不会写入权限的定向断言；旧连接升级提示在原流程测试中补充断言。保留原有隐私、数量、未知状态、取消、迟到事件和写入次数约束。未执行这些测试。

非浏览器检查仅覆盖本轮变化文件：Vue 模板、脚本、样式编译及 JS 测试文件语法解析，另检查 diff 空白。此检查不等同于页面交互、视觉或测试通过。

原工作区和并行发生的自定义标签分享改动保留。本轮不修改 YuanStar 构建产物，也不修正库存读取失败时显示 0 的既有行为，仅明确其含义。

## 最小建议验证

从 `YuanHub` 目录执行，均为非浏览器测试；未在本轮代跑：

```sh
npm run test:behavior -- behavior/operatorShareManager.spec.js behavior/profileConnectionsUx.spec.js
node --test test/growthPlanInventory.test.js test/maayuanConnection.test.js test/openApiToken.test.js
```

其余已同步文案断言的行为测试可由 CI／用户按需回归：`growthPlanEmbed`、`ledgerCatalog`、`onboardingTour`、`pwaInstallPrompt`、`recruitmentPage`、`recruitmentTimeline`、`todayCalendarSubscriptions`、`todayComingSoon`（位于 `behavior/*.spec.js`）。

## 人工 UI 验收

用户在手机约 390px、电脑约 1440px 宽度检查下列项目；本轮未运行浏览器或启动服务。预览即可，不必保存或公开真实资料。

1. 分享管理：不切换权限，检查密探及星石公开范围、佩戴星石提醒直接可见；展开隐私说明能找到标签与未同步资料限制。
2. 今日一览与我的日历：登录／账号／录入入口清楚；偏好、待办清单和本期完成规则能找到，无重复说明挤占页面。
3. 密探与养成追踪：复核提示保留下一步；排序帮助可展开；模拟条件及可行／最优／无法判断的文字准确。
4. 库存、招募和活动导入：奖励时间及重复录入警告、留空保底规则仍可见；打开导入预览检查公开／覆盖风险，不执行真实导入。
5. 账号连接和安装教程：权限用途、旧连接帮助、复制后开启同步的步骤及关闭教程入口可找到；仅创建连接码／阅读教程不显示操作成功。
