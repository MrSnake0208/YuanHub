# 招募档案 API

状态：备份与恢复正式支持，全部私有操作需 JWT、账号所有权和当前 Beta 资格。没有招募 OpenAPI Token Scope，不能用连接码调用下列私有接口。

## 公共目录

`GET /v1/recruitment/catalog?game=<GAME>`：无需认证，`game` 是 `如鸢` 或 `代号鸢`。返回普通 `ApiResult.data` 卡池目录。目录用于引用现有公共池，不接受备份创建公共池。

```bash
curl --fail-with-body --get --data-urlencode 'game=如鸢' \
  "$BASE_URL/v1/recruitment/catalog"
```

## 备份与恢复

| 方法与路径 | 认证 / Scope | 参数 / 请求 | 成功 data |
|---|---|---|---|
| `GET /v1/recruitment/export` | JWT / 无 Token Scope | 必填 `account_id` | 完整 `yuanhub.recruitment.v1` 对象 |
| `POST /v1/recruitment/import/preview` | JWT / 无 Token Scope | `{account_id,document,options?}` | preview_token、document_hash、target_revision、expires_at、items、stats、risks、can_commit 等 |
| `POST /v1/recruitment/import/commit` | JWT / 无 Token Scope | 原预览体加 preview_token、document_hash、expected_revision、request_id | `{archive_revision,event_ids,pool_id,agent_id,batch_id}` |

export 与库存/密探不同，有 `data` 包装。保存备份时提取 `data`；不要将整个 ApiResult 作为协议文件。

```bash
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  --get --data-urlencode 'account_id=REPLACE_WITH_OWNED_ACCOUNT_ID' \
  "$BASE_URL/v1/recruitment/export"
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  -H 'Content-Type: application/json' --data-binary @recruitment-preview-request.json \
  "$BASE_URL/v1/recruitment/import/preview"
```

preview 请求中的 `document` 是[备份 V1](./recruitment-v1.md)对象。`options.state_strategy` 默认 `keep_current`，也可为 `use_backup`；`confirm_count_change` 默认 false。预览返回当前、备份及候选已知总抽数，必须向用户展示真实差异；修改文件或选项需要重新预览。

preview token 绑定用户、目标账号、文档、选项和 revision，有效十分钟；服务重启或淘汰后需重新预览，当前不跨实例共享。commit 的 `expected_revision` 使用 `target_revision`，`request_id` 是本次操作的稳定幂等 ID。只在 `can_commit=true` 且用户确认风险后提交。

## 错误与恢复

401 未登录；403 Beta 限制；404 无账号或无权访问；409 revision/预览过期/预览不匹配/同 request_id 不同正文；422 Schema、目录、游戏、引用、文件超过上限等语义不合法。

提交结果未知时使用完全相同正文和 request_id 重试；成功请求即使预览过期或服务重启也可读取持久化结果。409 保留草稿、读取当前状态并重新预览。恢复不会覆盖删除目标独有记录，也不自动判断两个文件是否描述同一段现实抽卡历史。
