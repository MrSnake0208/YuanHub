# 招募档案 API

状态：备份与恢复正式支持，全部私有操作需 JWT、账号所有权和当前 Beta 资格。没有招募 OpenAPI Token Scope，不能用连接码调用下列私有接口。

## 公共目录

`GET /v1/recruitment/catalog?game=<GAME>`：无需认证，`game` 是 `如鸢` 或 `代号鸢`。返回普通 `ApiResult.data` 卡池目录。目录用于引用现有公共池，不接受备份创建公共池。

```bash
curl --fail-with-body --get --data-urlencode 'game=如鸢' \
  "$BASE_URL/v1/recruitment/catalog"
```

## 备份与恢复

公共目录及卡池快照的 `allow_cumulative_choice` 默认 `false`，由管理员按池配置；目录写入时省略保留原值，目录 JSON 导入省略为 `false`，显式值必须为布尔值。

个人卡池的 `cumulative_choice_agent_ids` 按顺序记录 300/600/900 档的累抽自选，固定最多 3 位；数组紧凑且允许重复选择同一密探，每个 ID 须为当前游戏绝密（rarity 5）。`pool_records_save.data` 省略该字段或传 `null` 时不修改，`[]` 全部清除，非空数组整体替换；超过 3 位返回「累抽自选最多3位」，不接受空字符串元素。目录关闭后，编辑保存只允许保持不变或删除任意位：新列表必须是原列表的子序列，保留顺序且重复元素按次数匹配，不能新增、替换或重排；不符合时返回「该卡池未开放累抽自选」。旧字段传 `""` 删除首位也允许。备份导入仍只允许空列表或与该池已有列表完全相同的列表。此标记不生成抽卡事件，不影响任何统计或 UP 状态。

兼容字段 `cumulative_choice_agent_id` 仍接受：省略或 `null` 不修改，非空字符串替换列表第一位（空列表则新增第一位），`""` 移除第一位并使后续选择前移。两个字段同时提供且数组非 `null` 时以数组为准，旧字段须省略、为 `null` 或等于数组第一位，否则拒绝；空数组对应的旧字段只能省略或为 `null`。个人卡池响应与备份导出同时返回归一化数组和等于第一位的兼容字段（空数组对应 `null`）；旧数据在新列表为空且旧字段非空时读作单元素列表，无需迁移。

编辑器不按已知总抽数控制自选位显示。开关开启时显示 `min(3, 已选数量 + 1)` 个位置，即已选位置及下一个档位的空位，最多 3 个；关闭时只显示已有选择供清除。真实布局与交互需手动验收：在 390px 手机和桌面打开卡池编辑器，检查多档位选择、清除后前移、保存重开及快捷按钮换行。

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
