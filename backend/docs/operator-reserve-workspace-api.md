# 未来密探储备工作区 API v1

未来储备只保存假设需求，不创建密探、不调用真实养成/库存写接口，也不生成固定体力日程。与现有 training-workspace v1 独立。

## 请求与响应

需要登录、现有密探功能访问权限及 `operator_reserve:use`。此权限当前仅授予平台管理员（`PLATFORM_ADMIN`）与超级管理员（`SUPER_ADMIN`），普通用户和内测用户均不可访问；账户仍须属于当前认证用户。未登录返回 401，无功能权限返回 403 `feature_forbidden`，且不会读取或修改工作区。已有方案保留，真实培养规划不受影响。

- `GET /v1/operator/reserve-workspace?account_id=...`：返回完整工作区。首次读取返回 revision 0、plans 空数组、active_plan_id null、updated_at null，不创建任何数据、不更新账户 fence、不发布事件。
- `PUT /v1/operator/reserve-workspace?account_id=...`：整个工作区按 expected_revision 替换。只接受下列正文，不接受 user_id、account_id、game 或 read_only 等响应字段。

```json
{
  "schema_version": 1,
  "expected_revision": 0,
  "active_plan_id": "00000000-0000-4000-8000-000000000001",
  "plans": [{
    "id": "00000000-0000-4000-8000-000000000001",
    "name": "未来主队",
    "demands": [{
      "id": "00000000-0000-4000-8000-000000000002",
      "count": 2,
      "attribute": "阴",
      "profession": "破军",
      "current": {"level": 100, "elite": 13, "breakthrough_stage": 9},
      "target": {"level": 100, "elite": 17}
    }]
  }]
}
```

成功沿用 `ApiResult.data` 包装，data 为上述内容（移除 expected_revision），另带：

| 字段 | 含义 |
| --- | --- |
| account_id | 经过授权检查的子账号 |
| game_snapshot | 工作区首次保存时的账号游戏 |
| read_only | 当前游戏与 game_snapshot 不同时为 true |
| revision | 保存后递增的整数；空 GET 为 0 |
| updated_at | ISO 时间；空 GET 为 null |

## 校验与边界

方案和需求 ID 为 UUID，各自在工作区/方案内不可重复。最多 50 个方案、每方案 50 组需求；名称为 1–40 字符且不可全空白；count 为 1–999 整数。空工作区 active_plan_id 必须为 null，其余必须指向现有方案。

属性只允许风、火、地、水、阴、阳、混沌；职业只允许破军、龙盾、岐黄、神纪、诡道。level 为 0–100 整数、elite 为 0–17 整数且不超过现有 OperatorGrowthRules 对应等级上限。目标等级、修为都不得低于当前。拒绝字符串数值、小数、未知字段及 operatorId、心纸/化极/觉醒字段。

current.breakthrough_stage 可缺失/null，或为与该等级匹配的 0–9 整数：整十 10–90 可为节点前/后阶段；其他等级沿用 OperatorLevelBreakthroughRules。等级 0 只能未知。目标不保存突破状态。

混沌和待确认突破的需求可以保存。服务端仅校验需求，不重算费用；客户端须将无规则/跨越未确认节点的费用标为未知，不默认风火或零费用。

## 隔离、冲突与生命周期

集合 `operator_reserve_workspaces` 位于 Hub 数据源，唯一 `(userId, accountId)`，保存 gameSnapshot、payloadJson、revision、updatedAt。userId 仅来自认证，游戏仅来自授权账户。写事务使用账户现有 fence，避免与游戏切换/删除并发产生孤立或错误归属数据；GET 无写。

- 非本人/不存在账户：404 account_not_found。
- 非法正文：422 invalid_reserve_workspace，error.field_path 指向非法字段；错误 JSON/非对象正文沿用 schema_validation_failed。
- 旧 revision、首次创建竞争、账户并发变化：409 reserve_workspace_revision_conflict；客户端保留草稿，先 GET 比较，明确选择采用云端或用最新 revision 重试。网络结果不确定时保留原正文/expected_revision；不要自动提高 revision 覆盖。
- 游戏切换后保留旧工作区，GET read_only=true，PUT 返回 409 reserve_workspace_game_changed。请新建对应游戏账号继续；不会静默删除或将旧记录解释为新游戏。切回原游戏后原方案可继续编辑。
- 删除账户在现有 Hub 事务内清理该账户储备；事务失败一并回滚，不触及其他账户。

成功提交后通过 AccountEventService.publishChange 发布 operator_reserve_workspace（account_id、revision），事务回滚不发送。旧清单、固定日程、真实名册和库存协议不变。
