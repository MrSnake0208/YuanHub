# 子账号统一（库存 × 密探共用子账号，token 按域授权）——已定稿

> 本文回答用户定下的需求：**1 个子账号同时用于库存和密探；token 只声明"有库存还是密探的权限"**。
> 修正了 `operator-subaccounts-implementation-plan.md` 的 D1 决策（"不共用账号表"），回到
> `operator-subaccounts-feasibility.md` §3 推荐的"共用账号表"，并把 token 的"域"从账号表解耦到 scope 本身。
>
> **用户已拍板（2026-08 定稿）**：
> 1. 允许一个 token 同时含库存 + 密探 scopes。
> 2. 新建 `sub_accounts` 统一账号表。
> 3. 账号 CRUD 只留统一 `/v1/accounts`，**不保留** `/v1/inventory/accounts` / `/v1/operator/accounts`（破坏性，前端须切）。
> 4. 删除 = 整账号级联（库存、密探、特别关注数据 + 全部 token 一起删）。

---

## 1. 现状确认

是的，目前完全独立，这是"各自要生成各自 token"的根源：

| 维度 | 库存 | 密探 |
| ---- | ---- | ---- |
| 账号表 | `inventory_accounts` | `operator_accounts`（各自 `(userId,accountId)` / `(userId,name)` 双唯一） |
| 账号 CRUD | `InventoryAccountService`（上限 10） | `OperatorAccountService`（上限 10） |
| 账号归属校验 | `InventoryService`/`InventoryAgentFavoriteService` 查**库存表** | `OperatorService` 查**密探表** |
| token | `OpenApiToken(userId, accountId, kind=INVENTORY)` | `OpenApiToken(..., kind=OPERATOR)` |
| token 生成 | `OpenApiTokenService.generate` 按 scope 判域，**硬拒绝混合域** |
| token 展示 | `list()` 按 `kind` 派发到对应账号表解析账号名 |
| 删除账号 | 只级联库存数据 + `kind=INVENTORY` token | 只级联密探数据 + `kind=OPERATOR` token |

结果：同一游戏账号，要分别在库存和密探各建一个子账号、各发一个 token。

---

## 2. 目标设计

### 2.1 一张 `sub_accounts` 表

```
@Document("sub_accounts")
@CompoundIndexes(
    CompoundIndex(name="idx_sub_user_account_unique", def="{userId:1, accountId:1}", unique=true),
    CompoundIndex(name="idx_sub_user_account_name_unique", def="{userId:1, name:1}", unique=true),
)
data class SubAccount(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,   // 沿用 acc_<uuid32>
    val name: String,        // 用户内唯一
    val createdAt: Instant,
    val updatedAt: Instant,
)
```

- 语义：子账号 = "用户的某个游戏登录账号"，库存、密探、特别关注共用。
- 上限仍 10/用户（`MAX_ACCOUNTS_PER_USER` 不变）。
- **数据集合零改动**：`inventory_current` / `inventory_records` / `operator_current` /
  `operator_records` / `inventory_agent_favorites` 均已按 `(userId, accountId)` 分键，
  account_id 值原样有效，不需要重写 `_id`。

### 2.2 Token：域完全由 scope 决定，允许混合域，`kind` 退役

- Token 绑定 `(userId, accountId)`，account 为共享账号。
- **生成**：只校验 scope 均为已知 key（非空、去重）；**允许** `inventory:*` 与 `operator:*`
  混合在同一个 token。`inventory:*` 只放行 `/open-api/inventory/**`，`operator:*` 只放行
  `/open-api/operator/**`，由 scope 天然隔离，账号表不再参与判域。
- **校验**：`validateAuthorization(token, requiredCode)` 不变（scope 含 requiredCode 即过）。
- **展示**：`list()` 账号名一律从 `sub_accounts` 解析。
- **吊销**：`revokeByAccount(userId, accountId)` 删该账号全部 token（不再按 kind 过滤）。
- `OpenApiToken.kind` 字段：实体保留（避免改存量文档结构），标注 deprecated，**停止读写语义**。
- 错误消息 "scopes 不能同时包含库存与密探权限" 删除。

### 2.3 账号 CRUD：仅统一 `/v1/accounts`（破坏性）

- 新增统一 `SubAccountService` + `AccountController`，端点：

  | 方法 | 路径 | 说明 |
  | ---- | ---- | ---- |
  | POST   | `/v1/accounts`               | 创建（`{name}`），需 JWT |
  | GET    | `/v1/accounts`               | 列表，需 JWT |
  | PATCH  | `/v1/accounts/{accountId}`   | 改名，需 JWT |
  | DELETE | `/v1/accounts/{accountId}`   | 整账号级联删除，需 JWT |

  响应 `SubAccountResponse` = `{id, name, created_at, updated_at}`（沿用现 InventoryAccountResponse 结构，`id = accountId`）。
- **删除**：`InventoryController` 与 `OperatorController` 的 4 个账号端点**全部移除**，
  对应旧服务/仓储删除。
- 库内已无"域"概念：创建任一处即全局可用。
- 删除语义（已确认）：整账号级联 库存 current/records、密探 current/records、
  特别关注、全部 token，再删账号行。

### 2.4 域无关的归属校验

所有 JWT 与 OpenAPI 路径的账号归属校验改查 `SubAccountRepository`：

- `InventoryService.validateAccounts` / `requireAccount`（import/current/acquired/records/deleteRecord）
- `OperatorService.validateAndSort`（import，`unknown_account_id`）/ `export`
- `InventoryAgentFavoriteService.validate`（特别关注）
- OpenAPI 的 `/open-api/{inventory,operator}/account` 的 `requireAccount`

效果：`/v1/operator/current?account_id=acc_xxx` 对库存/统一建的账号直接可用，反之亦然。

---

## 3. 迁移（存量数据）

写 `scripts/migrations/<date>-unify-subaccounts.js`（复用 `20260817-inventory-accounts-v2.js`
的 mongosh 写法；先 dry-run 打印统计，确认后落地）：

1. **建 `sub_accounts` 并合并**两表行，建双唯一索引。
   - `accountId` 碰撞（同一 `acc_*` 在两域各出现）：几乎不可能；万一出现 keep-first + 告警。
   - **同名碰撞**（同一用户库存/密探各建了都叫"大号"且 accountId 不同的两个账号）：两行都保留，
     后到者改名 `大号（密探）`，保证 `(userId,name)` 唯一。文档化。
2. **`open_api_token`**：账号名改查 `sub_accounts` 后旧 token 自动解析成功；**不重写**，
   `kind` 保留但不再参与判定。
3. **数据集合**：`inventory_*` / `operator_*` / `agent_favorites` 的 `accountId` 值全部仍在
   `sub_accounts` 中，**零改写**。
4. **清理**：`sub_accounts` 建索引；旧 `inventory_accounts` / `operator_accounts` 确认无引用后 drop
   （建议先停写、观察一轮再 drop）。

迁移验证基准：迁移前后 `inventory-*` / `operator-*` 数据行数不变（只增账号表，不删数据行）。

---

## 4. 代码改动清单

### 新增
| 文件 | 职责 |
| ---- | ---- |
| `hub/repository/entity/SubAccount.kt` | 统一账号实体（§2.1） |
| `hub/repository/SubAccountRepository.kt` | `countByUserId` / `findByUserIdAndAccountId` / `findAllByUserIdOrderByCreatedAtAsc` / `findAllByUserIdAndAccountIdIn`（**置于 `hub.repository` 顶层包，HubMongoConfig 扫描铁律**） |
| `hub/service/account/SubAccountService.kt` | create/list/rename/delete/requireAccount（含整账号级联删除） |
| `hub/controller/account/AccountController.kt` | 统一 `/v1/accounts` CRUD |
| `hub/controller/account/response/SubAccountResponse.kt` | `{id, name, created_at, updated_at}` |
| `scripts/migrations/<date>-unify-subaccounts.js` | §3 迁移脚本 |

`SubAccountService.delete` 注入：`InventoryCurrentRepository` / `InventoryRecordRepository` /
`InventoryAgentFavoriteRepository` / `OperatorCurrentRepository` / `OperatorRecordRepository` /
`OpenApiTokenService` / `TransactionTemplate`（事务内整账号级联，镜像现两服务的删除逻辑合并）。

### 修改
| 文件 | 改动 |
| ---- | ---- |
| `openapi/OpenApiTokenService.kt` | generate：去混域拒绝、去 kind 判域、单账号表解析账号名；list：账号名全查 `sub_accounts`；revokeByAccount：去 kind 过滤；构造参数 `accountRepository`/`operatorAccountRepository` → `subAccountRepository` |
| `openapi/OpenApiToken.kt` | `kind` 标注 deprecated（保留字段，停用语义） |
| `controller/request/openapi/OpenApiTokenGenerateRequest.kt` | 仅文档注释放宽；allowableValues 6 key 不变 |
| `hub/controller/inventory/InventoryController.kt` | **删除** create/rename/delete/accounts 4 端点；其余（favorites/import/current/export/records/catalog/acquired）保留 |
| `hub/controller/operator/OperatorController.kt` | **删除** create/rename/delete/accounts 4 端点；其余保留 |
| `hub/service/inventory/InventoryService.kt` | 账号校验 `InventoryAccountRepository` → `SubAccountRepository` |
| `hub/service/operator/OperatorService.kt` | 账号校验 `OperatorAccountRepository` → `SubAccountRepository` |
| `hub/service/inventory/InventoryAgentFavoriteService.kt` | `InventoryAccountService.requireAccount` → `SubAccountService.requireAccount` |
| `README.md` | 账号/token 小节改"共享子账号 + 统一 /v1/accounts + token 按 scope 声明域"；本地烟测账号创建路径换 `/v1/accounts` |

### 删除
`InventoryAccount.kt` / `OperatorAccount.kt` / `InventoryAccountRepository.kt` /
`OperatorAccountRepository.kt` / `InventoryAccountService.kt` / `OperatorAccountService.kt` /
`InventoryAccountResponse.kt` / `OperatorAccountResponse.kt` / `InventoryAccountRequest.kt` /
`OperatorAccountRequest.kt`（及依赖它们的测试改用 `SubAccount*`）。

### 测试
- 更新 `OpenApiTokenServiceTest`：单库构造、混合/单域生成、list 统一解析、无 kind 语义。
- 新增 `SubAccountServiceTest` / `AccountControllerContractTest`：跨域互见、整账号级联删除、上限、重名。
- 更新 `InventoryAccountServiceTest` / `OperatorAccountServiceTest` / `InventoryAgentFavoriteSecurityTest`
  （或合并进 SubAccount 测试）：账号相关断言改统一表；favorites 走 `SubAccountService.requireAccount`。
- 回归：`./gradlew test` + `./gradlew ktlintCheck` 全绿；`inventory-smoke.sh`、`operator-smoke.sh` 通过
  （两脚本都用 `/open-api/.../account` 取绑定账号，不受账号 CRUD 改动影响）。

---

## 5. 已定决策（不再讨论）

| # | 决策 | 值 | 影响 |
| -- | ---- | -- | ---- |
| D1 | token 混合域 | **允许**（同一 token 可含 `inventory:*` + `operator:*`） | generate 删混域拒绝；scope 即权限 |
| D2 | 账号表 | 新建 `sub_accounts` | 新增实体/仓储/服务；迁移合并两表 |
| D3 | CRUD 端点 | 仅统一 `/v1/accounts`，**删除** `/v1/inventory/accounts` 与 `/v1/operator/accounts` | 破坏性：前端 YuanHub 必须切到新端点；旧端点不再返回 |
| D4 | 删除语义 | 整账号级联（库存 + 密探 + 特别关注数据 + 全部 token） | SubAccountService.delete 一并级联 |

> 范围外提示（不属本期）：ledger/管路模块、`HubPost` 未来若也需要子账号，可复用同一 `sub_accounts`。

---

## 6. 建议实施顺序

1. `SubAccount` 实体 + 仓储 + `SubAccountService` + 统一 `/v1/accounts` 控制器。
2. `InventoryService` / `OperatorService` / favorites 改统一校验；删除旧账号服务/控制器/仓储。
3. `OpenApiToken`：generate/list/revoke 去 kind 化、单账号表解析、允许混域。
4. 迁移脚本 + dry-run + 实库验证。
5. 测试更新 + 契约测试 + 冒烟回归 + README + `backend-openapi.json` 同步。

## 7. 验收清单

- [ ] 统一建一个子账号，库存与密探两侧均可导入/查询/导出。
- [ ] 一个 token 可同时含 `inventory:*` 与 `operator:*`，分域放行；越域 403。
- [ ] `kind` 不再参与任何判定；旧存量 token 仍可用、账号名正确解析。
- [ ] `GET /v1/accounts` / `/v1/inventory/accounts`、`/v1/operator/accounts` 已移除。
- [ ] 删除共享账号：两域数据 + 特别关注 + 全部 token 级联清除，其他账号不受影响。
- [ ] 迁移前后业务数据行数不变；同名冲突处理后 `(userId,name)` 唯一。
- [ ] `./gradlew test`、`./gradlew ktlintCheck`、两冒烟脚本全绿。
