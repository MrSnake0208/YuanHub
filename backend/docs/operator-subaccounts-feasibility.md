# 密探后端支持"多子账号"可行性研究

> 结论先行：**可以实现，且比库存更简单**。密探后端（协议 6.0/6.1）目前只是设计稿、工作区内没有任何实现代码，因此没有存量数据需要迁移，建议**直接按带子账号维度的 v2 设计落地**，而不是先实现 v1 再升 v2。库存系统已经用 v2 + 迁移脚本走通了一条完整路径，密探只需照搬并剪掉库存特有的部分（增量流水聚合）。

## 1. 库存的"多子账号"是怎么实现的

库存从 v1（每个用户一份数据）升级到 v2（每个用户多个子账号），关键改动：

| 层面 | v1 | v2（现状） |
| ---- | -- | ---------- |
| 账号实体 | 无 | `inventory_accounts`：`(userId, accountId)`、`(userId, name)` 双唯一索引，`accountId` 形如 `acc_<uuid32>`，每用户上限 10 个（`InventoryAccountService.MAX_ACCOUNTS_PER_USER`） |
| 当前库存 | `_id = <user>:<entity_type>` | `_id = <user>:<account>:<entity_type>`，唯一索引 `(userId, accountId, entityType)` |
| 流水/幂等 | 唯一 `(userId, recordId)` | 唯一 `(userId, accountId, recordId)`，幂等范围从"用户级"变为"用户×子账号级" |
| 交换协议 | record 无账号字段 | `version: 2`，record 级新增必填 `account_id`，顶层可选 `accounts: [{id, name}]`（见 `src/test/resources/inventory-exchange-v2.schema.json`） |
| 导入校验 | — | 校验 `account_id` 属于当前用户（`unknown_account_id`）；OpenAPI token 绑定单账号时，文档含其他账号记录返回 `account_scope_mismatch`（`InventoryService.validateAccounts`） |
| API | — | `/v1/inventory/accounts` CRUD；`/current`、`/acquired`、`/records` 携带 `account_id`；`/export` 支持单账号或 `scope=all` 全账号导出 |
| 第三方访问 | token 按用户授权 | token 绑定单个子账号（`OpenApiToken.accountId`），`OpenApiPrincipal(userId, accountId)` 天然限定访问范围 |
| 删除账号 | — | 事务内级联删除 current + records + 相关 token + 账号本体（`InventoryAccountService.delete`） |
| 存量迁移 | — | `scripts/migrations/20260817-inventory-accounts-v2.js`：给有数据的用户建"默认账号"、回填 `accountId`、重写 `_id`、替换 v1 索引、吊销旧的用户级 token |

## 2. 密探照搬的可行性评估

密探与库存的存储骨架几乎同构，差异反而更简单：

| 维度 | 库存 | 密探 |
| ---- | ---- | ---- |
| 状态存储 | `inventory_current`（user × account × entity_type） | `operator_current`（user × account × game） |
| 记录存储 | `inventory_records`（含增量流水） | `operator_records`（纯快照，无增量概念，见 6.0 §1） |
| 聚合统计 | 时段获得量按 `reward_delta` 聚合 | 无时段统计需求（6.0 §6：直接读 current，不扫描历史） |

### 2.1 数据模型改动（最小增量）

1. **账号实体**：新增 `operator_accounts`（或共用账号表，见 §3），结构照抄 `InventoryAccount`：`userId / accountId / name / createdAt / updatedAt`，唯一 `(userId, accountId)` 与 `(userId, name)`，每用户上限 10。
2. **`operator_current`**：`_id` 从 `<user-id>:<game>` 改为 `<user-id>:<account-id>:<game>`（`game` 空时 `<user-id>:<account-id>:*`），唯一索引改 `(userId, accountId, game)`。full/listed 基线规则、通用记录回退逻辑完全不变。
3. **`operator_records`**：唯一索引从 `(userId, recordId)` 改为 `(userId, accountId, recordId)`；历史记录查询索引加 `accountId` 前缀。
4. **`game` 与 `account` 正交**：一个子账号可在如鸢、代号鸢两版本各有养成状态，current 按 `(account, game)` 组合独立存放，互不影响（对应库存的 `(account, entity_type)` 组合）。规模仍是"用户 × 账号数 × 版本数"各一个文档，量级极小。

### 2.2 协议改动（6.1 → v2）

直接复刻库存 v2 的做法：

- `version: 2`；record 级新增必填 `account_id`（复用库存的 `acc_*` 格式与 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` 校验）。
- 顶层可选 `accounts: [{id, name}]`，支持全账号导出时携带账号名。
- 校验规则：`account_id` 必须属于当前用户（`unknown_account_id` 错误）；OpenAPI token 绑定单账号时文档只能含该账号（`account_scope_mismatch`，403）。
- 幂等：`record_id` 的幂等范围变为 `(user, account)`，不同子账号提交相同 `record_id` 互不影响（与库存 v2 语义一致）。
- 新增必填字段属于 major 升级，v1 接收方拒绝 `version: 2`；因密探尚未实现，不存在兼容包袱。

### 2.3 HTTP/API 改动

- 新增 `/v1/operator/accounts` CRUD（创建 / 列表 / 改名 / 删除）；删除时事务级联清除该账号的 `operator_current` 与 `operator_records`。
- `/v1/operator/import`：正文 record 自带 `account_id`（与库存 v2 一致），不再需要"当前选中账号"显式传参。
- `/v1/operator/current`、`/v1/operator/export`：增加 `account_id`；`/export` 支持 `scope=all` 全账号导出（每条 record 标 `account_id`，可整份导入另一平台并还原多账号）。
- OpenAPI token：直接复用现有 `OpenApiToken` + `accountId` 绑定机制（或增加 `operator:*` scope），第三方 token 天然限定在单个子账号内。

### 2.4 验收用例（6.0 §10 的补充项）

1. 不同子账号提交相同 `record_id`：互不影响，各自按首次见到处理。
2. `account_id` 不属于当前用户：返回 `unknown_account_id`，整份拒绝。
3. token 绑定账号 A，导入含账号 B 记录的文档：403 `account_scope_mismatch`。
4. `(account, game)` 的 `full` 快照只替换该组合的 entries，不影响其他账号或其他版本。
5. 删除子账号：其 current / records / 相关 token 全部级联清除，其他账号不受影响。
6. 通用记录（`game` 空）仍按账号回退：具体版本缺失时回退到 `<user>:<account>:*` 的文档。
7. 一份 `scope=all` 导出文件导入另一平台后，多账号与各账号养成状态完整还原。

## 3. 关键设计决策：账号表是否与库存共用

子账号在业务语义上就是"用户的某个游戏登录账号"：库存的 `agent` 记录该账号的角色碎片拥有量，密探记录同一批 `char_xxx` 的养成状态。两者描述的是**同一个研究对象、同一个业务账号**。

- **推荐：共用一张账号表**（把 `inventory_accounts` 泛化为全局账号表，或新建 `operator_accounts` 但复用同一套 `accountId` 命名空间与同一份账号管理 API）。收益：用户在库存页和密探页看到同一批子账号；`scope=all` 导出在两套系统间可用同一个 `account_id` 互相印证（"司马徽碎片有几张、练到多少星"能按账号对上）；库存 v2 迁移时已给现有用户建过"默认账号"，密探可直接复用，无需再建。
- 若各自维护独立账号表，实现最省事（照抄库存代码即可），但会出现同一个游戏账号在库存叫 `acc_x`、在密探叫 `acc_y` 的割裂，前端选择器分裂，跨系统核对困难。
- 中间路径：账号 CRUD 抽成公共服务（`AccountService`），库存与密探共用；表保留 `inventory_accounts` 原名以避免迁移，或更名为 `user_accounts` 并做一次轻量迁移（复用现有迁移脚本模式）。

## 4. 结论与建议

1. 多子账号在密探后端**完全可实现**，实现模式与库存 v2 一一对应，且因无增量流水、无时段聚合，比库存更简单。
2. **建议直接按 v2（带 `account_id`）设计并实现 6.0/6.1**。密探目前没有代码、没有存量数据，没有 v1 兼容负担；若先做 v1 再升 v2，届时需要照抄 `20260817-inventory-accounts-v2.js` 写一份密探迁移脚本（建默认账号、回填、重写 `_id`、换索引、吊销旧 token）。
3. 落地前先定一个产品决策：**子账号是否与库存共用**（§3）。这是唯一影响表结构设计的分叉点；建议共用。
4. 实现顺序建议：账号实体与 CRUD（可抽公共模块）→ `operator_current` / `operator_records` 加 `accountId` 维度 → 协议 v2 校验（`unknown_account_id` / `account_scope_mismatch`）→ OpenAPI token 绑定 → 导出/导入冒烟脚本（参照 `scripts/inventory-smoke.sh`）。
