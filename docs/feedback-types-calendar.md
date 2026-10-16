# 反馈类型与活动日历：历史开发交接

> 2026-10-16：本文保留历史批次记录；可见七类型/改类/类型预填方案已由轻量化改版替代。当前普通反馈固定 OTHER，仅选择动态板块；参见 [反馈中心](ux/feedback.md)。以下历史命令与验收文案不作为当前 UI 要求。

状态：开发实现与必要定向检查完成后，本地提交进入「开发完成·待集中回归」；不代表最终验收、上线或反馈结单。

反馈：`rpt_1404fcc159b785ab`；`rpt_b576e43ca504d776` 第二项。风险 L3：跨前后端分类协议与授权范围。代码确认原新建页少 EXPERIENCE 且 BUG 名称不同；后端内置板块与旧目录补齐均缺活动日历。未读取或修改真实反馈/日程。

## 功能与边界

新建表单、个人筛选、管理筛选/发布改类、广场筛选与卡片/详情共享 `src/utils/feedbackPublic.js` 七类型定义。BUG 统一「问题反馈」；EXPERIENCE 为「体验优化」。API 创建和改类复用该定义校验；新写入的未知类型拒绝。历史 FEEDBACK/未知值显示「其他」，公开设置可保留原类型，不因编辑公开摘要自动改类。

板块仍由后端动态目录提供。默认新增 `CALENDAR` /「活动日历」；已有同名动态分类复用其 key。`builtin_key=CALENDAR` 保留复用分类在改名后的来源语义，不授予权限。目录加载完才预填，发送实际 key。日历页「反馈日历问题」和活动资料表单的招募线索链接只携带固定板块/类型，不复制筛选、账号、私人日程、正文或附件。带 `new=1` 的旧 FEEDBACK/category/area 链接保持类型与板块独立；未知板块保持未选中。

管理筛选、调整板块、运营分派、程序交接继续使用现有范围校验。新增板块不修改任何授权；日历维护权限与反馈权限独立。公开卡片/详情可展示后端返回的板块名称，缺少新增字段的旧响应仍正常渲染。没有 OTHER 历史迁移、未读重置或公开授权补写。

## Git 基线与批次追溯

| 仓库 | 分支 | 本任务前基线 |
| --- | --- | --- |
| YuanHub | main | 05cc0ae6a30f4023283a71091ae5a40e6c99dfe8 |
| BackEndV3-Share | main | 310e8a1b7e1adce60b66ec98dd2f1b0a26975c00 |

任务提交完整 Hash 见本次交付记录。统一回归需汇总整个批次的前后端基线与所有提交；单次/最后一个 `./test smart` 不能证明批次覆盖。后端目录与新增公开字段需随前端一起发布；旧后端不提供日历时表单不伪造可提交板块，旧前端忽略新增公开字段。UP 名称由任务 07 处理，第二条反馈不能整体结单。

## 待集中回归命令

开发期已执行：Node 契约 45/45；下述 Vue 定向命令 17/17（135 项因 `-t` 未选择，仍待集中回归）；后端定向单元 46/46、分类隔离 Mongo 3/3，受影响 Kotlin 文件 strict ktlint 通过。后端编译随定向检查执行。lint 首轮仅有格式问题，按明确修改路径格式化后复查通过。Vue 日历测试产生测试路由未注册警告，无失败。

```bash
# YuanHub：只检查本次新增/变更的行为
npm run test:behavior -- behavior/feedbackPages.spec.js behavior/coCreation.spec.js behavior/activityCalendar.spec.js behavior/activityCalendarSuggestions.spec.js -t '权威七类型|日历深链|旧链接与未知|广场筛选展示|公开卡片正确|日历反馈入口|公开设置安全保留|招募线索反馈入口'
# BackEndV3-Share：开发期权限、目录、协议与持久化安全检查
./gradlew test --tests '*FeedbackCategoryServiceTest' --tests '*FeedbackAccessServiceTest' --tests '*AdminAuthorizationServiceTest' --tests '*FeedbackWorkflowServiceTest.*日历*' --tests '*FeedbackReportServiceTest.*日历*' --tests '*FeedbackPublicServiceTest.*日历*' integrationTest --tests '*FeedbackCategoryMongoTest' --console=plain
```

以下为未完整执行的集中回归清单，不应把以上定向结果视为整批验收。

在 `YuanHub`：

```bash
node --test test/feedbackTypes.test.js test/feedbackContract.test.js test/coCreationContract.test.js test/feedbackUnread.test.js
npm run test:behavior -- behavior/feedbackPages.spec.js behavior/feedbackAccess.spec.js behavior/coCreation.spec.js behavior/feedbackPlazaManagement.spec.js behavior/feedbackUnreadStore.spec.js behavior/activityCalendar.spec.js behavior/activityCalendarSuggestions.spec.js
```

在 `BackEndV3-Share`：

```bash
./gradlew test --tests 'com.lhs.share.hub.service.report.FeedbackReportServiceTest' --tests 'com.lhs.share.hub.service.report.FeedbackPublicServiceTest' --tests 'com.lhs.share.hub.service.report.FeedbackWorkflowServiceTest' --tests 'com.lhs.share.hub.service.report.FeedbackAccessServiceTest' --tests 'com.lhs.share.hub.service.report.FeedbackCategoryServiceTest' --tests 'com.lhs.share.hub.service.report.FeedbackPublicAdministrationServiceTest' --tests 'com.lhs.share.hub.service.admin.AdminAuthorizationServiceTest' --console=plain
./gradlew integrationTest --tests 'com.lhs.share.hub.service.report.FeedbackCategoryMongoTest' --tests 'com.lhs.share.hub.service.report.FeedbackPersistenceMongoTest' --console=plain
```

数据库用例仅使用仓库 TestMongo 自有一次性容器。缺 Docker 为失败，不连接已有开发数据库。复用已有 `./dev.sh` 服务，不未经确认重启。

## 待集中验收用例

1. 七类型在新建、个人筛选、管理筛选/改类、广场筛选/标签一致；EXPERIENCE 在日历提交、私有回读和经授权公开后回读一致。保留旧 FEEDBACK 和未知值；公开编辑摘要不自动改历史类型。
2. 空库、旧持久目录、已有同名自定义日历、改名及重复读取：日历只一次、实际 key 稳定；管理员编辑后的重载和并发冲突不覆盖旧数据。旧 type/category/area 链接与目录慢响应/失败安全预填。
3. 匿名仅见公开内容；普通用户仅见自己工单；显式日历运营可接单/分派；其他范围管理员不可越权查看/操作；日历程序岗交接前不可见、交接后只具备既有程序操作；日历内容维护角色不自动获反馈权限。
4. 历史工单内容、归属、消息、未读及公开同意不变；OTHER 不迁移。日历入口不携带私人数据；公开响应不含原始正文、附件、账号、诊断或内部负责人。
5. 390/768/1440px 检查新建/个人/管理/广场类型筛选、日历入口及公开板块标签；键盘 Tab/Enter/Space、焦点恢复、长中文与 24 字板块名称、无横向溢出。只用隔离测试身份与合成数据。

## 回复草稿（未发送）

`rpt_1404fcc159b785ab`：已统一提交反馈、个人列表、管理端和反馈广场的七种类型及显示名称，补齐「体验优化」，并保留旧链接兼容。目前开发完成，待本批次集中回归；验证通过后再确认处理结果。

`rpt_b576e43ca504d776`：已补齐活动日历反馈板块及日历入口预选，并接入原有管理范围和分派链路；不会自动扩大管理员权限或上传私人日程。这部分开发完成、待集中回归。UP 名称需求由任务 07 继续处理，当前整条反馈保持未完成。
