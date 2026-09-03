# YuanStar 星石库存后端需求

状态：前端 PR #4 已接入，后端能力尚未实现

目标仓库：`BackEndV3-Share`

关联前端：

- `src/api/starInventory.js`
- `src/pages/star/hostStarInventorySync.js`
- `src/pages/star/index.vue`

## 1. 交付边界

YuanHub 的 `/star` 页面把 YuanStar 作为嵌入式产品运行。OCR 和人工核对在浏览器本地完成，登录后用户可以点击“同步背包”将当前快照写入 YuanHub。

当前前端行为：

- 页面启动和账号切换使用 YuanStar 自己的本地存储；
- 点击“同步背包”才调用后端写接口；
- 同步前只允许当前 YuanHub 子账号与 YuanStar 工作区账号一致；
- 当前页面没有自动调用 GET 接口进行云端回填，GET 是为后续跨设备恢复和显式刷新保留的接口；
- 前端不会发送 `user_id`，用户身份必须从 JWT 获取。

本需求只覆盖“当前星石库存快照”，不覆盖：历史版本、OCR 原图、识别任务、养成计划、经验星曜规则、星石交易或库存扣减。

## 2. API

两个接口都需要登录，并使用当前用户的 JWT：

```http
GET /v1/star-inventory/current?account_id={accountId}
PUT /v1/star-inventory/current?account_id={accountId}
Authorization: Bearer <access-token>
Content-Type: application/json
```

`account_id` 必填，按现有 `/v1/accounts` 约定校验长度和格式，并确认该账号属于 JWT 对应用户。不能只按 `account_id` 查询，否则会产生跨用户读取或覆盖。

### 2.1 PUT 请求

前端当前发送完整快照，每次 PUT 都表示替换该账号的当前快照：

```json
{
  "effective_at": "2026-08-31T10:00:00.000Z",
  "entries": [
    {
      "instance_id": "main-1",
      "kind": "main",
      "name": "天府",
      "quality": "orange",
      "level": 60
    },
    {
      "instance_id": "support-1",
      "kind": "support",
      "name": "文曲",
      "quality": "white",
      "level": 1
    }
  ]
}
```

字段约束：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `effective_at` | ISO-8601 字符串 | 必填，可解析为带时区的时间 |
| `entries` | 数组 | 必填，可为空；服务端设置明确的最大条目数 |
| `instance_id` | 字符串 | 必填；同一快照内唯一；长度和字符集按服务端 DTO 限制 |
| `kind` | 枚举 | 仅 `main` 或 `support` |
| `name` | 字符串 | 必填；去除首尾空白后不能为空 |
| `quality` | 枚举 | 仅 `orange`、`purple`、`blue`、`green`、`white` |
| `level` | 整数 | 非负；上限按 YuanStar 规则校验 |

建议后端拒绝未知字段、重复 `instance_id`、非法枚举、过大 payload 和不合法时间，而不是静默修正后保存。保存前将请求规范化为只包含上述字段，避免把前端内部字段（例如 `targetLevel`）持久化。

### 2.2 GET 响应

存在快照时返回：

```json
{
  "status_code": 200,
  "message": "success",
  "data": {
    "account_id": "acc_123",
    "effective_at": "2026-08-31T10:00:00.000Z",
    "entries": [
      {
        "instance_id": "main-1",
        "kind": "main",
        "name": "天府",
        "quality": "orange",
        "level": 60
      }
    ],
    "revision": 3,
    "updated_at": "2026-08-31T10:00:02.000Z"
  }
}
```

没有快照时统一返回 HTTP 200，`data` 返回 `account_id`、空 `entries` 和 `null` 的 `effective_at`、`revision`、`updated_at`。前端 `request.js` 会把 404 当作异常，因此不要用 404 表示正常的“尚未同步”。

PUT 成功使用相同的 `ApiResult` envelope，并返回保存后的完整快照。该格式与 YuanHub `src/api/request.js` 的成功解包逻辑一致。

## 3. 账号、安全与错误

Controller 应复用现有 `AuthenticationHelper.requireUserId()` 和子账号服务的归属校验。错误响应继续使用项目统一的 `status_code`、`message`、`data`/`error` 结构，不接受请求体内的用户身份。

至少区分以下错误：

| 场景 | HTTP | 建议 code |
| --- | ---: | --- |
| 未认证或 token 无效 | 401 | `unauthorized` |
| 账号不存在或不属于当前用户 | 404 | `account_not_found` |
| 快照字段、枚举、大小或条目重复 | 422 | `star_inventory_invalid_snapshot` |
| 新快照早于已保存快照 | 409 | `star_inventory_stale_snapshot` |
| 并发版本不一致（启用条件请求后） | 409 | `star_inventory_revision_conflict` |

不要用 403 暴露“账号存在但属于其他用户”的信息；在当前用户视角统一按账号不存在处理，遵循现有账号私有数据接口的安全边界。

## 4. 写入语义与并发

MVP 使用完整快照替换：一次 PUT 在一个数据库事务/原子写操作内替换 `entries`、`effective_at` 和派生元数据，不做条目级 merge。空数组是合法快照，表示用户确认当前没有条目；缺失 `entries` 则必须拒绝。

保存记录建议包含：

- `user_id`：从 JWT 得到；
- `account_id`：从已归属校验的 query 参数得到；
- `effective_at`：客户端快照时间；
- `entries`：服务端校验并规范化后的数组；
- `revision`：服务端递增版本；
- `content_hash`：规范化快照的 hash，用于重复写幂等；
- `updated_at` / `received_at`：服务端时间。

同一内容重复 PUT 应是幂等操作。为防止旧浏览器或乱序请求覆盖新数据：

1. 相同 `content_hash` 直接返回当前记录，不新增版本；
2. 新内容的 `effective_at` 早于当前记录时返回 409，不覆盖当前记录；
3. `effective_at` 相同时但内容不同，按并发冲突返回 409；
4. 后续若前端需要更强的并发控制，增加 `If-Match` 或 `expected_revision`，不要把客户端版本作为唯一可信依据。

`effective_at` 由浏览器产生，不能用于鉴权、审计排序或安全决策；服务端时间必须单独保存。

## 5. 存储建议

建议在 MongoDB 中建立独立的当前快照集合，例如 `star_inventory_current`，每个“用户 + 子账号”最多一条记录：

```text
unique(user_id, account_id)
index(user_id, updated_at)
```

不要把星石条目混入现有普通 `inventory_current`，两者的实体语义不同：普通库存是可聚合物品，星石快照是 YuanStar 识别后的带实例关系数据。也不要保存 OCR 图片或未经校验的前端内部字段。

写入时先校验账号归属和请求 DTO，再执行单文档 upsert/替换；索引创建和旧数据迁移应可重复执行。第一版没有历史需求，不需要额外历史表。

## 6. 测试验收

后端至少补充：

- Controller 合同测试：路径、HTTP method、JWT、必填 `account_id`、ApiResult 响应；
- 账号隔离测试：用户 A 不能读写用户 B 的账号；未知账号不泄露存在性；
- DTO 校验测试：空时间、非法时间、空/超量条目、重复 ID、非法 `kind`/`quality`/`level`；
- Service 测试：首次写入、空快照、完整替换、GET 读取、无快照、规范化和响应字段；
- 幂等和并发测试：相同 hash 不新增版本，旧时间和相同时间不同内容不能覆盖新数据；
- Repository 测试：唯一键按 `user_id + account_id` 生效，多个账号互不影响；
- 前后端联调：使用 PR #4 的真实 PUT body，确认 `/star` 页面点击“同步背包”显示成功。

## 7. 上线顺序

1. 后端先加入 DTO、归属校验、集合索引、GET/PUT Controller 和测试。
2. 在测试环境使用真实 JWT 与账号执行空快照、单条、多条、重复写和旧快照场景。
3. 后端部署后再启用前端“同步背包”的正式验证；当前前端已经合入，但后端未部署时该按钮会失败，这是预期的外部依赖，不应通过前端吞掉错误。
4. 后续如需跨设备自动恢复，再增加前端显式 GET、云端与本地 revision 冲突提示和用户选择覆盖策略。

## 8. 当前缺口

截至 PR #4 合并时，`BackEndV3-Share` 尚无上述 Controller、Service、Repository 或数据库模型。完成本文件不代表后端能力已上线；后端实现完成并通过本节验收前，YuanHub 星石云同步只能作为待接入功能使用。
