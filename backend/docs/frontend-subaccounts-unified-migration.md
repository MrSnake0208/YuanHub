# 前端迁移说明：子账号统一（库存 × 密探共用） + Token 按 scope 授权

> 面向对象：YuanHub 前端（或任何调用本后端 API 的客户端）。
> 本文只讲**前端需要知道的改动**；后端实现见 `docs/subaccounts-unify-inventory-operator-plan.md`。

---

## 0. 一句话总结

- 库存子账号和密探子账号**合并成一套"统一子账号"**：一个子账号 = 一个游戏账号，库存、密探、特别关注全共用。
- Token 不再分"库存 token / 密探 token"：token 绑定**这个共享子账号**，它**有哪些权限（库存还是密探）由 scopes 声明**，甚至可同时有。
- **账号 CRUD 只保留 `/v1/accounts`**，旧的 `/v1/inventory/accounts`、`/v1/operator/accounts` 已删除（后端返回 404）。

---

## 1. 需要改的点（清单）

| # | 改动 | 严重度 | 说明 |
| -- | ---- | ------ | ---- |
| 1 | 账号管理接口换成 `/v1/accounts` | **破坏性** | 创建/列表/改名/删除全部搬到这里 |
| 2 | 库存页与密探页共用一个账号列表 | 中 | 两个模块看到同一批子账号，不再各自维护 |
| 3 | 删除子账号 = 整账号级联删除 | **破坏性（语义）** | 会同时删掉库存、密探、特别关注数据与全部 token，前端提示文案要改 |
| 4 | Token 页账号选择改为统一账号 | 中 | 一个下拉即可，不再按"库存/密探"分账套 |
| 5 | Token scope 可同时勾选库存+密探 | 低 | 交互上放开；不放开也不破坏 |
| 6 | `kind`/域标记不再有意义 | 低 | 前端若展示"库存Token/密探Token"标签，需改由 scopes 推导 |

---

## 2. 账号 CRUD（最重要的改动）

### 2.1 已删除的接口（不再存在，返回 404）

```
POST   /v1/inventory/accounts           ← 删除
GET    /v1/inventory/accounts           ← 删除
PATCH  /v1/inventory/accounts/{id}      ← 删除
DELETE /v1/inventory/accounts/{id}      ← 删除

POST   /v1/operator/accounts            ← 删除
GET    /v1/operator/accounts            ← 删除
PATCH  /v1/operator/accounts/{id}       ← 删除
DELETE /v1/operator/accounts/{id}       ← 删除
```

### 2.2 新接口（统一子账号）

| 方法 | 路径 | 请求体 | 说明 |
| ---- | ---- | ------ | ---- |
| POST   | `/v1/accounts`             | `{"name": "大号"}` | 创建（需登录） |
| GET    | `/v1/accounts`             | —                  | 列表（按创建时间升序） |
| PATCH  | `/v1/accounts/{accountId}` | `{"name": "改名"}` | 改名 |
| DELETE | `/v1/accounts/{accountId}` | —                  | **整账号级联删除** |

响应元素（与旧 `InventoryAccountResponse` / `OperatorAccountResponse` **完全同构**，前端无需改解析）：

```json
{
  "id": "acc_0123...",
  "name": "大号",
  "created_at": "2026-08-19T00:00:00Z",
  "updated_at": "2026-08-19T00:00:00Z"
}
```

> `id` 就是 `account_id`，全站继续用这个值传 `account_id` 参数，**不需要任何 id 迁移**。

### 2.3 前端要做的事

- 库存页、密探页的"子账号选择器/列表"统一改为调 **`GET /v1/accounts`**，两份 UI 用同一次数据。
- 任何一处创建子账号，两个页面都应能看到。
- 删除按钮文案：
  - ❌ 旧："删除后该库存/密探子账号不可再用"
  - ✅ 新："**删除该子账号会同时清除它的库存数据、密探数据、特别关注和所有 API Token**，操作不可恢复"
  - 建议删除前弹确认框。

---

## 3. Token（第三方 API Token）页

### 3.1 不变的部分

- 生成接口 `POST /user/open-api/token`：请求体 `{account_id, scopes, remark}` 不变。
- scope 枚举仍是 6 个：`inventory:read / inventory:write / inventory:export / operator:read / operator:write / operator:export`。
- 列表 `GET /user/open-api/tokens`、删除 `DELETE /user/open-api/tokens/{token_id}` 不变，返回结构不变（`token_id / account_id / account_name / scopes / remark / created_at`）。

### 3.2 变的部分

1. **account_id 选择**：从「先选库存还是密探 → 再选对应账号」改成**一个统一账号下拉**（数据来自 `GET /v1/accounts`）。
2. **scopes 可跨域**：可以同时勾 `inventory:read` 和 `operator:read` 生成"一个 token 通吃两域"；也可以只勾一个域（行为等同旧款单域 token）。
3. **不要再用 `kind` / 账号前缀猜域**：后端已去掉按账号分域，token 到底能访问什么**完全看 scopes**。前端若要给 token 打标签（"库存"/"密探"），请根据 `scopes` 推导：
   - 全为 `inventory:*` → 只有库存权限
   - 全为 `operator:*` → 只有密探权限
   - 两者都有 → 双域

### 3.3 示例

```jsonc
// 生成一个同时有库存读 + 密探读的 token
POST /user/open-api/token
{ "account_id": "acc_0123...", "scopes": ["inventory:read", "operator:read"], "remark": "双域只读" }
```

---

## 4. 库存 / 密探业务接口（基本不用改）

这些接口的路径、请求体、响应、鉴权方式**全部不变**，只是账号归属校验改成了统一子账号表：

- 库存：`/v1/inventory/import|current|acquired|records|export`、`/v1/inventory/agent-favorites**`（特别关注）
- 密探：`/v1/operator/import|current|records|export`、`/v1/operator/catalog`（公开）
- 第三方：`/open-api/inventory/**`、`/open-api/operator/**`

要点：

- 所有 `account_id` 参数继续用 `acc_*` 值，**无格式/语义变化**。
- `/open-api/inventory/account` 与 `/open-api/operator/account` 仍可用，返回 `{id, name, created_at, updated_at}`（结构不变），只是账号来自统一表。
- **特别关注**（`/v1/inventory/agent-favorites`）未变化；它现在绑定共享账号，跟随账号级联删除。

---

## 5. 历史账号合并带来的页面表现（后端迁移后）

迁移合表时会遇到一种真实情况：某用户曾在库存和密探里**各建过一个同名账号**（如都叫"大号"，但 `acc_*` 不同）。
迁移后这两个会变成两个统一子账号，其中后到者改名"**大号（密探）**"。前端不需要特殊处理，正常展示即可；
用户看到两个"大号/大号（密探）"是历史数据现状，可自行删除/改名清理。

---

## 6. 验收清单（前端侧）

- [ ] 库存页和密探页都能从 `GET /v1/accounts` 拉到同一批子账号。
- [ ] 在任一页创建子账号，另一个页面刷新后可见、可直接选作 `account_id`。
- [ ] 旧地址 `/v1/inventory/accounts`、`/v1/operator/accounts` 不再被调用（全部换成 `/v1/accounts`）。
- [ ] Token 页能对一个统一账号生成：仅库存 scope / 仅密探 scope / 混合 scope 三种 token，均成功。
- [ ] 删除子账号前有"会同时清空库存+密探+特别关注+Token"的确认提示。
- [ ] 通过 `GET /user/open-api/tokens` 拿到的 `scopes` 能正确驱动前端"库存Token/密探Token/双域Token"标签。
- [ ] 线上联调冒烟：`scripts/inventory-smoke.sh` 的路径（`/open-api/inventory/account` 等）仍可直接跑通。


## 7. 活动订阅的账号生命周期（2026-10-05）

存在任意本期订阅历史（包括已取消且保留进度的记录）时，修改账号game返回409 `activity_calendar_game_locked`，需要使用另一游戏账号；同游戏改名不受影响。删除账号在既有事务中同时清理活跃/已取消订阅及个人关卡进度，失败整体回滚。前端账号删除确认同步说明订阅和进度也会清除；订阅页沿用当前账号，不向URL写入account_id。接口及验证见[活动日历说明](activity-calendar.md)。
