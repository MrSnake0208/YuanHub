# 反馈工单流转接口

## MaaYuan 独立诊断中心（2026-11-11）

接收端仍为 `POST /open-api/maayuan/diagnostics`，v1/v2 协议、连接码鉴权、配额、图片解码、返回体及事件回执不变，详见 [开发者 API](../../frontend/docs/developers/api.md) 的同名章节。接收不再调用 `FeedbackReportService.createDiagnostic`：图片预算、媒体元数据、新事件、问题组和随机事件回执在原 Hub Mongo 事务内提交，不生成工单、不发逐条通知、不提供上报用户沟通入口。`createDiagnostic` 保留供旧工单兼容，普通反馈路径不变。

`FeedbackTicketQueryRepository.search` 在分页和计数前统一排除 `source=maayuan_diagnostic`，覆盖管理队列、个人列表、队列计数、前端未读扫描及 `/open-api/feedback/queue`。原诊断筛选参数可以保留，但不能绕过排除条件。公开列表继续沿用原有诊断来源排除。旧工单不迁移、不主动批量删除，按 ID 查看及原附件鉴权路径保留，并继续原有 90 天清理。

用户通知分页与未读计数通过 `NotificationRepository` 排除 `refType=FEEDBACK` 且 `refId` 以保留前缀 `rpt_diag_` 开头的旧诊断通知，避免历史回复继续产生个人反馈未读角标；原通知数据保留，不批量改为已读或删除。

新集合与索引：

- `maayuan_diagnostic_events`：`_id=eventId`，保存认证推导的 userId/accountId、createdAt、复用的 FeedbackDiagnosticSummary、manifestAssetId、图片 assetId/role/可选 issueIndex、问题组 signatures。索引为 createdAt、signatures；事件响应不返回上报用户和账号 ID。
- `maayuan_diagnostic_issues`：永久问题组，索引为 `{status:1,lastSeenAt:-1}`、reason。键为 `原因|对象`（reason 缺省取 code；仅 identity_unresolved/data_review 有 operatorIds 时使用每个 `op:<operatorId>`，identity_unresolved 无 ID 但有 OCR 样本时使用首条 `ocr:<样本>`，其余所有 code 一律为 `stage:<stage>`，避免页面/环境问题按密探拆组），ID 为键的 SHA-1 十六进制前 24 位，落点为 `MaayuanDiagnosticIssueRecorder.Signature`。
- 身份类 identity_unresolved 的 operator/ocr_name 对象以 code 代替 reason 作为签名原因；同事件与其他非 collector_exception issue 具有相同明确 reason 的外层 collector_exception 不参与分组，事件摘要仍保留所有 issue；组 `reason` 为签名原因，新增去重 `reasons` 记录实际 issue.reason（缺省取 code，旧文档默认空数组），管理端与 AI 响应随问题组返回该字段。
- 同一事件内按签名分组，只增加一次 eventCount，并合并 stages；新增 operatorIds 收集进入该组的 issue 的 operatorIds，沿用 recent() 去重保留最近 10 个，旧文档默认空数组，管理端与 AI 响应透传，详情环境区非空时显示「涉及密探」，中文名由只读目录解析，未命中保留原 ID；最近非空候选列表取当前事件，OCR 样本去重保留最近 8 条，MaaFW/资源/目录版本各保留最近去重 10 个，resourceCounts/uiScriptCounts 每个事件各计一次。FIXED 再次出现时回到 NEW 并记 regressedAt；IGNORED 只累计不重开。用户集合不永久存储，详情基于保留期内事件按 userId 去重计数。

管理端基路径 `/v1/admin/maayuan-diagnostics` 使用 JWT，复用 `FeedbackAccessService.operatorAreas(userId)` 包含 MAAYUAN 的判断，与原 UNASSIGNED 诊断工单的工作台可见规则一致（含超级管理员），不使用宽泛的旧 manageAreas 代替岗位授权；未授权返回 HTTP 403，不新增权限码。Integration Token 基路径 `/open-api/maayuan-diagnostics` 还要求 Token 明确包含 MAAYUAN、所有者仍满足同一查看判断，不能以省略 feedbackAreas 表示诊断授权。

| 相对端点 | 功能 |
|---|---|
| `GET /issues` | status（NEW 默认 / FIXED / IGNORED / ALL）、reason（精确匹配组的 reason 或 reasons）、q（subject/OCR/目录名称与别名）、sort（lastSeen 默认 / count / firstSeen），分页（page 从 1 开始、每页默认 20、最多 100；管理端 pageSize、AI page_size）。返回分页问题组、statusCounts、reasonCounts 与三项全局统计（pendingCount、recentEventCount、regressedCount）。状态计数忽略当前状态，原因计数忽略当前原因，其余搜索条件保留；reasonCounts 仍按组的 reason 聚合 |
| `GET /issues/{id}` | 问题组、近 90 天去重用户数、最近 20 个事件摘要、subjectInCatalog 及对象/候选中文名。使用 `OperatorCatalogService.catalogReadOnly()`，不触发 seed/backfill；OCR 名字与目录名称或分隔的 alias 精确匹配，其他对象为 null |
| `GET /events/{eventId}` | 完整摘要、内联 manifest JSON、图片列表（带 role 与 expired）；无明确协议关联时 issueIndex 为 null |
| `GET /events/{eventId}/media/{assetId}` | 校验事件引用、diagnosticEventId、privateStorage 和保留期后，复用 MediaStorageService.loadAuthorizedAsset 返回私有文件流，Cache-Control no-store/private；跨事件或过期均为 404 |
| `PATCH /issues/{id}`（仅管理端） | `{status,note?}`，NEW/FIXED/IGNORED；备注最多 4000 字，记录 statusUpdatedBy/statusUpdatedAt |
| `PUT /issues/{id}/analysis`（仅 AI） | summary ≤4000、suggested_action ≤40、source ≤40（均必填非空）、model 可选 ≤120；写 agentAnalysis，返回所写分析，不修改状态或返回事件数据 |

两个新增 IntegrationScope 为 `diagnostics:read`（上述四个 GET）与 `diagnostics:analysis:write`（PUT 分析，不隐含读取权限）。原有 Token 管理端点不变，普通连接码不会因此取得后台诊断权限。AI 无状态修改端点；管理端及 AI 共用诊断读取语义，错误通过 IntegrationExceptionHandler 返回真实 HTTP 状态。

图片保留 14 天；event 和 manifest 保留 90 天；问题组及累计计数永久保留。读取立即拒绝过期事件和文件，图片元数据删除后在事件响应中标记 expired；每小时清理真实文件和元数据，再删除过期事件，问题组不参与清理。原有旧诊断工单清理保留，普通工单和附件不参与诊断清理。随机回执独立保留，过期后重试不重新累计。

全局图片预算仍为 10 GiB；不足时保存无图事件及 manifest。接收事务失败只清理未被已提交事件引用的本次媒体，并保持原有预算回滚及孤儿文件回收。问题组并发写冲突会回滚整个事件，由客户端使用相同 eventId 重试，避免丢失或重复累计。

前端 `/maayuan-diagnostics` 与反馈管理路由同级鉴权，以桌面表格/手机卡片承载问题组，右侧抽屉（手机全屏）提供结论、处理、环境、最近事件、完整证据及原始数据；反馈页只保留次级入口，旧详情图片也改为 contain。现有 MaayuanDiagnosticServiceMongoTest 与 feedbackPages.spec.js 中直接冲突的断言已静态更新，未运行检查；新中心的权限、事务、聚合及运行时 UI 均待另行授权验证。

交给后端验证会话运行（本次实现会话未运行 Gradle）：

```bash
cd backend
./gradlew ktlintCheck
./gradlew test --tests 'com.lhs.share.openapi.diagnostics.*' --tests 'com.lhs.share.openapi.*Feedback*ContractTest'
./gradlew integrationTest --tests 'com.lhs.share.openapi.diagnostics.MaayuanDiagnosticServiceMongoTest'
```

## 多平台反馈专区（2026-10-26）

专区代表产品归属，`category` / `area` 仍是板块，`workArea` 仍是内部处理板块；提交来源和处理阶段不作为专区。现有版本化 `feedback_category_catalog` 增加 `spaces[{id,label,active}]`，每个板块增加 `spaceId`，板块 key 继续全局唯一。仅默认提供 `yuanhub`；旧目录缺失字段时按主站读取，旧 `MAAYUAN` 板块仍属于主站，不推断或迁移合作方归属。

- 新工单保存 `spaceId`；请求 JSON 使用 `space_id`，省略时默认 `yuanhub`。缺失/null 的历史工单字段同样解释为主站，无批量回填，不改 ID、消息、附件、公开授权或处理记录。提交和调整处理板块时校验专区一致，不支持跨专区合并或移动。
- `GET /v1/reports/access` 增加 `spaces`（开放专区及本人可管理的停用专区）、`manageable_spaces`；板块选项增加 `space_id`。可选 `spaceId` 仅收窄目录。实际管理范围来自原运营岗/程序岗与板块授权；旧授权不会自动变成新专区岗位，超级管理员保留全范围。
- `GET /v1/reports`、`GET /v1/admin/feedback/queue` 接受 `spaceId`。管理查询必须在数据库分页/计数前交集专区和岗位板块；无授权专区返回业务 403。省略或 `all` 聚合本人授权范围，不授予额外权限。个人 `mine=true` 只查本人，省略或 `all` 可查本人所有专区历史。搜索、队列计数遵守同一条件。
- 公开列表和相似召回接受 `spaceId`，省略默认主站；公开详情可带 `spaceId`，与工单不符返回业务 404。原公开授权、举报排除及公开字段白名单继续有效。详情、附件、回复、状态、流转、候选人和逐工单已读仍根据真实工单授权，改请求参数或编号不会扩权。前端批量已读只发送当前专区的未读工单及消息边界。
- `GET /v1/reports/public/spaces` 返回开放专区；`GET /v1/reports/public/spaces/{id}` 返回单个专区元数据（包含停用状态，便于历史入口）。元数据不包含成员和私有工单。`POST /v1/admin/feedback-spaces` 接受 `{id,label}`；`PUT /v1/admin/feedback-spaces/{id}` 接受 `{label,active}`，均须原 `admin:feedback_access:manage` 权限。稳定 ID 不可更改，`all` 保留，主站不可停用；创建时仅新增一个真实“其他问题”板块。沿用目录乐观锁、hub 事务及 `FEEDBACK_SPACE_UPDATED` 审计。

板块创建接受 `space_id`（默认主站）；排序额外传 `space_id` 时，新旧 key 数组须包含该专区完整目录，其他专区顺序保持；省略维持旧全目录排序契约。成员仍通过既有反馈授权接口保存完整岗位及板块集合，不能把当前专区以外的已有授权清空。停用仅阻止新建反馈，历史处理和本人记录仍可用。

`GET /v1/admin/feedback/version-options?spaceId=...` 先校验管理范围。产品版本目录目前仅属于主站，合作专区返回空选项，不能关联主站版本；既有主站版本功能保留。原 OpenAPI token 尚无专区声明，自动化列表、详情、附件及分析继续限制于 `yuanhub` 和原 token 板块交集，不自动扩展到新专区。

### 反馈图片存储边界

反馈客户端使用 `POST /v1/media/upload?feedback=true`，图片也写入现有私有文件目录，上传响应 `url=null`。消息图片返回 `private_storage=true` 和空 URL，由 `GET /v1/reports/{id}/attachments/{mediaId}` 鉴权读取；私有图片和文件都须是工单实际引用的未删除资产。合作专区拒绝引用普通上传入口生成的公开图片。普通非反馈图片上传保持原行为。

**历史限制：旧图片原先位于公开 `/media/`，本次没有移动、删除文件或撤销既有 URL。已有静态地址仍具有原来的可访问性，不能视为已经完成隐私迁移。** 新专区不接收这些公开图片；如需收紧旧主站图片访问，需另行确认资产共享关系和 URL 兼容方案后实施迁移。没有对现有开发/生产数据库运行迁移。

## 附件数量

`POST /v1/reports` 和 `POST /v1/reports/{id}/messages` 的 `media_ids` 允许 0–10 个，图片与普通文件共用额度；用户追加与管理员回复使用同一上限。超过 10 个返回业务 `status_code=400`。媒体存在、上传者归属、未删除和 ID 不重复的约束继续生效。单个文件上传大小与图片压缩规则不变。

## 类型与活动日历板块

`type` 可选 `BUG`（问题反馈）、`EXPERIENCE`（体验优化）、`FEATURE`（功能建议）、`CONTENT`（内容问题）、`ACCOUNT`（账号问题）、`REPORT`（举报）、`OTHER`（其他）；与反馈板块 `category` 独立。旧 `type=FEEDBACK`、`category=类型`、`area=板块` 请求继续兼容；不迁移历史工单或将 OTHER 自动改成日历。未知的新建类型仍返回业务 400。

`GET /v1/reports/access` 的 `available_categories` / `available_areas` / `available_work_areas` 使用同一动态目录中的可见板块；`category_catalog` 返回完整目录（含 `hidden`，旧数据默认 `false`），供板块管理和历史名称展示。缺少日历的空库或旧目录提供 `CALENDAR` /「活动日历」且只出现一次；已有同名自定义板块复用其 key，并通过可选 `builtin_key=CALENDAR` 标识语义。该标识只供来源预填，提交、筛选、授权和流转必须使用返回的实际 key，不能把别名当成授权。自定义日历改名后标识仍保留。目录读取不写库；后续管理员目录编辑沿用原乐观锁持久化补齐结果。

普通用户可选日历提交自己的工单，但不因此获得管理权限。非超级管理员必须显式授予实际日历 key 的运营/程序范围；活动日历内容维护权限不授予反馈查看或操作权。程序岗仍仅能在交接或交回条件满足时查看，不能代替运营控制。超级管理员延续已有全部目录范围语义。未修改授权集合、历史归属、消息与未读字段。

公开列表/详情增加可选 `category`、`category_label`，仅用于展示目录板块；公开查询仍要求 `visibility=PUBLIC`。不暴露内部负责人、原始正文、消息、附件、诊断或私人日程。分类名称每批查询一次，避免列表逐条读取目录。

日历入口 `/feedback?new=1&category=CALENDAR` 默认问题反馈；招募线索入口额外携带 `type=CONTENT`。前端等待目录后解析到实际 key，不从链接读取正文、账号或日程。

`POST /v1/reports` 接受 `public_consent`，默认 false，与 `client_info_consent` 独立。默认私下提交无需标题；`public_consent=true` 时 `title`（最多 120 字符）必填，空标题返回业务 400，且不读取附件或保存工单。授权不会自动发布，创建时可见性仍为 PRIVATE。

用户和管理员的私有详情返回 `public_consent`。缺少字段的旧请求/旧文档视为未授权，不自动补授权。管理员发布接口 `PATCH /v1/admin/feedback/{id}/publish` 先校验原有管理权限，再要求工单 `public_consent=true`，未授权返回业务 403 且不写公开字段。管理员不能代替用户修改授权；已经公开的历史内容保持可见，但未授权不能重新发布或通过发布接口修改公开摘要，仍可取消公开。公开 DTO 只返回整理后的公开字段，不暴露授权、原始正文、附件或账号信息。

运营在工单详情中执行接单、转交、转程序和调整负责板块。工单状态由详情接口的 `workflow_stage` 返回；`PROCESSING` 表示已接单，重新打开详情不需要再次接单。

`GET /v1/admin/feedback/{id}/assignees` 返回当前工单可转交的运营候选人：`[{"id":"user-id","user_name":"姓名"}]`。请求者须能控制该处理中工单。结果只包含当前负责板块有运营权限的已激活用户及已激活超级管理员，排除当前负责人。无候选人时返回空数组；权限不足返回 403，工单不可转交返回 409。提交转交时仍由 `POST /v1/admin/feedback/{id}/assign` 重新校验目标权限。

`POST /v1/admin/feedback/{id}/handoff` 使用工单当前 `work_area` 转程序；仅 `POST /v1/admin/feedback/{id}/work-area` 改变负责板块。

流转通知复用既有 `title`/`body`：标题保存当次操作人、反馈标题（无标题时取正文前 40 字）及交接关系；正文分别展示反馈原文前 100 字和交接说明前 100 字。昵称缺失时显示用户 ID。转交与接手使用不同文案，原负责人、新负责人和操作人按用户 ID 去重收件。转程序标题列明目标板块及当次程序接收人员，收件人包括这些程序人员、运营负责人和操作人；这是板块交接，不代表指定个人程序负责人。

程序交回通知程序操作人和运营负责人；运营撤回使用“撤回程序交接”文案，通知操作人及运营负责人，按用户 ID 去重。沿用现有通知 kind、权限和失效清理规则。流转记录的 `note` 同时保存当次交接标题和完整说明，后续转交或昵称变化不改写这份快照。状态通知另附反馈原文前 100 字，新反馈及回复继续保留原有正文预览。已有通知与记录不回填，也不使用当前负责人猜测历史交接对象。

`GET /v1/admin/feedback/queue` 接受 `queue`（默认 `UNASSIGNED`）、`page`（默认 1）、`pageSize`（默认 20，1–100）、`workArea`、`type`、`q`、`sortBy`（默认 `updatedAt`，仅 `createdAt`/`updatedAt`）和 `sortOrder`（默认 `desc`，仅 `asc`/`desc`，不区分大小写）。无效队列或排序返回业务 400。筛选、授权和队列条件在数据库分页前生效，返回的 `total` 是全部匹配数。管理员界面可用相同筛选、`page=1&pageSize=1` 获取每个可见队列数量。

队列包括 `UNASSIGNED`、`MINE`、`NEEDS_REPLY`、`DEV`、`RETURNED`、`CLOSED`、`ALL`。新增 `NEEDS_REPLY` 限制开放、未合并、`PROCESSING`、当前管理员是运营负责人且处于其运营板块的工单；按消息中的 `REPORTER`/`ADMIN` 顺序判断最后有效沟通来自用户，与 `FeedbackWorkflow.needsReply` 一致，不依赖历史预览字段 `lastMessageSender`。程序岗位范围不授予此队列的运营权限。

`RETURNED` 限制开放、未合并、`PROCESSING` 且有 `developerReturnedAt`，同时支持授权运营和程序板块，仍受原有可读范围限制。其他板块、已结案或未交回工单不会返回；本次不改变写入状态机、岗位模型和兼容管理授权。


## 2026-10-16：取消可见反馈类型，保留底层兼容

普通反馈表单仍向 `POST /v1/reports` 发送显式 `type=OTHER` 和动态 `category`，私下提交无需标题；`public_consent=true` 仍要求非空标题。客户端信息同意独立，默认 false。请求/响应字段、全部旧类型枚举、FEEDBACK 解析及内部类型筛选接口保留；不迁移历史类型或授权。前端工作台与广场不再发送类型筛选，公开编辑不再调用类型修改接口。

举报（`REPORT`，含旧 `FEEDBACK/category=REPORT`）始终排除公开访问：发布返回业务 403，公开详情/支持/取消支持返回业务 404，公开列表、相似召回、完成版本反查在 Mongo 查询层过滤，total 不包含举报。公开合并跳转不暴露举报目标。举报不允许通过类型更新改成普通工单，也不能与普通工单相互合并；已公开普通工单不能改为 REPORT。发布与类型写入的原子条件同样校验此边界，避免并发绕过。举报仍可由原有授权方查看、回复、流转、结案或取消误公开。

七队列定义、权限与统计语义不变。前端将 UNASSIGNED/MINE/NEEDS_REPLY/DEV 作为主入口，RETURNED/CLOSED/ALL 作为次级入口；数量不可直接相加。RETURNED 表示曾交回运营，不能当作严格的未验收数量。全管理范围已读不受当前筛选限制。

## 板块排序

`PUT /v1/admin/feedback-categories/order` 接受 `{"keys":["OTHER","CALENDAR"],"expected_keys":["CALENDAR","OTHER"]}`（示例仅含两个板块，实际必须包含完整 `category_catalog` 的全部 key，包括隐藏项）。`keys` 是新顺序，`expected_keys` 是客户端读取时的原顺序；响应为按新顺序排列的完整板块数组。权限沿用 `admin:feedback_access:manage`，无权限返回业务 403；重复、遗漏或未知 key 返回 400；原顺序过期或目录乐观锁冲突返回 409，客户端刷新后重试。

数组顺序直接持久化到现有目录，不新增字段或迁移数据。排序保留 key、名称、builtin_key、hidden、历史工单和授权。隐藏项仍参与排序，可见选项仅过滤隐藏项并保留相对顺序；新板块仍追加末尾。相同顺序不写库、不重复审计。实际变更在 hub 事务内记录 `FEEDBACK_CATEGORY_REORDERED`，`feedback_category_order` 前后快照为板块名称数组，供审计页面按当时名称显示。

用户执行下方已有目录测试命令即可覆盖排序新增用例。

## 板块隐藏与恢复

`PUT /v1/admin/feedback-categories/{key}/visibility` 接受 `{"hidden":true}` 隐藏，`{"hidden":false}` 恢复；响应为含 `key`、`label`、`builtin_key`、`hidden` 的目录项。沿用 `admin:feedback_access:manage` 权限和目录乐观锁：无权限、板块不存在、并发目录变更分别返回业务 403、404、409。重复设置不写库、不重复审计；变更使用 `FEEDBACK_CATEGORY_VISIBILITY_UPDATED` 审计及 `feedback_category_hidden` 前后快照。

隐藏适用于内置和自定义板块。前端用户提交/筛选、管理员筛选/调整板块/授权选择只用可见项；板块管理保留隐藏项和恢复入口。所有板块隐藏时可选目录为空，仍能查看、处理历史工单。历史名称、key、已有授权和流转权限保留；隐藏不是撤销权限，也不改变旧客户端/直接 API 的板块参数接受范围。隐藏后改名不恢复显示，自定义日历仍沿用原 key 和 builtin_key，不补建另一个可见日历。

验证（用户执行，Mongo 仅使用 TestMongo 自有一次性容器）：

```bash
./gradlew test --tests '*FeedbackCategoryServiceTest' --tests '*FeedbackAccessServiceTest' --tests '*FeedbackCategoryControllerContractTest' --console=plain
./gradlew integrationTest --tests '*FeedbackCategoryMongoTest' --console=plain
```
