# 密探化极历程

名册每位密探的「化极 → 历程」提供首次获得、二至五星及适用觉醒阶段的实际日期补录、修改与清空。仅记录大星级，不记录小节点。日期独立于当前练度：保存不修改练度、不扣库存、不改变养成目标。本体与 SP 使用各自密探 ID，历程不共享。

## API

JWT 私有接口，返回 `ApiResult` 与 `Cache-Control: no-store`：

- `GET /v1/operator/{operatorId}/milestones?account_id=…&game=…`
- `PUT` 同路径，以 `expected_revision` 和完整 `dates` 替换该密探的确认日期。

```json
{"expected_revision":0,"dates":{"star_1":"2026-06-01","star_2":"2026-07-10","star_3":null}}
```

响应 `data`：

```json
{
  "account_id":"example-account", "game":"如鸢", "operator_id":"example-operator", "revision":1,
  "milestones":[
    {"key":"star_1","date":"2026-06-01","observed_at":null},
    {"key":"star_2","date":"2026-07-10","observed_at":"2026-07-12T00:00:00Z"},
    {"key":"star_3","date":null,"observed_at":null}
  ]
}
```

例子省略了其余适用阶段；响应阶段由图鉴规则决定。`star_1` 表示首次获得；`star_2` 至 `star_5` 表示大星级；仅支持觉醒的密探返回 `awakening`。空值字段可能按全局序列化配置省略。

`date` 只接受用户确认的真实 `YYYY-MM-DD` 日历日期，按北京时间判定今天，不接受未来日期、无效日期、未知阶段、逆序日期或非整数版本。允许缺少中间阶段与同日多阶段；缺失或 `null` 清除该阶段的确认日期。未知根字段拒绝。400 `invalid_milestone` 表示输入无效，409 `milestone_revision_conflict` 表示需要重新读取核对；账号不可见与密探不存在返回 404。游戏必须匹配账号与图鉴。

`observed_at` 是现有校正审计中明确记载该阶段的最早时间（包括快捷提升形成的校正），只供参考，不认定为游戏内实际达成时间。按精确大星级阶段查询；不会把首次观察到三星的时间补到一星、二星。旧标量或导入快照不自动回填。观察日期不参与实际耗时计算。

## 耗时与交互

分段耗时 = 当前阶段确认日期 − 紧邻上一阶段确认日期；累计耗时 = 当前阶段确认日期 − 首次获得确认日期，按日历天数计算，同日为 0。任一端缺失则显示未知；不会跨越未知阶段伪造分段耗时。

弹窗懒加载，失败保留草稿，409 阻止重复保存并提供「放弃草稿并重新读取」。关闭未保存草稿需显式放弃；账号、登录用户、游戏或密探变化后旧响应失效。无浏览器本地持久化。

## 持久化与边界

Hub 集合 `operator_milestones` 保存 `userId/accountId/game/operatorId/dates/revision`。确定性 `_id` 是四个范围字段独立 UTF-8 URL-safe Base64 后用冒号连接。首次 insert 依赖 `_id` 唯一性；后续按完整身份和 revision 原子 CAS。写入使用现有 `hubTransactionTemplate` 和账号写栅栏，账号删除事务同时清理历程。GET 不写库。无需迁移或回填已有数据。

现有密探 JSON 导入／导出、公开分享和第三方 OpenAPI 均不包含补录日期；名册导入不覆盖它们。删除游戏账号会删除其历程。若用户仅移除后重新录入同一密探，保留其历程。部署需后端先行；回滚页面不会删除已保存日期。本次不新增心纸页入口、招募联动或自动快照回溯。

## 定向检查

```sh
./gradlew test --tests '*OperatorMilestoneServiceTest' --tests '*OperatorMilestoneControllerTest' --tests '*SubAccountServiceTest' integrationTest --tests '*OperatorMilestoneMongoTest' --console=plain
```

Mongo 测试仅使用 TestMongo 管理的可抛弃容器，覆盖所有者/账号/游戏/密探隔离、CAS、范围删除、事务回滚与参考时间查询。前端 `node --test test/operatorMilestones.test.js` 和 `npx vitest run behavior/operatorMilestones.spec.js` 覆盖计算与弹窗状态；真实桌面/手机布局、服务端接入由用户手动验收。
