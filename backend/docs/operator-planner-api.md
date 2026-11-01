# 养成规划云端 API

本接口按 YuanHub 当前 `OperatorGrowthTracker.vue`、`operatorTrainingPlans.js`、`cultivationPlanner.js`、`fixedPlannerSchedule.js` 实现编写。早期培养计划文档不作为本接口的行为定义。

## 范围与持久化

培养工作区、每个培养清单的体力日程分别保存、分别维护 revision。推荐、缺口、目标天数试算继续由前端计算。保存预测不会更新真实库存、奖励流水、当前密探练度；预测结果不是后端执行提升的凭据。

MongoDB 新增 `operator_training_workspace`、`operator_stamina_schedule`、`operator_planner_import`。前两个以 owner / owner+plan 唯一，最后一个以 owner+migration 唯一。owner 包含 JWT 用户及其子账号。正文经验证后保存为 JSON 字符串，以完整保留模拟器结构、动态材料键与数值；不按预测字段建查询索引。普通 GET 不创建文档。

不改动已有库存、密探 v2/v3 导入导出、默认 growth-targets、annotations 和 favorites 数据。升级部署会由现有 Spring Data 配置创建新集合索引；单文档首写还使用确定性 `_id` 防止并发重复。回滚代码可保留这三个集合，旧版本忽略它们；无需变更已有业务数据。

全部端点使用 JWT 及既有 ApiResult 包装。工作区与日程接口使用 `account_id`；大账号常用支出接口不依赖子账号。不存在或不可访问的子账号返回 404 `account_not_found`。接口不接受客户端 user_id。

## 工作区

`GET /v1/operator/training-workspace` 返回下列正文，额外包含 `account_id,revision,updated_at`。不存在时 revision=0、updated_at=null。

`PUT /v1/operator/training-workspace` 接收完整正文及 `expected_revision`：

```json
{
  "schema_version": 1,
  "expected_revision": 0,
  "active_plan_id": "favorites",
  "training_levels": {"fh":12,"ds":12,"yy":12,"experience":8},
  "plans": [
    {"id":"favorites","name":"特别关注","source":"favorites","operator_ids":[],"excluded_operator_ids":[],"targets":{}},
    {
      "id":"4d4e3763-2b56-4dda-9a3f-a79d4634e74b",
      "name":"主队培养","source":"custom",
      "operator_ids":["char_001_yangxiu"],"excluded_operator_ids":[],
      "targets":{"char_001_yangxiu":{"level":80,"elite":13,"star_level":19}}
    }
  ]
}
```

默认清单固定 id/source=favorites，在存在时必须唯一且 targets 为空；有效成员由实时 favorites 加入 operator_ids、再扣除 excluded_operator_ids 得到。自建清单使用稳定 UUID、source=custom。工作区可以不含任何清单，此时 `plans=[]` 且 `active_plan_id=null`；存在清单时 `active_plan_id` 必须指向其中一张。移出成员的目标可保留以供重新加入。名称去首尾空白后 1..40 字，成员 ID 不可重复，目标与成员必须是已知密探。四类最高通关层数范围 1..12 / 1..8，目标范围 level=0..100、elite=0..17、star_level=0..31，且 elite 不得超过 `min(17,max(0,floor(level/5)-3))`。非法组合直接拒绝，不截断或改写用户提交的数据；客户端仍以当前档案进度为显示下限。

完整快照条件更新；成功 revision 加 1，过期版本返回 409 `training_workspace_revision_conflict`，不自动重试覆盖。删除清单通过工作区 PUT，关联日程暂留但不可从该清单 API 访问；当前页面撤销恢复原 UUID 后可恢复日程。子账号删除时一并清理工作区、所有日程和导入回执。

## 体力日程

### 子账号每日来源（可选扩展）

工作区可保存 `stamina_sources`，由同账号下所有培养清单共享，仍使用原有 `expected_revision` CAS与账号事件，不增加集合或接口。账号对应游戏由SubAccount决定。

```json
{"monthly_card":{"tier":"zhaoyang","daily_enabled":true,"shop_enabled":true,
 "daily_amount":60,"shop_amount":20,"start_date":"2026-10-17","end_date":"2026-11-16"},
 "fixed_sources":[{"id":"event","label":"每日活动","value":30,"enabled":true}]}
```

`tier`允许none/yinghuo/xingguang/yuehua/zhaoyang/custom；数值为0..99999整数，日期可为空字符串，日期范围包含首尾，开关须为boolean。fixed_sources最多32个，ID唯一且1..96字符，名称1..32字符；禁止buy、reserve、求解器内部required-extra/diagnostic-budget/planner-reserve-*及两个月卡专用ID（购买沿用次数，储备为一次性）。

日程根preferences与schedule.context.preferences可包含 `source_periods:[{"from_date":"2026-10-17","sources":{...}}]`，sources结构同stamina_sources，from_date严格递增且唯一。前端根据日期取最后生效规则；同一开始日重复应用替换旧规则，不逐日复制模板。标准月卡体力ID分别为 `monthly-card-daily` 和 `monthly-card-shop`。

旧数据缺少可选字段时按原规则读取，不增加月卡；旧客户端编辑工作区未携带stamina_sources时保留原配置，不让其删掉新设置。已有source_periods的日程若收到省略此字段的旧客户端写入，返回409 `stamina_sources_client_outdated`，要求更新页面；不静默移除规则。revision冲突和不可变历史检查仍按原逻辑运行。

账号配置保存与当前清单应用是两个revision作用域，非跨文档原子操作：配置保存成功、日程应用失败时，保留配置并由用户重试日程，不回滚或覆盖其他设备。仅按新规则实现可选字段支持，schema_version=1与rules_version=13不变；不迁移或重算已保存快照，不影响库存v2协议。

先发布后端可选字段支持，再发布前端。后端回退前需评估已有扩展日程：旧后端会拒绝新字段写入；不得自动清除扩展数据来绕过校验。

最小验证：`./gradlew test --tests '*OperatorPlannerServiceTest' --tests '*OperatorPlannerControllerContractTest' --tests '*InventoryServiceTest' --console=plain`。CAS的真实Mongo覆盖：`./gradlew integrationTest --tests '*OperatorPlannerMongoTest' --console=plain`，只使用TestMongo自有可抛弃容器，不连接开发/生产数据库。均由用户/CI执行。

### 日程读写

`GET/PUT /v1/operator/training-plans/{planId}/stamina-schedule`。所属清单不存在返回 404 `training_plan_not_found`。

```json
{
  "schema_version":1,"rules_version":13,"timezone":"Asia/Shanghai",
  "expected_revision":0,"strategy":"overall","agent_order":[],
  "preferences":{"luoyang":0,"shouchun":0,"purchase_count":0},
  "manual_plans":{},"schedule":null
}
```

GET/PUT 响应额外含 `account_id,plan_id,revision,updated_at`。strategy 为 overall/priority；派遣偏好 0..4，购买偏好 0..8。timezone 使用 IANA 时区。用户首次自定义后，schedule 是当前前端完整固定快照，字段按 snake_case 转换：

- `version,start_date,baseline_date,context,history,result`。
- context：`date,initial_state,required_state,stock,goals,levels,strategy,agent_order,preferences`。
- 每日预测保留 `date,start,end,recommended,planned,manual,errors,warnings,sources,yield,planned_yield,used,surplus,totals,progress_rows` 以及存在时的 `index,paused,legacy`。
- result：`timeline,status,eta_days,last_progress_day,remaining,blocked`。
- 资源键（如 `shuijing`、`__xp__`）、密探 ID、日期键不改写。
- gains：来源 id/label/kind/value 与当前前端保存的可选展示字段。
- spends：支出 id/label/kind/value/cost_per/yield，历练含 group_id/stage_level，自定义可含 name/custom。

用户编辑中的次数小数、超支等不可执行安排可以保存为草稿，不静默截断。预测状态为 invalid/paused 的日子必须 end=start 且实际 yield/used/surplus 为零；planned_yield 可用于展示原拟产出。后端验证结构与此持久化约束，不替代前端重算固定渠道掉落。

GET 不因日期、当前库存、练度或规则变化重算。PUT 不允许清空已有固定快照、不允许更改固定快照时区；按保存时区计算业务日，并以当地 05:00 为切换点，过去业务日必须完整保持。前端显式更新可从当前库存重新生成今天及以后；历史预测及未来自定义安排由前端完整提交。允许保留周期以外的自定义日期。

过期 revision 返回 409 `stamina_schedule_revision_conflict`。结构错误返回 422 `invalid_training_workspace` 和 `field_path`；不支持的外层版本返回 422 `unsupported_training_workspace_version`。

## 移除与毕业

`POST /v1/operator/training-plans/{planId}/members/{operatorId}/remove`：

```json
{"expected_revision":3,"graduate":true,"expected_annotation_revision":2}
```

expected_revision 指工作区。graduate=false 时不需要 annotation revision。graduate=true 时在同一个 Hub Mongo transaction 内更新成员和 annotation.growth_state=graduated，保留备注、favorites、所有目标。任一步冲突都会回滚；返回 `{workspace,annotation?}`。当前页面撤销仅恢复清单，不回退毕业标注。

## 本机导入

`POST /v1/operator/training-workspace/import-local`：

```json
{
  "migration_id":"persistent-client-generated-id",
  "workspace":{"schema_version":1,"expected_revision":0,"active_plan_id":"favorites","training_levels":{"fh":12,"ds":12,"yy":12,"experience":8},"plans":[{"id":"favorites","name":"特别关注","source":"favorites","operator_ids":[],"excluded_operator_ids":[],"targets":{}}]},
  "schedules":{}
}
```

schedules 是 planId → 日程 PUT 正文，包含各自 expected_revision。前端先比较本机和云端、提供已选择的完整快照；服务端不隐式合并。默认云端 growth-targets 不在此迁移中重复导入。

工作区、日程和回执在同一事务提交。相同 owner+migration_id 且相同请求重试，在 revision 检查前返回原 `{migration_id,imported_at,workspace,schedules}`；相同 ID 不同内容返回 409 `training_workspace_migration_conflict`。请求正文直接结构比较，不新增哈希。

## 事件与验证

首页今日历练与独立完成记录使用新增 [每日历练待办 API](operator-daily-tasks.md)。它从已保存日程提取当天历练，显式加入，不修改已有日程或库存。

成功提交后通过现有账号 SSE 发布 `operator_training_workspace`、`operator_stamina_schedule`；组合毕业另发 `operator_annotation`。data 含 account_id/revision 和日程的 plan_id。事件用于触发重新读取，不携带敏感快照；重连仍需要 GET 补齐状态。

单元及 HTTP 契约测试：

```bash
./gradlew test --tests '*OperatorPlanner*' --tests '*SubAccountServiceTest'
```

测试资源 `src/test/resources/operator-planner/frontend-fixed-schedule.json` 由当前前端模拟器直接生成，用于固定日程往返验证。可用本地 replica set 验证实际并发 CAS 和跨集合回滚：

```bash
PLANNER_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&serverSelectionTimeoutMS=3000' \
  ./gradlew test --tests '*OperatorPlannerMongoTest'
```

集成测试仅创建并删除自己的随机 `planner_test_*` 数据库，不读取或修改应用数据库。

### SP 星级目标（2026-10-05）

规划 workspace 的星级目标按目录识别：旧字段普通密探保留0..31兼容编码（25..30均五星，31只确认觉醒），SP保留0..5直接星级；新huaji使用独立owned/stage/awakened，不以31作为新阶段；超出对应范围拒绝保存。默认养成目标及 v3 annotation targets 使用相同约束。各形态保留独立目标，客户端在单个清单中按本体关联组合并等级/修为的最大目标，材料只计一次。

## 独立化极（本次兼容更新）

新Current/PATCH/目标使用huaji owned/stage/awakened；普通终点25、隐密24、SP稀疏stage且材料422保护。level/elite共享只计一次，stage/awake目标独立。旧25..30永久适配五星，31仅确认觉醒且stage可未知，历史异常不批量清理。无损交换使用operator-only v4；旧v2 camelCase/v3字段及幂等契约保留，旧观测不伪造新验证。详情见[化极兼容规范](./operator-huaji-compatibility.md)。


## 大账号常用支出与持续每日安排

`GET/PUT /v1/operator/custom-spend-templates` 只从 JWT 获取大账号 userId，不接受正文中的 owner/user_id/account_id。相同大账号的所有游戏子账号共享模板；子账号分享权限不授予此接口的访问权。GET 返回 `schema_version:1, revision, updated_at, templates`，空读 revision=0、不建档；成功与业务错误均使用 no-store。PUT 格式：

```json
{"schema_version":1,"expected_revision":0,"templates":[{"id":"custom-spend-lantai","label":"兰台扫荡","cost_per":10,"yield":{"__xp__":1000}}]}
```

独立 Mongo 集合 `operator_custom_spend_templates` 以 JWT userId 为 `_id`；首次 insert 唯一性和后续 revision 原子 CAS 均只能有一个并发赢家。冲突返回 HTTP 409 `custom_spend_templates_revision_conflict`。空 templates 明确清空列表。最多32项、ID唯一且须为 `custom-spend-` 开头的字母数字/连字符（后缀1–100字）；名称去空白后1–32字；体力和产出是有限非负数，产出只接受已知物品或 `__xp__`。模板不存每日次数。删除子账号不清理该集合；当前代码无大账号删除入口。

日程 preferences 新增可选 `custom_spend_rules`，按当前子账号及培养清单保存，每项保留独立版本和项目副本：

```json
{"custom_spend_rules":[{"id":"custom-spend-lantai","versions":[{"from_date":"2026-10-27","enabled":true,"count":10,"item":{"label":"兰台扫荡","cost_per":10,"yield":{"__xp__":1000}}},{"from_date":"2026-11-01","enabled":false}]}]}
```

最多32项，每项1–366个有序且日期唯一的版本，次数0–9999整数；停用版本通常只有 from_date/enabled；取消尚未开始的规则时可另存 item/count 副本用于恢复，仍不计成本或产出。日期沿用北京时间05:00业务日。改动从指定日期替换该项目后续版本，历史版本及其他项目保留。模板改名/删除不暗改规则副本；规则无需模板仍存在即可计算。启用或修改前端校验当前90天全部预算（包含备齐后的手工日），失败不部分提交；后端校验结构及所有权，继续允许一般手工超支草稿存档。

每日 plan 新增可选 `custom_spend_overrides: ["custom-spend-lantai"]`；相应行仍存于 spends。标记存在而行不存在表示跳过当天，恢复移除标记。归一化、云端往返、范围应用和精确方案均保留标记。重设清除未来手工例外，保留长期规则；过去已存快照不可改写。旧90天批量安排不会自动迁移成长期规则。

新日程 PUT（包括 import-local 内嵌日程）携带请求级 `client_features:["custom-daily-spends-v1"]`，该标记不持久化。已有或新快照含规则/单日覆盖时，未声明能力的写入返回 HTTP409 `custom_daily_spends_client_outdated`，包括仅保存在 `schedule.context.preferences.custom_spend_rules` 中的规则；即便旧客户端回传未知规则也拒绝，避免旧算法静默忽略约束。先发布本后端，再发布前端；旧后端拒绝时不得删字段降级保存。模板与日程的 revision 和失败恢复完全独立，不承诺跨文档原子保存。
