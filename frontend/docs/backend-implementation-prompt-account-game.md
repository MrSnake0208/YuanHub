# BackEndV3-Share 实施任务：统一子账号游戏版本

状态：可直接投递给 BackEndV3-Share 开发 Agent  
目标仓库：`/home/syoius/BackEndV3-Share`  
前端仓库：`/home/syoius/YuanHub`

## 目标

把游戏版本正式提升为统一子账号的持久化属性，使库存、密探、快捷导入在不同页面、刷新和不同设备上都以同一个账号版本为准。

本任务的产品语义已经确定：

- 一个子账号只属于一个游戏版本；
- 只允许 `代号鸢`、`如鸢`；
- 不存在 `all`、`universal`、空值或“不区分版本”；
- 默认与存量迁移值都是 `代号鸢`；
- `代号鸢` 对应完整密探目录，`如鸢` 对应适用子集。

不要重新引入 `game_scope` 或三态模型。

## 开始前阅读

- `/home/syoius/BackEndV3-Share/AGENTS.md`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/SubAccount.kt`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/account/request/AccountRequest.kt`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/account/response/SubAccountResponse.kt`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/account/AccountController.kt`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/account/SubAccountService.kt`
- `/home/syoius/YuanHub/docs/api-contract.md`
- `/home/syoius/YuanHub/docs/operator-page-product-design.md`

## API 契约

### 创建

```http
POST /v1/accounts
Content-Type: application/json

{
  "name": "大号",
  "game": "如鸢"
}
```

响应：

```json
{
  "id": "acc_xxx",
  "name": "大号",
  "game": "如鸢",
  "created_at": "2026-08-21T00:00:00Z",
  "updated_at": "2026-08-21T00:00:00Z"
}
```

为兼容尚未升级的客户端，创建请求缺少 `game` 时按 `代号鸢` 保存。

### 列表

```http
GET /v1/accounts
```

每个账号对象必须稳定返回非空 `game`。

### 局部修改

```http
PATCH /v1/accounts/{accountId}
Content-Type: application/json

{ "game": "代号鸢" }
```

PATCH 必须支持真正的局部更新：

- `{ "name": "新名称" }`：只改名；
- `{ "game": "如鸢" }`：只改版本；
- `{ "name": "新名称", "game": "如鸢" }`：同时修改；
- 两个字段都缺失：422 `schema_validation_failed`。

非法版本统一返回：

```json
{
  "error": {
    "code": "invalid_game",
    "message": "game 只允许 代号鸢 或 如鸢"
  }
}
```

HTTP 状态为 422。账号不存在和越权继续沿用现有 `account_not_found` 行为。

## 后端实现范围

1. `SubAccount`
   - 新增非空 `game: String = "代号鸢"`；
   - Mongo 字段名为 `game`；
   - 不新增索引，版本不参与账号唯一性。

2. 请求 DTO
   - 将创建和 PATCH DTO 拆开，避免 PATCH 只改版本时仍被 `name @NotBlank` 拦截；
   - 创建 DTO：`name` 必填，`game` 可缺省且默认代号鸢；
   - PATCH DTO：`name`、`game` 都可选，由服务层校验至少一个存在；
   - name 仍维持 1..64、非空白规则。

3. `SubAccountResponse`
   - 新增 `game`，由全局 SNAKE_CASE 配置按原样输出；
   - `POST / GET / PATCH` 三处响应一致。

4. `SubAccountService`
   - 创建时规范化并校验 game；
   - PATCH 在一个保存动作内合并 name/game，并只更新实际提供的字段；
   - 版本修改不改 `accountId`，不迁移、不删除库存或密探记录；
   - `updatedAt` 在成功修改后刷新。

5. `AccountController`
   - POST 使用创建 DTO；
   - PATCH 使用局部更新 DTO，操作说明改为“修改子账号”；
   - GET/DELETE 路径不变。

6. 迁移
   - 新增 `scripts/migrations/20260821-sub-account-game.js`；
   - 默认先 dry-run，打印缺失、非法、已合法三类数量；
   - APPLY 后将 `sub_accounts` 中 game 缺失、null、空串或非法值统一设为 `代号鸢`，并刷新 `updatedAt`；
   - 不触碰 inventory/operator 业务集合，不创建新索引；
   - 脚本可重复执行，第二次应无待修改数据。

## 与密探接口的关系

当前前端仍会把账号 `game` 显式传给 `/v1/operator/current` 和导入记录的 `game`，因此本任务不要求删除这些既有字段。

后端应补一层一致性校验：处理密探写入时，记录的非空 `game` 必须等于所属账号的 `game`；不一致返回 422 `account_game_mismatch`。旧的 `game: null` 记录读取兼容逻辑可以保留，但新写入不再产生通用记录。

版本修改不自动搬迁既有 operator 记录。修改后只展示新账号版本对应的数据；切回原版本时原数据仍可恢复读取。

## 必须补充的测试

### `SubAccountServiceTest`

- 创建时保存并返回如鸢；
- 创建缺少 game 时默认代号鸢；
- list 稳定返回 game；
- PATCH 只改 game 时保留 name/accountId/createdAt；
- PATCH 只改 name 时保留 game；
- 非法 game 返回 422 `invalid_game`；
- 空 PATCH 返回 422；
- 删除级联测试保持通过。

### `AccountControllerContractTest`

- POST `{name,game}` 的响应包含 `data.game`；
- POST 仅 `{name}` 返回 `代号鸢`；
- GET 列表项包含 game；
- PATCH `{game}` 可成功且不要求 name；
- PATCH 非法 game 返回 422 `invalid_game`；
- PATCH 空对象返回 422。

### 密探服务测试

- 账号如鸢 + 写入如鸢成功；
- 账号如鸢 + 写入代号鸢返回 `account_game_mismatch`；
- 新写入不得落成 generic/null game。

## 文档

更新 BackEndV3-Share 的 README/OpenAPI 示例，账号对象统一展示 `game`。不要再声明账号响应与旧 DTO 完全同构。

## 验收命令

在后端仓库按其 README/AGENTS 运行既有格式化与测试，至少覆盖：

```bash
./gradlew test --tests '*SubAccountServiceTest' --tests '*AccountControllerContractTest'
```

如果密探一致性校验落在独立测试类，同时运行对应 `OperatorService` 测试。

## 完成定义

- 新建、列表、修改账号都返回 `game`；
- 存量账号迁移后均为合法二选一；
- 版本修改按 userId + accountId 做归属校验；
- 新密探写入不能绕过账号版本；
- 原账号数量限制、重名冲突、删除级联、OpenAPI Token 绑定行为不回归；
- 前端不再需要依赖浏览器本地映射实现跨设备同步。
