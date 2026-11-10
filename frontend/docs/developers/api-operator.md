# 密探及养成 API

第一次为第三方应用接入？从[第三方应用密探数据接入指南](/developers/use-cases/operator-read)开始，先用自己的测试账号调试，再为每位应用用户分别连接，并复制完整集成需求给 AI。

状态：Token 受限扫描正式支持，旧 V2 兼容保留；完整 V5 备份使用站内 JWT。版本与字段说明见[密探 V5](../operator-growth-data-exchange-protocol-v5.md)及其继承的[V4](../operator-growth-data-exchange-protocol-v4.md)、[V3](../operator-growth-data-exchange-protocol-v3.md)。

## 公开扫描目录

`GET /open-api/operator/catalog` 无需 Token 或 Beta 资格，返回顶层 `OPERATORS`、`PROFESSIONS`、`catalog_schema_version`、`catalog_version`，无 `data` 包装。支持强 ETag 与 `If-None-Match → 304`；数据库或组装失败返回真实 HTTP 503。完整字段、顺序及别名规则见[公共目录交换规范](../exchange-specs/catalogs.md#3-maayuan-完整扫描目录)。

## Token 读取和旧版兼容

使用 `Authorization: Bearer <OPENAPI_TOKEN>`，不传账号 query。

| 方法与路径 | Scope | 参数 / 请求 | 成功响应 |
|---|---|---|---|
| `GET /open-api/operator/account` | 有效 Token | 无 | `ApiResult.data` 绑定账号 |
| `GET /open-api/operator/current` | `operator:read` | 可选 `game` | `ApiResult.data` 当前密探档案数组 |
| `GET /open-api/operator/annotations` | `operator:read` | 无 | `ApiResult.data` 养成状态标注 |
| `POST /open-api/operator/import` | `operator:write` | 原始密探 V2 JSON | `ApiResult.data` 导入统计 |
| `GET /open-api/operator/export` | `operator:export` | 无版本参数 | 原始密探 V2，无 data 包装 |

`current` 是当前档案读取 DTO，不是可原样导入的完整交换备份。读取 annotation 不代表允许写 annotation。V2 export 的 `X-Operator-Exchange-Warning` 提醒独立化极与突破信息损失；给它追加 `version=5` 不会获得 V5。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/current"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/annotations"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/export" -o operator-v2.json
```

## 公共密探目录

`GET /v1/operator/catalog` 无需 Token。当前 HTTP 响应使用 `ApiResult` 包装，密探列表位于 `data.operators` 数组，按每项 `id` / `name` 为当前档案补充名称；目录加载失败或 ID 未找到时保留原始 ID。当前目录 DTO 的列表字段是 `operators`，不要将旧交换规范示例中的 `entries` 直接当作 HTTP 目录字段，也不要与 `/open-api/operator/current` 的 `data[].entries` 映射混淆。

## Token 自动采集

| 方法与路径 | Scope | 请求 | 成功 data |
|---|---|---|---|
| `POST /open-api/operator/scan-import/preview` | `operator:scan:write` | 原始 V3/V4/V5 文档 | `myshare-operator-import-preview@1`，逐项差异、状态和 warnings |
| `POST /open-api/operator/scan-import/commit` | `operator:scan:write` | 相同原始文档 | 逐项提交统计、结果和 warnings |

只接受一个来源账号、`operator_snapshot`、`source_kind=scan`、`snapshot_scope=listed`。来源 ID 可以是本地引用，服务端强制映射到绑定账号。不能提交浏览器 `document/account_mapping/confirm_review` 包装体，不能通过扫描写主观 annotation、manual 攻生或展示偏好，不扣库存。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @operator-scan-v5.json \
  "$BASE_URL/open-api/operator/scan-import/preview"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @operator-scan-v5.json \
  "$BASE_URL/open-api/operator/scan-import/commit"
```

先检查 preview 的逐项结果，再提交原始文件；preview 不提供绕过后续校验的授权。`review/unavailable` 分区不等于可靠采集；一次请求成功不代表所有分区均写入。缺少突破或未知化极不能从等级或旧31猜测。

## JWT 完整备份与恢复

要求普通 JWT、账号归属和当前 Beta 资格。完整备份使用 V5，服务端 export 默认仍为 V2。

| 方法与路径 | 参数 / 请求 | 成功响应 |
|---|---|---|
| `GET /v1/operator/export` | `account_id` 或 `scope=all`；`version=2|3|4|5` | 原始所选版本 JSON |
| `POST /v1/operator/import/preview` | 原始 V3/V4/V5 或下述包装 | `ApiResult.data` 预览 |
| `POST /v1/operator/import` | 旧 V2，或原始/包装 V3/V4/V5 | `ApiResult.data` 提交结果 |

```json
{
  "document": "REPLACE_WITH_V5_DOCUMENT_OBJECT",
  "account_mapping": {"SOURCE_ACCOUNT_ID":"REPLACE_WITH_OWNED_ACCOUNT_ID"},
  "confirm_review": false
}
```

这是包装结构示意，`document` 实际必须是对象，不能直接发送占位字符串。映射目标必须归当前用户，复核后才使用 `confirm_review=true`。密探 preview/commit 不使用招募协议的 `preview_token`。

```bash
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  --get --data-urlencode 'account_id=REPLACE_WITH_OWNED_ACCOUNT_ID' \
  --data-urlencode 'version=5' "$BASE_URL/v1/operator/export" -o operator-v5.json
```

## 错误

401 凭据无效；403 Scope/Beta/账号边界；404 账号不存在；409 幂等或 revision 冲突；422 结构、目录、账号映射、化极/突破/分区语义错误。查看领域 `error.code`、`operator_id`、`field_path`，并检查返回项的 rejected/review/partial 状态。完整快照可能重置未列出客观或主观内容，绝不能用残缺采集伪装完整备份。

## 站内登录面板计算

新增 `POST /v1/operator/panel/preview` 和 `/current`，使用站内 JWT，不是 OpenAPI Token 接口。前者接收本人账号、密探养成和本人星石实例草稿；后者最多100个不同密探ID。只返回最终攻击/生命、状态、缺失字段和规则版本，禁止客户端系数。面板计算由后端执行，客户端不包含计算规则。公开分享在已授权条目中附加 `panel`，不开放匿名任意输入计算。


### 觉醒默认值（2026-10-22）

觉醒是五星后的可选阶段。面板请求中 `huaji.awakened` 省略、null 或 false 均按未觉醒计算；只有 true 叠加觉醒加成。前端仅在五星显示可选开关，默认关闭，不要求用户确认未觉醒。普通 stage25 和 SP 的第5星对应同一前置阶段。

已确认觉醒（含旧 starLevel31）的有效阶段为五星；前端降星会清除觉醒，后端拒绝明确的低星+觉醒组合。PATCH 省略字段仍表示保留已有记录，不能据此清除已经保存的觉醒。此次不需要重导私有规则或迁移用户数据库。


## 独立作业匹配连接（多子账号，只读）

个人中心「应用与数据连接 → MaaYuan 作业匹配」卡片可添加独立连接；已有连接可直接复制连接码、访问作业站或停止连接。复制失败时提供手动复制，首次加载失败时可重新加载。每个用户只有一个有效连接码，重复创建返回原码；历史多个连接仅保留最早创建的码有效，其余新码失效，停止连接会一并删除历史重复记录，防止旧码重新生效。并发首次创建通过固定用户记录 ID 保证唯一。一个连接授权本人现在及以后创建的全部游戏子账号；与原有绑定单个账号的 OpenAPI Token 分开存储和鉴权，不能用于写入接口，也不能扩权。入口支持 `/user/profile?connect=operator-match`。

管理接口使用站内 JWT，所有响应 `Cache-Control: no-store`：

| 方法 / 路径 | 结果 |
| --- | --- |
| `POST /user/operator-match/connections` | 创建，返回 `connection_id`、`token`（`ymatch_` 前缀） |
| `GET /user/operator-match/connections` | 本人的连接列表，仅 `connection_id`、`created_at` |
| `GET /user/operator-match/connections/{id}/secret` | 主动获取本人连接码 |
| `DELETE /user/operator-match/connections/{id}` | 立即撤销，不删除账号或档案 |

外部调用使用 `Authorization: Bearer <作业匹配连接码>`，沿用 `ApiResult` / snake_case：

| 方法 / 路径 | data |
| --- | --- |
| `GET /open-api/operator-match/accounts` | `{connection_id, accounts: [{id, name, game}]}` |
| `GET /open-api/operator-match/accounts/{accountId}/roster` | `{version: 1, connection_id, account, updated_at, operators}` |

每次请求重新校验连接与 Beta 资格，档案读取额外校验 `(userId, accountId)`。不保存「当前所选账号」，新增子账号无需换连接码；已删除、他人的账号一律 404。原有单账号 Token 不接受为匹配连接。

`operators` 按密探稳定 ID 索引，每项包含：`owned`、`level`、`elite`、`stars`、`panel`、`discs`（各套实际命盘的名称数组）、`main_stars`、`assist_stars`（当前佩戴名称，保留重复）。

- 化极由 YuanHub 现有 canonical 规则解析普通/SP/旧 31 等记录，再投影整星；未知保留 null。等级未知不当 0，已记录的修为 0 保留。
- `OperatorService.current` 合并 `*` / `universal` 和游戏专属记录，返回账号的实际游戏。命盘只取实际 `discs`，不读取目标配置，不拼盘。
- 星石从当前背包实例与佩戴槽位解析，仅 generation 一致时投影；不导出完整背包或目标。缺失佩戴无法证明满足要求。
- `panel` 返回 `status/attack/hp/reason`；只有持有 `OPERATOR_PANEL_USE` 权限且现有计算服务返回 `calculated` 才有数值。缺规则、缺输入或无权限不回退为零，也不使用可能过期的扫描/手动面板，不导出计算系数。
- 撤销阻止后续服务器读取，不能远程抹除接入方已缓存的副本。作业站提供「断开并清除本地档案」。

部署顺序：YuanHub 后端 → Share 后端 → 两站前端。生产默认上游 `https://api-hub.maayuan.com`；Share 服务端受控配置 `yuanhub.matcher.base-url` 可指定本地开发上游，客户端不能指定目标 URL。YuanHub 前端 `VITE_SHARE_URL` 仅控制打开作业站的链接。


### 作业编辑导入的兼容字段

roster 继续使用 `version: 1`，旧字段含义不变；每个密探增补：

- `disc_loadouts: [{id, name, discs: string[]}]`：命盘方案标识、名称与实际词条，不输出目标命盘；接入方选择一套后导入，不能跨方案拼接。
- `star_slots: {main1, main2, main3, support1, support2, support3} | null`：固定六槽，值为当前佩戴名称或空槽 `null`，允许同名星石。没有该密探佩戴记录、背包与佩戴 generation 不一致、或实例无法解析时整个字段为 `null`；不得将其解释为空装备。

这两个字段复用既有只读养成授权。攻击/生命仍遵守原有面板权限和 `calculated` 条件，不回退到扫描或手填数值。接入方需在导入前展示缺失字段，导入为一次快照复制，不回写 YuanHub。旧接入方可忽略新增字段；新版分享站读取旧响应时可使用原 `discs`，但不能从 `main_stars` / `assist_stars` 推测空槽位置。
