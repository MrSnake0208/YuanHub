# 密探心纸追踪后端扩展规格

状态：后端已实现，待前端接入  
适用范围：`/v1/inventory`、登录用户的库存子账号  
关联契约：`docs/api-contract.md` 中“库存接口契约（交换协议 v2）”

## 1. 目标

本扩展需要支持以下能力：

1. 登录用户可以为某个库存子账号标记“特别关注”的密探。
2. 特别关注状态在登录后跨设备、跨浏览器同步。
3. 不同库存子账号的特别关注列表完全独立。
4. 密探心纸编辑只更新该子账号的库存数量，不能修改密探名称、星级、属性、职业等目录元数据。
5. 密探发布顺序不存入数据库。前端从密探 ID 的数字段推导，例如 `char_102_jianyong` 的发布序号为 `102`，数字越大越新。

## 2. 领域边界

### 2.1 特别关注是偏好，不是库存

特别关注数据不得写入以下结构：

- 库存当前值；
- `reward_delta` 或 `stock_snapshot` 流水；
- 时段获得量；
- 库存交换档案 v2；
- 密探公共目录。

关注或取消关注不能改变库存数量，也不能产生库存记录。

### 2.2 密探目录元数据不可由库存写入修改

库存写入只接受并使用：

```json
{
  "id": "char_102_jianyong",
  "name": "简雍",
  "count": 12
}
```

其中 `id` 用于定位目录对象，`count` 是唯一可变的业务值。请求中的 `name` 仅为交换档案的可读冗余字段；后端不得用它覆盖目录名称。即使客户端额外提交 `rarity`、`prof`、`sub_prof` 等字段，也不得写入或更新公共目录。

密探的名称、星级、属性和职业只能通过受控的目录更新流程变更，不能通过用户库存接口变更。

## 3. 数据模型

建议新增表 `inventory_agent_favorite`。字段类型、账号表名、时间类型和命名方式应沿用后端现有库存模块。

本项目实际使用 MongoDB，对应集合为 `inventory_agent_favorites`：`(accountId, agentId)` 唯一索引承担并发幂等约束，账号删除在同一 Hub Mongo 事务中显式级联清理关注数据。

| 字段 | 约束 | 说明 |
|---|---|---|
| `account_id` | NOT NULL、外键 | 库存子账号 ID |
| `agent_id` | NOT NULL | 密探目录 ID，如 `char_102_jianyong` |
| `created_at` | NOT NULL | 首次关注时间 |

约束与索引：

- 主键或唯一约束：`(account_id, agent_id)`；
- `account_id` 外键指向库存子账号，删除子账号时 `ON DELETE CASCADE`；
- 以 `account_id` 查询是主要访问路径，复合主键通常已满足索引需求；
- 不需要单独保存 `user_id`，但每次读写必须通过当前 JWT 用户校验 `account_id` 的所有权；如果现有库存表普遍冗余保存 `user_id`，则遵循现有模型。

参考 SQL（需要按实际数据库和现有命名调整）：

```sql
CREATE TABLE inventory_agent_favorite (
    account_id VARCHAR(64) NOT NULL,
    agent_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (account_id, agent_id),
    CONSTRAINT fk_inventory_agent_favorite_account
        FOREIGN KEY (account_id)
        REFERENCES inventory_account (id)
        ON DELETE CASCADE
);
```

迁移必须由项目现有的 Flyway、Liquibase 或其他迁移机制管理，不应在应用启动代码中临时建表。

## 4. API 契约

所有接口均需要普通登录 JWT。暂不扩展 OpenAPI Token scope。

成功响应继续使用库存模块现有包装：

```json
{
  "status_code": 200,
  "message": null,
  "data": {}
}
```

错误继续使用库存模块现有结构：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "可直接展示的错误信息",
    "entry_id": "char_102_jianyong"
  }
}
```

### 4.1 查询特别关注列表

```http
GET /v1/inventory/agent-favorites?account_id=acc_xxx
Authorization: Bearer <JWT>
```

响应：

```json
{
  "status_code": 200,
  "message": null,
  "data": {
    "account_id": "acc_xxx",
    "agent_ids": [
      "char_038_luxun",
      "char_102_jianyong"
    ]
  }
}
```

`agent_ids` 必须去重。为了让接口测试和缓存结果稳定，建议按 ID 字符串升序返回；发布顺序由前端另行计算。

### 4.2 标记特别关注

```http
PUT /v1/inventory/agent-favorites/char_102_jianyong?account_id=acc_xxx
Authorization: Bearer <JWT>
```

响应：

```json
{
  "status_code": 200,
  "message": null,
  "data": {
    "account_id": "acc_xxx",
    "agent_id": "char_102_jianyong",
    "favorite": true
  }
}
```

该操作必须幂等。重复 PUT 返回成功，数据库中仍只有一行。应使用唯一约束配合事务或数据库原生 upsert，避免并发请求产生重复数据。

### 4.3 取消特别关注

```http
DELETE /v1/inventory/agent-favorites/char_102_jianyong?account_id=acc_xxx
Authorization: Bearer <JWT>
```

响应：

```json
{
  "status_code": 200,
  "message": null,
  "data": {
    "account_id": "acc_xxx",
    "agent_id": "char_102_jianyong",
    "favorite": false
  }
}
```

该操作必须幂等。目标原本不存在时也返回成功。

### 4.4 校验与错误

当前实现沿用库存模块错误包装：

| 场景 | HTTP | 错误码 |
|---|---:|---|
| 未登录或 JWT 失效 | 401 | `unauthorized` |
| 缺少或空 `account_id` | 422 | `schema_validation_failed` |
| 子账号不存在或不属于当前用户 | 404 | `account_not_found` |
| 密探 ID 为空或格式错误 | 422 | `invalid_agent_id` |
| 密探不在后端目录中 | 422 | `unknown_agent` |

推荐密探 ID 格式为 `^char_[0-9]+_[a-z0-9_]+$`。格式校验不能代替目录存在性校验。上线本功能前应确保后端目录与前端目录版本同步，否则新密探可能无法关注或更新库存。

### 4.5 后端目录来源与同步

密探目录计划以上游 `https://maayuan.com/operators.json` 为统一来源。后端需要知道并接入同一来源，因为它需要校验关注和库存请求中的 `agent_id`，并继续维护公开的 `GET /v1/inventory/catalog`。

该 URL 只应作为构建期或显式目录更新任务的数据源，不得成为请求期或应用启动期的强依赖：

1. 通过后端现有构建脚本、管理任务或独立同步命令显式下载；
2. 先下载到临时文件，校验 HTTP 200、JSON 结构、`OPERATORS[]` 非空、ID 格式和 ID 唯一性；
3. 校验通过后生成或替换后端使用的本地目录快照；
4. 保存目录版本、获取时间或内容哈希，便于与前端核对；
5. 下载、解析或校验失败时保留上一份有效快照并使更新任务失败，不得清空线上目录；
6. 普通接口请求只能读取本地快照或数据库，不访问远程 URL；
7. 后端部署不能因远程站点临时不可用而无法启动。

截至本规格编写时（2026-08-18），对该 URL 的实际检查返回 HTTP 404。实施代理必须先重新确认它已能返回预期 JSON；在此之前不能把它设为自动构建或部署的必需步骤。

后端库存逻辑实际只需要可信的密探 ID 集合；`name` 可用于公开目录展示。星级、属性、职业可随同快照保存用于目录能力，但不是关注或库存写入的可变字段。前后端应基于同一份 `operators.json` 生成目录，不能各自维护手写密探列表。

## 5. 密探心纸库存写入

现有交换协议 v2 已允许：

```json
{
  "record_type": "stock_snapshot",
  "entity_type": "agent",
  "snapshot_scope": "full",
  "entries": [
    { "id": "char_102_jianyong", "name": "简雍", "count": 12 }
  ]
}
```

后端应确认而不是另建一套“密探编辑”接口：

- `POST /v1/inventory/import` 能接受 `entity_type=agent` 的 `stock_snapshot`；
- `GET /v1/inventory/current?account_id=...&entity_type=agent` 能返回更新后的数量；
- `full` 快照对该账号的密探实体类型应用完整快照语义；
- `listed` 快照只更新列出的密探；
- 数量仍遵循现有整数范围和非负校验；
- 写入只影响库存投影和流水，不影响目录元数据；
- 不得从客户端提交的名称或额外字段反向更新密探目录。

如果这些能力已经存在，只需补集成测试；如实现与契约不一致，应修复通用库存逻辑，不应增加密探专用库存表或专用库存更新端点。

## 6. 发布顺序约定

“最新发布”排序由前端解析 ID，不需要后端数据库迁移或接口字段：

```js
export function agentReleaseOrder(id) {
  const match = /^char_(\d+)_/.exec(String(id || ''))
  return match ? Number(match[1]) : -1
}
```

排序规则：

1. 数字越大越新；
2. 无法解析的 ID 放在最后；
3. 数字相同或均无法解析时，以完整 ID 做稳定的升序兜底；
4. 目录 ID 一旦发布不得为了调整显示顺序而修改。

## 7. 一致性与安全要求

- Service 层必须先按当前 JWT 用户解析并校验子账号，不能仅凭 `account_id` 直接查询或写入；
- Controller 不接受客户端传入 `user_id`；
- 查询账号 A 不得返回账号 B 的关注项，即使两者属于同一用户；
- 关注写入使用事务和数据库唯一约束保证并发幂等；
- 删除库存子账号必须级联清除其关注项；
- 删除或清理某条库存流水不得影响关注项；
- 关注接口不得改变 `current`、`acquired`、`records` 和 `export` 的结果；
- 关注数据暂不进入交换档案 v2，避免无兼容方案地扩展既有协议。

## 8. 必须覆盖的测试

### Repository / Service

- 新增、重复新增、删除、重复删除均符合幂等语义；
- 两个子账号可对同一密探保存不同关注状态；
- 同一用户切换子账号时列表严格隔离；
- 不同用户不能读取或修改对方子账号；
- 并发关注同一密探只产生一行；
- 删除子账号后关联关注项被清理；
- 未知或非法密探 ID 被拒绝。

### Controller / Integration

- 未登录返回 401；
- 三个接口的 JSON 字段遵循 Jackson `SNAKE_CASE`；
- 成功包装和错误包装与现有库存接口一致；
- GET 返回确定性排序且不重复；
- PUT、DELETE 重试安全。

### 库存回归

- `agent + full stock_snapshot` 能更新密探心纸数量；
- 密探快照不改变物品库存；
- 账号 A 的快照不改变账号 B；
- 请求中的伪造 `name`、`rarity`、`prof`、`sub_prof` 不改变目录；
- 关注或取消关注不新增库存流水，也不改变任何库存数量；
- 现有 item 库存、导入导出和记录重放测试继续通过。

## 9. 上线顺序

1. 同步并部署包含最新密探的后端目录；
2. 执行关注表数据库迁移；
3. 部署后端接口并完成库存回归测试；
4. 部署前端关注与密探库存编辑功能；
5. 观察 401、403、422、唯一约束冲突和导入失败日志。

后端接口应先于前端发布，避免用户点击关注后出现永久失败。迁移本身不改变现有库存数据，可独立回滚应用版本；若需要回滚数据库，应先确认是否允许丢弃已产生的关注偏好。

## 10. 当前交付状态

- 后端接口、Swagger 注解和 Mongo 迁移已经完成；
- 迁移文件：`BackEndV3-Share/scripts/migrations/20260818-inventory-agent-favorites.js`；
- 前后端密探目录已核对为相同的 121 个 ID；
- 自动化测试覆盖关注隔离、幂等、目录只读和 `agent full/listed stock_snapshot`；
- 本地真实 Mongo replica set 已通过 64 次 PUT、并发度 16 的烟测，数据库仅保留一行；
- 前端实施以 [`frontend-handoff-agent-favorites.md`](./frontend-handoff-agent-favorites.md) 为准。
