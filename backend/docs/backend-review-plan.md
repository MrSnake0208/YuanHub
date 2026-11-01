# 后端逐模块 Review 计划

制定日期：2026-09-10。范围：`BackEndV3-Share`。

初始代码基线：`6f73ee1`，当时后端工作区无未提交改动；盘点到 231 个生产 Kotlin 文件、59 个测试 Kotlin 文件。这是计划制定时的静态盘点，尚未执行模块 review 或测试，不代表质量检查通过。后续每轮记录实际 commit 和工作区状态。

按「公共基础 → 身份与权限 → 核心数据 → 内容业务 → 跨模块验收」推进。每轮检查完整的 `Controller → Service → Repository/Entity → 测试 → 接口契约` 调用链。范围以当前后端仓库为主，前端与 MaaYuan 仅在核对直接相关契约时查阅。

## 使用方式与进度约定

- 按下面的编号依次 review，每次一个单元；06、07、16 已拆成 A/B 两轮，共 24 轮（含基线和最终验收）。
- 清单勾选表示「审阅完成且报告已保存」，不表示发现的问题已经修复。未验证项、阻塞问题和修复状态在报告中单独记录。
- 每轮报告保存到 `docs/reviews/<编号>-<主题>.md`，完成后在对应清单项补充实际报告链接；开始该轮时再创建报告，不预建空文件。
- 如果认证、账号归属或事务基础存在已确认的阻塞问题，先记录影响范围；取得修复授权并完成回归后，再继续依赖它的模块。
- 业务代码修复、spec promotion、commit、push、PR 和迁移 apply 不属于这份 review 计划的自动授权范围。

## 逐轮清单

以下 Kotlin 入口均相对于 `src/main/kotlin/com/lhs/share/`；列出的是起点，相关 DTO、仓储、实体、异常处理及调用方一并检查。检查重点都是待核实事项，不代表已确认存在缺陷。

### 公共基础与身份权限

- [ ] **00｜基础配置与验证基线**

  入口：`config/`、`handler/`、`repository/RedisCache.kt`、`common/`、`service/DataTransferService.kt`、应用与构建配置。
  检查 Maa/Hub 双库与事务管理器绑定、序列化和参数校验、HTTP 状态与业务错误码、限流、日志脱敏、环境配置、线程池与异步配置；记录现有测试和 lint 结果。

- [ ] **01｜用户与登录认证**

  入口：`controller/UserController.kt`、`service/UserService.kt`、`service/EmailService.kt`、`service/jwt/`、`config/security/`。
  检查注册、登录、刷新、改密、重置密码完整链路；验证码一次性消费；账号禁用和旧令牌行为；共享 `maa_user` 数据兼容；公开用户信息范围。

- [ ] **02｜管理员权限与审计**

  入口：`hub/service/admin/`、`hub/controller/admin/AdminAccessController.kt`。
  检查各角色实际权限、降权后的权限生效、最后超级管理员保护、操作授权与审计一致性、反馈领域授权边界。

- [ ] **03｜第三方 API Token**

  入口：`openapi/`、`hub/repository/OpenApiTokenRepository.kt`。
  检查 Token 生成、认证、撤销、scope 更新、绑定用户和子账号、Redis 缓存失效；逐个核对 `/open-api/**` 入口是否执行对应授权。库存和养成算法留给对应领域轮次。

- [ ] **04｜子账号生命周期**

  入口：`hub/service/account/SubAccountService.kt`、`hub/controller/account/AccountController.kt`。
  检查用户隔离、game 边界、创建和改名冲突；删除时是否清理库存、养成、星石、Token 等关联数据；删除事务失败后的状态。SSE 的传输与连接管理在第 15 轮集中检查。

### 目录与核心数据

- [ ] **05｜物品目录与密探图鉴**

  入口：`hub/service/inventory/EntityCatalogService.kt`、`hub/service/operator/OperatorCatalogService.kt`、`hub/service/operator/AvatarStorage.kt`。
  检查稳定 ID、不同 game 数据隔离、种子数据与数据库的更新关系、管理员维护权限、目录版本和缓存、头像文件与数据的一致性。

- [ ] **06A｜库存读取、统计与特别关注**

  入口：`hub/service/inventory/InventoryService.kt` 的 `current`、`listRecords`、`acquired`，以及 `InventoryAgentFavoriteService.kt`。
  检查当前库存与奖励历史的职责、用户和子账号过滤、时间范围统计、分页和索引、特别关注的数据归属和目录约束。

- [ ] **06B｜库存导入导出与流水变更**

  入口：`hub/service/inventory/InventoryService.kt` 的 `import`、`export`、`deleteRecord`，及浏览器和第三方入口。
  检查 `reward_delta`/`stock_snapshot`、full/listed、迟到记录、重复与冲突记录、删除流水后的状态、导出再导入、失败时的事务边界和并发写入。核对现行协议版本及兼容约定。

- [ ] **07A｜密探当前客观养成与手动修正**

  入口：`hub/service/operator/OperatorService.kt` 的 `current`、`previewCurrentPatch`、`patchCurrent` 及相关实体和 DTO。
  检查字段约束、两个游戏的数据语义、当前数据读取、部分修改和清空、修正记录、预览与执行一致性。

- [ ] **07B｜密探原有导入导出与历史重建**

  入口：`hub/service/operator/OperatorService.kt` 的 `import`、`listRecords`、`deleteRecord`、`export`、`completeFullImport`。
  检查快照覆盖、记录时间顺序、幂等与冲突、记录删除及重建、修正数据保留规则、事务与跨账号隔离。v3 协议适配在第 09 轮检查。

- [ ] **08｜主观标注与养成目标**

  入口：`hub/service/operator/OperatorSubjectiveService.kt`。
  检查收藏、备注、养成状态和目标的归属、部分更新与清空语义、客观数据重建对主观数据的影响、revision 的变化条件。

- [ ] **09｜密探交换协议 v3**

  入口：`hub/service/operator/OperatorV3ImportService.kt`、`OperatorV3ExportService.kt`、`OperatorV3SchemaValidator.kt` 和 `src/main/resources/schema/`。
  检查浏览器与第三方扫描入口差异、Schema 与实际校验一致性、preview/commit 一致性、重复导入、full 重置、主观数据备份恢复、失败时的写入范围。

- [ ] **10｜快捷提升与库存扣减**

  入口：`hub/service/operator/OperatorUpgradeService.kt`、`OperatorRequirementRules.kt`。
  检查消耗计算、预览后数据变化、重复执行、库存不足、养成提升与库存扣减及流水/revision 的原子提交、失败后的状态、成功事件发送时机。

- [ ] **11｜星石库存快照**

  入口：`hub/service/star/StarInventoryService.kt`。
  检查完整替换与空快照、实例 ID 和字段约束、旧时间拒绝、同时间冲突、重复提交幂等、并发 revision、账号删除清理。

- [ ] **12｜密探只读分享**

  入口：`hub/service/operator/OperatorShareService.kt`。
  检查开启、关闭、重置分享码、旧链接失效、匿名响应字段范围、关闭与读取并发、账号删除后的分享行为。

### 媒体、反馈与消息

- [ ] **13｜媒体与附件存储**

  入口：`hub/service/media/MediaStorageService.kt`、媒体 Controller、静态资源配置。
  检查上传大小和实际文件类型、路径处理、公开图片与私有附件的访问权限、文件和数据库写入失败时的清理、反馈与更新日志的资产使用约束。

- [ ] **14｜反馈工单**

  入口：`hub/service/report/FeedbackReportService.kt`、`FeedbackAccessService.kt`、反馈查询仓储。
  检查提交者与管理人员的读写权限、工单状态流转、追加消息和附件归属、查询过滤与分页、工单保存和通知失败之间的关系。

- [ ] **15｜通知与账号 SSE**

  入口：`hub/service/notification/NotificationService.kt`、`hub/service/account/AccountEventService.kt` 及全部事件调用方。
  检查通知接收人和排除自身、未读数、单条/全部已读；SSE 用户与账号隔离、提交成功后的事件发送、断连清理、异常调度、与实际部署方式的兼容性。

### 目录管理与其他业务

- [ ] **16A｜关卡查询、管理与历史审计**

  入口：`hub/service/level/LevelCatalogService.kt` 的查询、创建、更新、归档、恢复和历史方法。
  检查公共查询和管理权限、稳定 `levelKey`、game 内标识唯一性、时间过滤、归档恢复、revision 乐观锁、目录版本、业务变更与历史审计的事务一致性。

- [ ] **16B｜关卡导入导出与迁移**

  入口：`LevelCatalogService.kt` 的导入导出方法、`scripts/migrations/20260907-level-catalog.js`、`level-catalog-normalizer.js` 及对应测试。
  检查预览与提交、冲突和部分失败语义、导出恢复、迁移重跑和目标库保护、索引建立、MaaYuan 兼容契约；不提前移除仍需保留的旧链路。

- [ ] **17｜可视化更新日志**

  入口：`hub/service/changelog/ChangelogService.kt`、`ChangelogContentValidator.kt`。
  检查草稿、提交、审核、退回和撤回状态流转、作者自审限制、已发布快照保持、乐观锁、Tiptap JSON 与图片引用校验。

- [ ] **18｜广陵账房**

  入口：`hub/service/ledger/LedgerPlanService.kt`、账房 Controller 与请求 DTO。
  检查用户归属、方案数量限制、嵌套参数校验、版本与礼包数据、保存和更新的覆盖语义、summary 计算；对照已有明确约定，避免把已确认的设计当作缺陷。

- [ ] **19｜帖子及剩余入口**

  入口：`hub/service/HubPostService.kt`、`HubUserInfoService.kt`、Demo/System Controller 及其依赖。
  检查公开读写范围、用户信息拼装、列表规模、Demo 接口的实际部署用途；对照全部路由与生产文件清单，将尚未覆盖的入口及公共代码纳入本轮或补充到所属轮次。

### 最终验收

- [ ] **20｜跨模块最终验收**

  验证账号删除、权限撤销、导入重试、升级扣库存、反馈通知等完整链路；核对真实数据库索引与事务、迁移顺序、客户端契约；核实各轮问题状态并执行全量检查。未解决的阻塞问题必须保留在结论中。

## 每轮执行流程

1. **限定范围**：记录实际 commit 和工作区状态、目标接口、涉及的 Service/实体、直接调用方；关联问题追踪到共同根因，避免仅检查被点名的入口。
2. **明确业务规则**：阅读直接相关规范和测试，再检查成功、失败、重复、越权、并发等实际可达路径。区分当前契约、历史设计和未实施计划。
3. **核实测试证据**：运行相关现有测试，记录命令、结果及覆盖边界；缺少证据时记录具体补测场景。需要新增测试或修改业务代码时另行取得授权。
4. **输出问题报告**：每条包含严重程度、文件与行号、触发条件、实际影响、证据、最小修复建议。待验证假设单独列出，不作为已确认缺陷。
5. **记录结论**：明确已审范围、未覆盖项、阻塞项及验证结果；没有发现问题就直接说明。保存报告并回填本计划，修复和修复后回归状态单独记录。

严重程度使用 P0/P1/P2/P3：分别表示需立即阻断的严重问题、高优先级正确性或权限/数据问题、一般缺陷、低影响改进；以真实触发条件和影响确定等级，不因缺少测试就直接判定存在业务缺陷。

## 验证规则与命令

- **测试数量不等于风险覆盖。** 初始抽查的库存测试使用 mock 仓储和模拟事务；真实 MongoDB 唯一索引、回滚和并发写入需要在隔离测试环境中另外验证。Controller 的 standalone MockMvc 测试也需要区分是否实际装载安全过滤器。
- 执行依赖数据库、Redis、文件或邮件的检查前，核实其配置与副作用。真实写入验证使用隔离数据和测试资源；迁移 apply、共享数据写入、重启服务等按项目规则取得授权。
- 需要开发服务时先检查并复用现有服务；确需启动时只从父工作区使用 `./dev.sh` 或 `./dev.sh backend`。不得自行重复启动、重启或终止现有服务。
- 第 00 轮记录初始全量基线；中间各轮运行与风险对应的检查；第 20 轮在核实环境隔离后执行全量验收。失败须区分已有失败、环境阻塞和本轮发现的问题。

以下 Gradle 命令均从后端仓库根目录执行。单轮选择实际相关的测试类，下面以用户认证为例：

```bash
./gradlew test --tests 'com.lhs.share.service.UserServiceTest' --tests 'com.lhs.share.service.EmailServiceTest' --tests 'com.lhs.share.service.jwt.JwtServiceTest'
```

初始基线与最终验收：

```bash
./gradlew test ktlintCheck
```

关卡迁移的本地测试与只读预览：

```bash
node --test scripts/migrations/20260907-level-catalog.test.js
node scripts/migrations/20260907-level-catalog.js --dry-run
```

上面是后续执行命令，本计划制定时未运行这些检查。`scripts/inventory-smoke.sh` 包含业务写入，使用前检查目标和数据，不作为无条件执行项。

## 直接相关文档

- [后端 README](../README.md)：接口、部署及当前业务说明。
- [库存后端设计](standards/inventory/backend-design.md)、[库存交换协议 v1](standards/inventory/exchange-protocol-v1.md)、[协议 Schema](standards/inventory/schema/inventory-exchange-v1.schema.json)：库存领域基础约束；结合[子账号统一迁移说明](frontend-subaccounts-unified-migration.md)等核对后续协议演进。
- [多管理员权限计划](multi-admin-permission-plan.md)：权限设计背景，实际实现需逐项核对。
- [密探主观数据与快捷提升 API](operator-growth-persistence-upgrades-api.md)：主观数据、完整备份与扣库存契约。
- [星石库存规范](../../.trellis/spec/backend/star-inventory-guidelines.md)、[通知路由规范](../../.trellis/spec/backend/notification-guidelines.md)：父工作区中的领域约定。
- [YuanHub API 契约](../../YuanHub/docs/api-contract.md)：前后端直接相关契约，尤其关卡目录。
- [广陵账房设计](guangling-ledger/02-backend-design.md)、[联调反馈与处理结论](guangling-ledger/04-frontend-contract-feedback.md)：明确已确认行为与历史问题处理结果。

父工作区 `.trellis/spec/backend/` 中仍有占位文档，不能当作已落实的项目约定。上面的跨仓库链接依赖 `yituliu/BackEndV3-Share` 与 `yituliu/YuanHub` 的工作区布局。

## 每轮报告模板

```markdown
# <编号>｜<模块名称> Review

- 日期：
- 代码基线与工作区状态：
- 审阅范围：
- 参考契约：
- 审阅状态：进行中 / 已完成 / 阻塞

## 已确认问题

### [P1/P2/P3，必要时 P0] <具体问题>

- 位置：文件与行号
- 触发条件：
- 实际影响：
- 证据：调用链、现有测试或可复现结果
- 最小修复建议：
- 处理状态：待修复 / 已修复待回归 / 已回归 / 接受保留（记录确认依据）

## 待验证假设与未覆盖项

注明缺少什么证据，以及需要哪项检查才能确认。

## 验证记录

记录实际执行的命令、通过/失败/未执行、失败原因及证据边界。

## 结论与后续

写明是否存在阻塞项、关联模块，以及修复后需回归的范围。
无已确认问题时明确说明；保留未验证项。
```

## 后续执行指令

将编号与名称替换为下一轮即可：

> 按 `BackEndV3-Share/docs/backend-review-plan.md` 执行第 01 轮：用户与登录认证。只做 review，不修改业务代码。检查完整调用链、直接调用方和相关测试，按严重程度报告已确认问题，并列出未验证项。将报告保存到 `BackEndV3-Share/docs/reviews/01-user-auth.md`，完成后更新计划中的对应进度与报告链接。不要提交、推送或执行迁移 apply。
